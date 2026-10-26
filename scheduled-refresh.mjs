import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { unpackPublicData } from './public-data-persistence.mjs';
import { DAILY_RETRY_DELAY_MS, MAX_DAILY_ATTEMPTS } from './daily-refresh-policy.mjs';
import { preparedNotamFiles, copyPreparedNotam } from './prepared-notam.mjs';

export const DAILY_SOURCES = {
  notam: { cache: 'faa_notam_cache.json', directory: 'faa_notam_snapshots' },
  hydropac: { cache: 'nga_hydropac_cache.json', directory: 'hydropac_snapshots' },
  navarea: { cache: 'navarea_warning_cache.json', directory: 'navarea_warning_snapshots' },
  msa: { cache: 'msa_nav_warning_cache.json', directory: 'msa_nav_warning_snapshots' },
};
export const DAILY_START_YEAR = 2026;
const ASSET = /^daily-(\d{4})-(\d{14})-(\d+)-(\d+)-([a-f0-9]{64})\.pack\.gz$/;
const STATE_FILE = 'scheduled_refresh_state.json';
const INDEX_FILE = 'refresh_history_index.json';
function readJson(file, fallback) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } }
function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value)); renameSync(temporary, file);
}
export function dailyAssetName({ at = new Date(), runId, attempt = 1, sha256 }) {
  if (!/^\d+$/.test(String(runId)) || !/^\d+$/.test(String(attempt)) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid daily publication identity');
  return `daily-${at.getUTCFullYear()}-${at.toISOString().replace(/\D/g, '').slice(0, 14)}-${runId}-${attempt}-${sha256}.pack.gz`;
}
export function validDailyAsset(asset) {
  return asset?.state === 'uploaded' && ASSET.test(asset.name) && Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size < 1900 * 1024 * 1024;
}

function validateDailyReport(report) {
  if (report === undefined) return;
  const rows = report?.results;
  if (!Array.isArray(rows) || !rows.length || rows.length > Object.keys(DAILY_SOURCES).length ||
    new Set(rows.map(row => row?.source)).size !== rows.length ||
    rows.some(row => !Object.hasOwn(DAILY_SOURCES, row?.source) || !['success', 'failed'].includes(row.status)))
    throw new Error('Invalid daily outcome report');
  // Keep already-published three-source archives readable.
  if (report.version === 1 && [3, 4].includes(rows.length)) return;
  if (report.version !== 2 || !/^\d+-\d+$/.test(report.cycleId) || !Number.isFinite(Date.parse(report.cycleStartedAt)))
    throw new Error('Invalid daily cycle');
  if (report.manualRequestId !== undefined && (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(report.manualRequestId) || rows.length!==1))
    throw new Error('Invalid manual refresh identity');
  for (const row of rows) {
    const start = Date.parse(row.startedAt), end = Date.parse(row.finishedAt);
    const retry = row.status === 'failed' && row.attempt < MAX_DAILY_ATTEMPTS;
    if (!Number.isInteger(row.attempt) || row.attempt < 1 || row.attempt > MAX_DAILY_ATTEMPTS ||
      row.maxAttempts !== MAX_DAILY_ATTEMPTS || !Number.isFinite(start) || !Number.isFinite(end) || end < start ||
      (retry ? !Number.isFinite(Date.parse(row.nextRetryAt)) || Date.parse(row.nextRetryAt) < end + DAILY_RETRY_DELAY_MS : row.nextRetryAt !== null) ||
      row.retryExhausted !== (row.status === 'failed' && !retry)) throw new Error('Invalid hourly retry outcome');
  }
}

function mergeDailyStatus(state, report, imported, at) {
  if(report?.manualRequestId){
    const records=state.manualResults||[],old=records.find(r=>r.requestId===report.manualRequestId),result=report.results[0];
    if(!old||(old.result.status!=='success'&&result.attempt>=old.result.attempt)){
      state.manualResults=[{requestId:report.manualRequestId,cycleId:report.cycleId,cycleStartedAt:report.cycleStartedAt,result},
        ...records.filter(r=>r.requestId!==report.manualRequestId)].sort((a,b)=>b.cycleStartedAt.localeCompare(a.cycleStartedAt)).slice(0,30);
    }
    return;
  }
  const cycleAt = report?.version === 2 ? report.cycleStartedAt : at;
  const cycleId = report?.version === 2 ? report.cycleId : `legacy-${at}`;
  if (Date.parse(cycleAt) < Date.parse(state.cycleStartedAt || state.lastRunAt || '1970-01-01')) return;
  const rows = report?.results || Object.keys(DAILY_SOURCES).map(source => ({ source, status: imported.includes(source) ? 'success' : 'failed' }));
  const previous = state.cycleId === cycleId ? state.lastResults || [] : [];
  const merged = new Map(previous.map(row => [row.source, row]));
  for (const row of rows) {
    const old = merged.get(row.source);
    // Sources finish independently. Ignore an older retry arriving out of order,
    // and never downgrade a source that already succeeded in this cycle.
    if (!old || (old.status !== 'success' && (row.attempt || 0) >= (old.attempt || 0))) merged.set(row.source, row);
  }
  state.cycleId = cycleId; state.cycleStartedAt = cycleAt;
  state.lastResults = [...merged.values()];
  state.lastSources = state.lastResults.filter(row => row.status === 'success').map(row => row.source);
}

// Commit already-validated downloads in one synchronous section. A concurrent
// manual refresh or deletion cannot interleave index updates with this section.
// Applied asset identities are saved with the normal durable public backup.
export function applyDailyArchive(directory, staging, assetName, now = new Date().toISOString()) {
  if (!ASSET.test(assetName)) throw new Error('Invalid daily asset name');
  const state = readJson(join(directory, STATE_FILE), { version: 1, applied: [] });
  if (!Array.isArray(state.applied)) throw new Error('Invalid daily import state');
  if (state.applied.includes(assetName)) return { applied: false, sources: [] };
  const incoming = readJson(join(staging, INDEX_FILE), null);
  if (incoming?.version !== 3 || !incoming.sources) throw new Error('Daily archive has no valid history index');
  const results = incoming.dailyReport?.results;
  validateDailyReport(incoming.dailyReport);
  const index = readJson(join(directory, INDEX_FILE), { version: 3, sources: { notam: [], hydropac: [], navarea: [], msa: [], satellite: [] } });
  if (index.version !== 3 || !index.sources) throw new Error('Existing history index needs migration before daily import');
  const operations = [], imported = [];
  let updatePreparedManifest=false;
  const prepared=preparedNotamFiles(staging);
  for (const [source, config] of Object.entries(DAILY_SOURCES)) {
    const records = incoming.sources[source] ?? (source === 'msa' ? [] : undefined);
    if (!Array.isArray(records) || records.length > 1) throw new Error(`Invalid ${source} daily history`);
    if (!records.length) continue;
    const record = records[0];
    if (record.source !== source || !/^[\w.-]+\.json$/.test(record.id) || record.id.includes('..') ||
      record.latest || !Number.isFinite(Date.parse(record.savedAt)) || !Number.isFinite(record.total) || record.total < 0) throw new Error('Invalid daily snapshot record');
    const relative = `${config.directory}/${record.id}`;
    if (!existsSync(join(staging, relative)) || !existsSync(join(staging, config.cache))) throw new Error(`Incomplete ${source} daily snapshot`);
    const allowed = new Set([record.id]);
    if (readdirSync(join(staging, config.directory)).some(id => !allowed.has(id))) throw new Error('Unexpected daily snapshot');
    const stored = Array.isArray(index.sources[source]) ? index.sources[source] : [];
    // Compare with the latest saved record, without parsing large warning bodies.
    const newest = stored.reduce((time, item) => Math.max(time, Date.parse(item.savedAt) || 0), 0);
    operations.push({ from: join(staging, relative), to: join(directory, relative) });
    if (Date.parse(record.savedAt) > newest) operations.push({ from: join(staging, config.cache), to: join(directory, config.cache) });
    if(source==='notam'&&Date.parse(record.savedAt)>newest)updatePreparedManifest=true;
    index.sources[source] = [{ ...record, automatic: !incoming.dailyReport?.manualRequestId, dailyAsset: assetName }, ...stored.filter(item => item.id !== record.id)].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    imported.push(source);
  }
  if (!imported.length && !results) throw new Error('Daily archive has no successful sources');
  if (results && (results.some(row => (row.status === 'success') !== imported.includes(row.source)) ||
    imported.some(source => !results.some(row => row.source === source && row.status === 'success')))) throw new Error('Daily outcome does not match saved sources');
  if(prepared.length&&!imported.includes('notam'))throw Error('Prepared responses without NOTAM snapshot');
  if(prepared.length)copyPreparedNotam(staging,directory,{current:updatePreparedManifest});
  for (const item of operations) {
    mkdirSync(join(item.to, '..'), { recursive: true });
    renameSync(item.from, item.to);
  }
  index.updatedAt = now;
  atomicJson(join(directory, INDEX_FILE), index);
  state.applied.push(assetName); state.lastImportedAt = now;
  const at = assetName.match(ASSET)[2].replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z');
  mergeDailyStatus(state, incoming.dailyReport, imported, at);
  state.lastRunAt = !state.lastRunAt || at > state.lastRunAt ? at : state.lastRunAt;
  atomicJson(join(directory, STATE_FILE), state);
  trimDailyBodies(directory, index);
  return { applied: true, sources: imported };
}

function trimDailyBodies(directory, index, protectedId = '') {
  const files = [];
  for (const [source, config] of Object.entries(DAILY_SOURCES)) for (const record of index.sources[source] || []) {
    const file = join(directory, config.directory, record.id);
    if (!ASSET.test(record.dailyAsset || '') || !existsSync(file)) continue;
    files.push({ file, record, stat: statSync(file) });
  }
  let bytes = 0;
  for (const item of files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)) {
    bytes += item.stat.size;
    if (bytes > 256 * 1024 * 1024 && item.record.id !== protectedId) {
      try { unlinkSync(item.file); } catch { /* Disposable local copy; the Release remains authoritative. */ }
    }
  }
}

export function createScheduledRefresh({ directory, repository, enabled = false, token = '', ready = Promise.resolve(),
  fetchImpl = fetch, beforeApply = async () => {}, afterApply = async () => {}, intervalMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const configured = enabled && /^[\w.-]+\/[\w.-]+$/.test(repository || '');
  let running, lastCheck = 0, error = '', timer;
  const downloads = new Map();
  const status = () => {
    const state = readJson(join(directory, STATE_FILE), {});
    return { enabled: Boolean(configured), active: Boolean(running), schedule: '每天北京时间 15:37（UTC 07:37）',
      sources: Object.keys(DAILY_SOURCES), lastCheckAt: lastCheck ? new Date(lastCheck).toISOString() : null,
      lastImportedAt: state.lastImportedAt || null, lastRunAt: state.lastRunAt || null,
      cycleStartedAt: state.cycleStartedAt || null, retryDelayMinutes: 60, maxRetries: 2,
      lastSources: state.lastSources || [], lastResults: state.lastResults || [], error: Boolean(error) };
  };
  async function api(path) {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'space-enthusiast-map' };
    if (token) headers.authorization = `Bearer ${token}`;
    const url = `https://api.github.com/repos/${repository}${path}`;
    let response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30000) });
    if (token && [401, 403].includes(response.status)) {
      await response.body?.cancel(); delete headers.authorization;
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30000) });
    }
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Daily index HTTP ${response.status}`); }
    return response.json();
  }
  async function sync() {
    await ready;
    const applied = new Set(readJson(join(directory, STATE_FILE), { applied: [] }).applied || []);
    const candidates = [];
    for (let year = DAILY_START_YEAR; year <= new Date(now()).getUTCFullYear(); year++) {
      const release = await api(`/releases/tags/scheduled-map-data-${year}`);
      if (!release) continue;
      for (let page = 1; ; page++) {
        const assets = await api(`/releases/${release.id}/assets?per_page=100&page=${page}`);
        if (!Array.isArray(assets)) throw new Error('Invalid daily release index');
        for (const asset of assets) if (validDailyAsset(asset) && !applied.has(asset.name)) candidates.push({ ...asset, year });
        if (assets.length < 100) break;
      }
    }
    for (const asset of candidates.sort((a, b) => a.name.localeCompare(b.name))) {
      const staging = join(directory, `.daily-${randomUUID()}`);
      await mkdir(staging, { recursive: true });
      try {
        const response = await fetchImpl(`https://github.com/${repository}/releases/download/scheduled-map-data-${asset.year}/${asset.name}`, { signal: AbortSignal.timeout(300000) });
        if (!response.ok || !response.body) throw new Error(`Daily download HTTP ${response.status}`);
        await unpackPublicData(Readable.fromWeb(response.body), staging, asset.name.match(ASSET)[5]);
        await beforeApply();
        const result = applyDailyArchive(directory, staging, asset.name, new Date(now()).toISOString());
        if (result.applied) await afterApply(result);
      } finally { await rm(staging, { recursive: true, force: true }); }
    }
    error = '';
  }
  function check({ force = false } = {}) {
    if (!configured) return Promise.resolve(status());
    if (running) return running;
    if (lastCheck && now() - lastCheck < (force ? 60000 : intervalMs)) return Promise.resolve(status());
    lastCheck = now();
    running = sync().catch(cause => { error = cause.message; console.error('Daily data import:', cause.message); })
      .finally(() => { running = null; }).then(status);
    return running;
  }
  function start() {
    if (!configured || timer) return;
    void check(); timer = setInterval(() => void check(), intervalMs); timer.unref?.();
  }
  async function ensureHistory(source, id) {
    if (!configured || !DAILY_SOURCES[source] || !/^[\w.-]+\.json$/.test(id || '') || id.includes('..')) return;
    const target = join(directory, DAILY_SOURCES[source].directory, id);
    if (existsSync(target)) return;
    const index = readJson(join(directory, INDEX_FILE), { sources: {} });
    const record = index.sources[source]?.find(item => item.id === id);
    if (!record || !ASSET.test(record.dailyAsset || '')) return;
    const key = `${source}/${id}`;
    if (downloads.has(key)) return downloads.get(key);
    const task = (async () => {
      const staging = join(directory, `.daily-${randomUUID()}`), match = record.dailyAsset.match(ASSET);
      await mkdir(staging, { recursive: true });
      try {
        const response = await fetchImpl(`https://github.com/${repository}/releases/download/scheduled-map-data-${match[1]}/${record.dailyAsset}`, { signal: AbortSignal.timeout(300000) });
        if (!response.ok || !response.body) throw new Error(`Historical daily download HTTP ${response.status}`);
        await unpackPublicData(Readable.fromWeb(response.body), staging, match[5]);
        // A deletion while the download was running wins.
        const current = readJson(join(directory, INDEX_FILE), { sources: {} });
        if (!current.sources[source]?.some(item => item.id === id && item.dailyAsset === record.dailyAsset)) return;
        const downloaded = join(staging, DAILY_SOURCES[source].directory, id);
        if (!existsSync(downloaded)) throw new Error('Daily history body missing');
        mkdirSync(join(target, '..'), { recursive: true }); renameSync(downloaded, target);
        if(source==='notam')copyPreparedNotam(staging,directory,{current:false});
        trimDailyBodies(directory, current, id);
      } finally { await rm(staging, { recursive: true, force: true }); }
    })().finally(() => downloads.delete(key));
    downloads.set(key, task); return task;
  }
  return { status, check, start, ensureHistory, close() { clearInterval(timer); } };
}
