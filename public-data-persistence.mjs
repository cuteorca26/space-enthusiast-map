import { createReadStream, createWriteStream, watch } from 'node:fs';
import { mkdir, open, readdir, lstat, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

const MAGIC = Buffer.from('SPACE-MAP-DATA-1\n');
const MAX_ARCHIVE = 1900 * 1024 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024 * 1024;
const TAG = 'public-map-data';
const CACHE_FILES = new Set(['faa_notam_cache.json', 'faa_fir_designators_cache.json', 'nga_hydropac_cache.json',
  'nga_hydropac_all_cache.json', 'msa_nav_warning_cache.json', 'navarea_warning_cache.json',
  'satellite_catalog_cache.json', 'launch_forecast_cache.json', 'refresh_history_index.json', 'cloud_cache/gmgsi_timeline_cache.json']);
const SNAPSHOTS = /^(faa_notam_snapshots|hydropac_snapshots|msa_nav_warning_snapshots|navarea_warning_snapshots|satellite_catalog_snapshots)\/[\w.-]+\.json$/;
export function isPublicDataPath(path) {
  return typeof path === 'string' && !path.includes('..') && !path.includes('\\') &&
    (CACHE_FILES.has(path) || SNAPSHOTS.test(path) || /^cloud_cache\/gmgsi\/\d{10}\.nc$/.test(path));
}
async function publicFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile() && isPublicDataPath(path)) result.push(path);
    else if (entry.isDirectory() && /^(cloud_cache(?:\/gmgsi)?|faa_notam_snapshots|hydropac_snapshots|msa_nav_warning_snapshots|navarea_warning_snapshots|satellite_catalog_snapshots)$/.test(path))
      result.push(...await publicFiles(directory, path));
  }
  return result.sort();
}
function sizePrefix(size) { const value = Buffer.alloc(4); value.writeUInt32BE(size); return value; }
export async function packPublicData(directory, output) {
  const paths = await publicFiles(directory);
  if (paths.length > 3000) throw new Error('Public snapshot file limit reached');
  let total = 0;
  async function* records() {
    yield MAGIC;
    for (const path of paths) {
      const full = join(directory, path);
      if ((await lstat(full)).isSymbolicLink()) throw new Error('Public data must not be a symbolic link');
      const handle = await open(full, 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_ARCHIVE || (total += stat.size) > MAX_TOTAL) throw new Error('Public data size limit reached');
        const header = Buffer.from(JSON.stringify({ path, size: stat.size }));
        yield sizePrefix(header.length); yield header;
        let copied = 0;
        for await (const chunk of handle.createReadStream({ autoClose: false })) { copied += chunk.length; yield chunk; }
        if (copied !== stat.size) throw new Error('Public data changed during backup');
      } finally { await handle.close(); }
    }
    yield sizePrefix(0);
  }
  let bytes = 0;
  const hash = createHash('sha256');
  const meter = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    if (bytes > MAX_ARCHIVE) return callback(new Error('Compressed snapshot exceeds the release asset limit'));
    hash.update(chunk); callback(null, chunk);
  } });
  try { await pipeline(Readable.from(records()), createGzip({ level: 1 }), meter, createWriteStream(output, { flags: 'wx' })); }
  catch (error) { await rm(output, { force: true }); throw error; }
  return { sha256: hash.digest('hex'), bytes, files: paths.length, totalBytes: total };
}

// Decode incrementally into a staging directory. No file is applied before the
// entire compressed archive, checksum, paths and declared lengths are valid.
export async function unpackPublicData(input, directory, expectedHash) {
  const staging = join(directory, `.restore-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    if (bytes > MAX_ARCHIVE) return callback(new Error('Public snapshot is too large'));
    hash.update(chunk); callback(null, chunk);
  } });
  const gunzip = createGunzip();
  const transfer = pipeline(input, meter, gunzip);
  transfer.catch(() => {});
  const iterator = gunzip[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  async function read(size) {
    while (pending.length < size) {
      const next = await iterator.next();
      if (next.done) throw new Error('Public snapshot is incomplete');
      pending = pending.length ? Buffer.concat([pending, next.value]) : next.value;
    }
    const value = pending.subarray(0, size); pending = pending.subarray(size); return value;
  }
  const paths = new Set();
  let total = 0;
  try {
    if (!(await read(MAGIC.length)).equals(MAGIC)) throw new Error('Unknown public snapshot format');
    for (;;) {
      const length = (await read(4)).readUInt32BE();
      if (!length) break;
      if (length > 4096 || paths.size >= 3000) throw new Error('Invalid public snapshot metadata');
      const { path, size } = JSON.parse((await read(length)).toString('utf8'));
      if (!isPublicDataPath(path) || paths.has(path) || !Number.isSafeInteger(size) || size < 0 || size > MAX_ARCHIVE || (total += size) > MAX_TOTAL)
        throw new Error('Invalid public snapshot file');
      paths.add(path);
      const target = join(staging, path);
      await mkdir(dirname(target), { recursive: true });
      const handle = await open(target, 'wx');
      try {
        for (let left = size; left > 0;) {
          const chunk = await read(Math.min(left, 64 * 1024));
          for (let offset = 0; offset < chunk.length;) {
            const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
            if (!bytesWritten) throw new Error('Public snapshot could not be written');
            offset += bytesWritten;
          }
          left -= chunk.length;
        }
      } finally { await handle.close(); }
    }
    if (pending.length || !(await iterator.next()).done) throw new Error('Unexpected trailing snapshot data');
    await transfer;
    if (hash.digest('hex') !== expectedHash) throw new Error('Public snapshot checksum mismatch');
    for (const path of await publicFiles(directory)) if (!paths.has(path)) await rm(join(directory, path), { force: true });
    for (const path of paths) {
      const target = join(directory, path);
      // Refuse to follow existing symlink parents, even inside the data root.
      let current = directory;
      for (const part of path.split('/').slice(0, -1)) {
        current = join(current, part);
        try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Unsafe restore directory'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      await mkdir(dirname(target), { recursive: true });
      await rm(target, { force: true });
      await rename(join(staging, path), target);
    }
    return { files: paths.size, totalBytes: total };
  } catch (error) {
    gunzip.destroy(error); input.destroy?.(error); await transfer.catch(() => {}); throw error;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export function createPublicDataPersistence({ directory, enabled = false, repository = '', token = '', fetchImpl = fetch } = {}) {
  const configured = enabled && /^[\w.-]+\/[\w.-]+$/.test(repository);
  const writable = Boolean(configured && token);
  const base = `https://api.github.com/repos/${repository}`;
  let state = configured ? 'restoring' : 'unconfigured';
  let savedAt = null;
  let lastError = '';
  let timer;
  let watcher;
  let running;
  let dirty = false;
  let stopped = false;
  let lastHash = '';
  let restored = !configured;
  const status = () => ({ configured: Boolean(configured), writable, state, savedAt, error: Boolean(lastError),
    message: state === 'restoring' ? '正在从长期备份恢复服务器数据…' :
      state === 'saving' ? '正在保存长期备份，访客仍可读取当前缓存。' :
      lastError ? '长期备份未成功，当前数据仍保存在服务器。请管理员检查连接。' :
      savedAt ? `公共数据已长期保存：${savedAt}` :
      writable ? '长期存储已连接，等待管理员刷新数据。' : '长期备份尚未连接，当前缓存仍会受服务器休眠影响。' });
  async function api(path, options = {}) {
    const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'space-enthusiast-map', ...(options.headers || {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${base}${path}`, { ...options, headers, signal: AbortSignal.timeout(options.upload ? 300000 : 30000) });
    if (!response.ok) { await response.body?.cancel(); const error = new Error(`GitHub data storage HTTP ${response.status}`); error.status = response.status; throw error; }
    return response.status === 204 ? null : response.json();
  }
  function pointer(release) {
    try {
      const value = JSON.parse(release.body || '{}');
      return value.format === 1 && /^[a-f0-9]{64}$/.test(value.sha256) && value.name === `public-data-${value.sha256}.pack.gz` ? value : null;
    } catch { return null; }
  }
  async function release(create = false) {
    try { return await api(`/releases/tags/${TAG}`); }
    catch (error) {
      if (error.status !== 404 || !create) throw error;
      return api('/releases', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tag_name: TAG, name: '地图公共数据备份', body: '{}', prerelease: true, make_latest: 'false' }) });
    }
  }
  const ready = (async () => {
    await mkdir(directory, { recursive: true });
    if (!configured) return;
    try {
      const remote = await release();
      const snapshot = pointer(remote);
      if (snapshot) {
        const url = `https://github.com/${repository}/releases/download/${TAG}/${snapshot.name}`;
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(300000) });
        if (!response.ok || !response.body) throw new Error(`Public backup download HTTP ${response.status}`);
        await unpackPublicData(Readable.fromWeb(response.body), directory, snapshot.sha256);
        savedAt = snapshot.savedAt; lastHash = snapshot.sha256;
      }
      restored = true;
    } catch (error) {
      if (error.status === 404) restored = true;
      else { lastError = error.message; console.error('Public data restore:', error.message); }
    }
    finally { state = 'idle'; }
  })();
  async function save() {
    await ready;
    if (!writable) return;
    if (!restored) { lastError = 'Restore must succeed before a backup can replace saved data'; return; }
    state = 'saving';
    const archive = join(directory, `.backup-${randomUUID()}.tmp`);
    try {
      const packed = await packPublicData(directory, archive);
      if (!packed.files || packed.sha256 === lastHash) return;
      const remote = await release(true);
      const old = pointer(remote);
      const name = `public-data-${packed.sha256}.pack.gz`;
      const uploads = `https://uploads.github.com/repos/${repository}/releases/${remote.id}/assets?name=${name}`;
      const response = await fetchImpl(uploads, { method: 'POST', headers: { authorization: `Bearer ${token}`,
        'content-type': 'application/octet-stream', 'content-length': String(packed.bytes), 'user-agent': 'space-enthusiast-map' },
        body: createReadStream(archive), duplex: 'half', signal: AbortSignal.timeout(300000) });
      let asset;
      if (response.status === 422) {
        await response.body?.cancel();
        const existing = await api(`/releases/${remote.id}/assets?per_page=100`);
        asset = existing.find(item => item.name === name && item.size === packed.bytes && (!item.digest || item.digest === `sha256:${packed.sha256}`));
        if (!asset) throw new Error('Public backup asset name conflict');
      } else {
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Public backup upload HTTP ${response.status}`); }
        asset = await response.json();
      }
      const next = { format: 1, ...packed, name, assetId: asset.id, savedAt: new Date().toISOString() };
      await api(`/releases/${remote.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: JSON.stringify(next), make_latest: 'false' }) });
      // The published pointer switches only after the new archive is complete.
      savedAt = next.savedAt; lastHash = next.sha256; lastError = '';
      if (old?.assetId && old.assetId !== asset.id && remote.assets?.some(item => item.id === old.assetId && item.name === old.name)) {
        await api(`/releases/assets/${old.assetId}`, { method: 'DELETE' }).catch(() => {});
      }
    } catch (error) { lastError = error.message; console.error('Public data backup:', error.message); }
    finally { state = 'idle'; await rm(archive, { force: true }); }
  }
  function schedule() {
    if (!writable || stopped) return;
    dirty = true; clearTimeout(timer);
    timer = setTimeout(() => { timer = null; flush(); }, 10000);
    timer.unref?.();
  }
  async function flush() {
    await ready;
    clearTimeout(timer); timer = null;
    if (running) { dirty = true; await running; return flush(); }
    dirty = false;
    running = save(); await running; running = null;
    if (dirty) schedule();
    return status();
  }
  ready.then(() => {
    if (!writable || stopped) return;
    try {
      watcher = watch(directory, { recursive: true }, (event, file) => { if (isPublicDataPath(String(file || '').replaceAll('\\', '/'))) schedule(); });
      watcher.on('error', () => { lastError = 'Public data watcher failed'; });
      schedule();
    } catch { lastError = 'Public data watcher failed'; }
  });
  return { ready, status, schedule, flush, close() { stopped = true; clearTimeout(timer); watcher?.close(); } };
}
