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

test('restart retains all daily history and can load an evicted body; deleted history never returns', async t => {
  const f = await fixture(t); await f.client().check();
  const indexFile = join(f.target, 'refresh_history_index.json');
  const index = JSON.parse(await readFile(indexFile));
  const deletedId = index.sources.navarea[0].id; index.sources.navarea = [];
  await writeFile(indexFile, JSON.stringify(index));
  await rm(join(f.target, DAILY_SOURCES.navarea.directory, deletedId));
  const backup = join(f.root, 'backup.gz'), saved = await packPublicData(f.target, backup);
  // Three latest caches, a small index and an import ledger; historical bodies
  // live in their immutable assets and do not inflate every public backup.
  assert.equal(saved.files, 5);
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
