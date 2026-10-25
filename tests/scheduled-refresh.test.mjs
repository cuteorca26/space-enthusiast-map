import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { packPublicData, unpackPublicData } from '../public-data-persistence.mjs';
import { createScheduledRefresh, applyDailyArchive, dailyAssetName, validDailyAsset, DAILY_SOURCES } from '../scheduled-refresh.mjs';

async function fixture(t, { sources = Object.keys(DAILY_SOURCES), date = '2026-10-17T07:40:00.000Z' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'daily-map-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = join(root, 'original'), target = join(root, 'target'); await mkdir(original); await mkdir(target);
  const index = { version: 3, sources: { notam: [], hydropac: [], navarea: [], msa: [], satellite: [] } };
  for (const source of sources) {
    const config = DAILY_SOURCES[source], id = `${source}_20261017074000000.json`;
    await mkdir(join(original, config.directory));
    const body = { savedAt: date, cacheKey: 'unchanged-parser', data: { restrictions: [{
      id: 'complex', rawText: '圆形和多边形原文', timeIntervals: [{ start: date, end: '2026-10-20T00:00:00Z' }],
      geometry: { type: 'MultiPolygon', coordinates: [[[[179, 20], [-179, 20], [-179, 21], [179, 20]]], [[[20, 30], [21, 30], [21, 31], [20, 30]]]] }, hasGeometry: true,
    }] } };
    await writeFile(join(original, config.directory, id), JSON.stringify(body));
    await writeFile(join(original, config.cache), JSON.stringify(body));
    index.sources[source].push({ id, source, savedAt: date, total: 1, drawable: 1, latest: false });
  }
  await writeFile(join(original, 'refresh_history_index.json'), JSON.stringify(index));
  const archive = join(root, 'daily.gz'), packed = await packPublicData(original, archive);
  const name = dailyAssetName({ at: new Date(date), runId: 12345, sha256: packed.sha256 });
  const bytes = await readFile(archive);
  let requests = 0, downloads = 0, clock = Date.parse(date);
  const asset = { id: 99, name, size: bytes.length, state: 'uploaded' };
  const fakeFetch = async url => {
    requests++;
    if (url.includes('/releases/download/')) { downloads++; return new Response(bytes); }
    if (url.includes('/releases/tags/')) return new Response(JSON.stringify({ id: 7 }));
    if (url.includes('/assets?')) return new Response(JSON.stringify([asset]));
    throw new Error(`Unexpected request ${url}`);
  };
  const client = (directory = target, extra = {}) => createScheduledRefresh({ directory, repository: 'owner/map', enabled: true, fetchImpl: fakeFetch, now: () => clock, ...extra });
  return { root, original, target, index, archive, packed, name, bytes, asset, client, fakeFetch,
    counts: () => ({ requests, downloads }), advance: () => { clock += 3600000; } };
}

test('daily import preserves exact source text, times and geometry; repeated checks are idempotent and throttled', async t => {
  const f = await fixture(t); const client = f.client();
  const [a, b] = await Promise.all([client.check(), client.check()]);
  assert.equal(a.error, false); assert.equal(b.error, false); assert.equal(f.counts().downloads, 1);
  for (const [source, config] of Object.entries(DAILY_SOURCES)) {
    const id = f.index.sources[source][0].id;
    assert.deepEqual(await readFile(join(f.target, config.directory, id)), await readFile(join(f.original, config.directory, id)));
    assert.deepEqual(await readFile(join(f.target, config.cache)), await readFile(join(f.original, config.cache)));
  }
  const before = f.counts(); await client.check({ force: true }); assert.deepEqual(f.counts(), before);
  f.advance(); await client.check(); assert.equal(f.counts().downloads, 1);
  const index = JSON.parse(await readFile(join(f.target, 'refresh_history_index.json')));
  assert.equal(index.sources.navarea.length, 1); assert.equal(index.sources.navarea[0].automatic, true);
});

test('an entirely failed day publishes its outcome without replacing any saved data', async t => {
  const f = await fixture(t, { sources: [] });
  const old = Buffer.from('{"data":"previous complete cache"}');
  await writeFile(join(f.target, DAILY_SOURCES.notam.cache), old);
  f.index.dailyReport = { version: 1, results: Object.keys(DAILY_SOURCES).map(source => ({ source, status: 'failed', message: 'upstream unavailable' })) };
  await writeFile(join(f.original, 'refresh_history_index.json'), JSON.stringify(f.index));
  const result = applyDailyArchive(f.target, f.original, f.name);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(await readFile(join(f.target, DAILY_SOURCES.notam.cache)), old);
  const state = JSON.parse(await readFile(join(f.target, 'scheduled_refresh_state.json')));
  assert.equal(state.lastResults.length, 4);
  assert.equal(state.lastResults[0].status, 'failed');
  assert.ok(state.lastRunAt);
  assert.equal(applyDailyArchive(f.target, f.original, f.name).applied, false);
});

test('a daily outcome cannot claim a failed source has a complete new snapshot', async t => {
  const f = await fixture(t);
  f.index.dailyReport = { version: 1, results: Object.keys(DAILY_SOURCES).map(source => ({ source, status: 'failed' })) };
  await writeFile(join(f.original, 'refresh_history_index.json'), JSON.stringify(f.index));
  assert.throws(() => applyDailyArchive(f.target, f.original, f.name), /does not match/);
  await assert.rejects(readFile(join(f.target, 'refresh_history_index.json')), /ENOENT/);
});

test('restart retains all daily history and can load an evicted body; deleted history never returns', async t => {
  const f = await fixture(t); await f.client().check();
  const indexFile = join(f.target, 'refresh_history_index.json');
  const index = JSON.parse(await readFile(indexFile));
  const deletedId = index.sources.navarea[0].id; index.sources.navarea = [];
  await writeFile(indexFile, JSON.stringify(index));
  await rm(join(f.target, DAILY_SOURCES.navarea.directory, deletedId));
  const backup = join(f.root, 'backup.gz'), saved = await packPublicData(f.target, backup);
  // Four latest caches, a small index and an import ledger; historical bodies
  // live in their immutable assets and do not inflate every public backup.
  assert.equal(saved.files, 6);
  const restored = join(f.root, 'restored'); await mkdir(restored);
  await unpackPublicData(createReadStream(backup), restored, saved.sha256);
  const client = f.client(restored); f.advance(); await client.check();
  assert.equal(f.counts().downloads, 1);
  const id = index.sources.notam[0].id;
  await Promise.all([client.ensureHistory('notam', id), client.ensureHistory('notam', id)]);
  assert.equal(f.counts().downloads, 2);
  assert.deepEqual(await readFile(join(restored, DAILY_SOURCES.notam.directory, id)), await readFile(join(f.original, DAILY_SOURCES.notam.directory, id)));
  await client.ensureHistory('navarea', deletedId);
  await assert.rejects(readFile(join(restored, DAILY_SOURCES.navarea.directory, deletedId)));
  assert.equal(JSON.parse(await readFile(join(restored, 'refresh_history_index.json'))).sources.navarea.length, 0);
});

test('a partial daily batch preserves other sources and a newer manual refresh', async t => {
  const f = await fixture(t, { sources: ['hydropac'] });
  await writeFile(join(f.target, 'nga_hydropac_cache.json'), 'newer manual data');
  const index = { version: 3, sources: { notam: [{ id: 'old', total: 12 }], hydropac: [{ id: 'manual.json', savedAt: '2026-10-18T00:00:00Z' }], navarea: [], msa: [], satellite: [] } };
  await writeFile(join(f.target, 'refresh_history_index.json'), JSON.stringify(index));
  const client = f.client(); await client.check(); assert.equal(client.status().error, false);
  assert.equal(await readFile(join(f.target, 'nga_hydropac_cache.json'), 'utf8'), 'newer manual data');
  const after = JSON.parse(await readFile(join(f.target, 'refresh_history_index.json')));
  assert.deepEqual(after.sources.notam, index.sources.notam); assert.equal(after.sources.hydropac.length, 2);
});

test('corrupt archives and invalid identities cannot change saved history', async t => {
  const f = await fixture(t); assert.equal(validDailyAsset(f.asset), true);
  for (const name of ['../escape', 'daily-evil.pack.gz', f.name.replace(/.$/, '/')]) assert.equal(validDailyAsset({ ...f.asset, name }), false);
  await writeFile(join(f.target, 'faa_notam_cache.json'), 'keep');
  const client = f.client(f.target, { fetchImpl: url => url.includes('/releases/download/') ? Promise.resolve(new Response(f.bytes.subarray(0, 30))) : f.fakeFetch(url) });
  await client.check(); assert.equal(client.status().error, true);
  assert.equal(await readFile(join(f.target, 'faa_notam_cache.json'), 'utf8'), 'keep');
  await assert.rejects(readFile(join(f.target, 'scheduled_refresh_state.json')));
});

test('invalid snapshot metadata is rejected before any file is applied', async t => {
  const f = await fixture(t);
  const invalid = { ...f.index, sources: { ...f.index.sources, navarea: [{ ...f.index.sources.navarea[0], id: '../escape.json' }] } };
  await writeFile(join(f.original, 'refresh_history_index.json'), JSON.stringify(invalid));
  assert.throws(() => applyDailyArchive(f.target, f.original, f.name), /Invalid daily snapshot/);
  await assert.rejects(readFile(join(f.target, 'faa_notam_cache.json')));
});

function retryReport(source, { attempt = 1, status = 'failed', cycleId = '12345-1',
  cycleStartedAt = '2026-10-17T07:37:00.000Z', finishedAt = '2026-10-17T07:40:00.000Z' } = {}) {
  const retry = status === 'failed' && attempt < 3;
  return { version: 2, cycleId, cycleStartedAt, results: [{ source, status, attempt, maxAttempts: 3,
    startedAt: new Date(Date.parse(finishedAt) - 60000).toISOString(), finishedAt,
    nextRetryAt: retry ? new Date(Date.parse(finishedAt) + 3600000).toISOString() : null,
    retryExhausted: status === 'failed' && !retry }] };
}

test('manual result imports preserve daily outcomes and history identity through success, late retry, and backup',async t=>{
 const first=await fixture(t,{sources:['msa']});
 first.index.dailyReport=retryReport('msa',{status:'success'});
 await writeFile(join(first.original,'refresh_history_index.json'),JSON.stringify(first.index));
 applyDailyArchive(first.target,first.original,first.name);
 const requestId='12345678-1234-4567-8901-123456789abc';
 for(const [i,status] of ['failed','success','failed'].entries()){
  const next=await fixture(t,{sources:status==='success'?['notam']:[],date:`2026-10-17T0${8+i}:40:00Z`.replace('T010','T10')});
  next.index.dailyReport={...retryReport('notam',{status,attempt:i===1?2:1}),manualRequestId:requestId};
  await writeFile(join(next.original,'refresh_history_index.json'),JSON.stringify(next.index));
  applyDailyArchive(first.target,next.original,next.name);
  const state=JSON.parse(await readFile(join(first.target,'scheduled_refresh_state.json')));
  assert.deepEqual(state.lastSources,['msa']);assert.equal(state.lastResults.length,1);
  assert.equal(state.manualResults[0].result.status,i===0?'failed':'success');
 }
 const index=JSON.parse(await readFile(join(first.target,'refresh_history_index.json')));
 assert.equal(index.sources.notam[0].automatic,false);assert.equal(index.sources.msa[0].automatic,true);
 const backup=join(first.root,'backup-manual.gz'),packed=await packPublicData(first.target,backup);
 const restored=join(first.root,'restored');await mkdir(restored);await unpackPublicData(createReadStream(backup),restored,packed.sha256);
 assert.deepEqual(JSON.parse(await readFile(join(restored,'refresh_history_index.json'))),index);
 assert.equal(JSON.parse(await readFile(join(restored,'scheduled_refresh_state.json'))).manualResults[0].result.status,'success');
});

test('independent source outcomes merge and MSA history survives backup and lazy restoration', async t => {
  const first = await fixture(t, { sources: ['msa'] });
  first.index.dailyReport = retryReport('msa', { status: 'success' });
  await writeFile(join(first.original, 'refresh_history_index.json'), JSON.stringify(first.index));
  applyDailyArchive(first.target, first.original, first.name);
  const second = await fixture(t, { sources: [], date: '2026-10-17T07:41:00.000Z' });
  second.index.dailyReport = retryReport('notam');
  await writeFile(join(second.original, 'refresh_history_index.json'), JSON.stringify(second.index));
  applyDailyArchive(first.target, second.original, second.name);
  const state = JSON.parse(await readFile(join(first.target, 'scheduled_refresh_state.json')));
  assert.deepEqual(state.lastSources, ['msa']); assert.equal(state.lastResults.length, 2);
  assert.equal(state.lastResults.find(row => row.source === 'notam').attempt, 1);
  const backup = join(first.root, 'msa-backup.gz'), packed = await packPublicData(first.target, backup);
  assert.equal(packed.files, 3); // Latest MSA cache, index and retry state; no growing history body.
  const restored = join(first.root, 'restored'); await mkdir(restored);
  await unpackPublicData(createReadStream(backup), restored, packed.sha256);
  assert.deepEqual(first.client(restored).status().lastResults, state.lastResults);
  const id = first.index.sources.msa[0].id;
  await first.client(restored).ensureHistory('msa', id);
  const originalBody = JSON.parse(await readFile(join(restored, DAILY_SOURCES.msa.directory, id)));
  assert.equal(originalBody.data.restrictions[0].geometry.type, 'MultiPolygon');
});

test('out-of-order retries cannot regress source status, and late previous cycles cannot replace a new day', async t => {
  const base = await fixture(t, { sources: [] });
  for (const [i, options] of [
    { attempt: 3, finishedAt: '2026-10-17T09:42:00.000Z' },
    { attempt: 1 },
    { cycleId: '22222-1', cycleStartedAt: '2026-10-18T07:37:00.000Z', finishedAt: '2026-10-18T07:40:00.000Z' },
    { attempt: 2, finishedAt: '2026-10-17T08:41:00.000Z' },
  ].entries()) {
    const f = await fixture(t, { sources: [] });
    f.index.dailyReport = retryReport('notam', options);
    await writeFile(join(f.original, 'refresh_history_index.json'), JSON.stringify(f.index));
    const name = dailyAssetName({ at: new Date('2026-10-18T10:00:00Z'), runId: 99900 + i, sha256: f.packed.sha256 });
    applyDailyArchive(base.target, f.original, name);
    const state = JSON.parse(await readFile(join(base.target, 'scheduled_refresh_state.json')));
    assert.equal(state.lastResults[0].attempt, i < 2 ? 3 : 1);
    if (i >= 2) assert.equal(state.cycleId, '22222-1');
  }
});

test('legacy three-source outcome archives are still readable after enabling MSA', async t => {
  const f = await fixture(t, { sources: ['notam', 'hydropac', 'navarea'] });
  delete f.index.sources.msa;
  f.index.dailyReport = { version: 1, results: ['notam', 'hydropac', 'navarea'].map(source => ({ source, status: 'success' })) };
  await writeFile(join(f.original, 'refresh_history_index.json'), JSON.stringify(f.index));
  const result = applyDailyArchive(f.target, f.original, f.name);
  assert.equal(result.sources.length, 3);
});

test('invalid retry times, counters and unreported snapshots are rejected before changing data', async t => {
  for (const change of [row => { row.attempt = 4; }, row => { row.nextRetryAt = row.finishedAt; },
    row => { row.retryExhausted = true; }, row => { row.startedAt = 'invalid'; }]) {
    const f = await fixture(t, { sources: [] }); f.index.dailyReport = retryReport('notam');
    change(f.index.dailyReport.results[0]);
    await writeFile(join(f.original, 'refresh_history_index.json'), JSON.stringify(f.index));
    assert.throws(() => applyDailyArchive(f.target, f.original, f.name), /retry outcome/);
    await assert.rejects(readFile(join(f.target, 'refresh_history_index.json')));
  }
  const f = await fixture(t, { sources: ['msa'] }); f.index.dailyReport = retryReport('notam');
  await writeFile(join(f.original, 'refresh_history_index.json'), JSON.stringify(f.index));
  assert.throws(() => applyDailyArchive(f.target, f.original, f.name), /does not match/);
});
