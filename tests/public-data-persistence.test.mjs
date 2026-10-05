import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { packPublicData, unpackPublicData, isPublicDataPath, createPublicDataPersistence } from '../public-data-persistence.mjs';

test('streamed public backups restore completely, exclude secrets, and reject tampering or traversal before replacing files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'space-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'); const target = join(root, 'target');
  await mkdir(join(source, 'msa_nav_warning_snapshots'), { recursive: true }); await mkdir(target);
  await writeFile(join(source, 'msa_nav_warning_cache.json'), '{"public":true}');
  await writeFile(join(source, 'msa_nav_warning_snapshots/a.json'), 'snapshot');
  await writeFile(join(source, 'saved_regions.json'), 'private coordinates');
  await writeFile(join(source, '.env'), 'private token');
  const archive = join(root, 'snapshot.pack.gz');
  const packed = await packPublicData(source, archive); assert.equal(packed.files, 2);
  await unpackPublicData(createReadStream(archive), target, packed.sha256);
  assert.equal(await readFile(join(target, 'msa_nav_warning_cache.json'), 'utf8'), '{"public":true}');
  await assert.rejects(readFile(join(target, 'saved_regions.json')));
  await writeFile(join(target, 'msa_nav_warning_cache.json'), 'keep existing');
  await assert.rejects(unpackPublicData(createReadStream(archive), target, '0'.repeat(64)), /checksum/);
  assert.equal(await readFile(join(target, 'msa_nav_warning_cache.json'), 'utf8'), 'keep existing');
  const header = Buffer.from(JSON.stringify({ path: '../escaped.json', size: 1 }));
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  const evil = gzipSync(Buffer.concat([Buffer.from('SPACE-MAP-DATA-1\n'), length, header, Buffer.from('x'), Buffer.alloc(4)]));
  await assert.rejects(unpackPublicData(Readable.from([evil]), target, createHash('sha256').update(evil).digest('hex')), /Invalid public/);
  await assert.rejects(readFile(join(root, 'escaped.json')));
  const truncated = (await readFile(archive)).subarray(0, packed.bytes - 8);
  await assert.rejects(unpackPublicData(Readable.from([truncated]), target, packed.sha256));
  for (const path of ['.env', 'saved_regions.json', 'satellite_history/account.json', '/msa_nav_warning_cache.json', 'cloud_cache/download.ps1'])
    assert.equal(isPublicDataPath(path), false, path);
});

test('a failed remote commit preserves the old backup; retry publishes the complete archive and deleted history stays deleted', async t => {
  const root = await mkdtemp(join(tmpdir(), 'space-remote-'));
  const source = join(root, 'source'); const target = join(root, 'target');
  await mkdir(join(source, 'msa_nav_warning_snapshots'), { recursive: true }); await mkdir(target);
  const assets = new Map(); let remote = null; let counter = 0; let failCommit = false;
  const result = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const fakeFetch = async (url, options = {}) => {
    const path = new URL(url).pathname; const method = options.method || 'GET';
    if (path.includes('/releases/download/')) {
      const item = [...assets.values()].find(asset => asset.name === path.split('/').pop());
      return item ? new Response(item.data) : result({}, 404);
    }
    if (path.endsWith('/releases/tags/public-map-data')) return remote ? result(remote) : result({}, 404);
    if (path.endsWith('/releases') && method === 'POST') { remote = { id: 1, body: '{}', assets: [] }; return result(remote); }
    if (path.endsWith('/assets') && method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      if ([...assets.values()].some(asset => asset.name === name)) return result({}, 422);
      const parts = []; for await (const chunk of options.body) parts.push(chunk);
      const data = Buffer.concat(parts); const asset = { id: ++counter, name, size: data.length, data };
      assets.set(asset.id, asset); remote.assets.push({ id: asset.id, name });
      return result({ id: asset.id, name, size: asset.size });
    }
    if (path.endsWith('/assets') && method === 'GET') return result([...assets.values()].map(({ data, ...asset }) => asset));
    if (path.endsWith('/releases/1') && method === 'PATCH') {
      if (failCommit) return result({}, 500);
      remote.body = JSON.parse(options.body).body; return result(remote);
    }
    if (method === 'DELETE') { assets.delete(Number(path.split('/').pop())); return new Response(null, { status: 204 }); }
    throw new Error('Unexpected mock storage operation '+method+' '+path);
  };
  const persistence = createPublicDataPersistence({ directory: source, enabled: true, repository: 'owner/map', token: 'test-only', fetchImpl: fakeFetch });
  t.after(async () => { persistence.close(); await rm(root, { recursive: true, force: true }); });
  await persistence.ready;
  await writeFile(join(source, 'msa_nav_warning_cache.json'), 'first');
  await writeFile(join(source, 'msa_nav_warning_snapshots/a.json'), 'history');
  await persistence.flush(); const original = remote.body;
  failCommit = true; await writeFile(join(source, 'msa_nav_warning_cache.json'), 'second');
  await persistence.flush(); assert.equal(remote.body, original);
  failCommit = false; await persistence.flush(); assert.notEqual(remote.body, original);
  await rm(join(source, 'msa_nav_warning_snapshots/a.json'));
  await persistence.flush();
  await mkdir(join(target, 'msa_nav_warning_snapshots')); await writeFile(join(target, 'msa_nav_warning_snapshots/a.json'), 'stale');
  const restoreFetch = (url, options = {}) => options.headers?.authorization === 'Bearer expired-test-only'
    ? result({}, 401) : fakeFetch(url, options);
  const restored = createPublicDataPersistence({ directory: target, enabled: true, repository: 'owner/map', token: 'expired-test-only', fetchImpl: restoreFetch });
  t.after(() => restored.close()); await restored.ready;
  assert.equal(await readFile(join(target, 'msa_nav_warning_cache.json'), 'utf8'), 'second');
  await assert.rejects(readFile(join(target, 'msa_nav_warning_snapshots/a.json')));
  assert.ok(restored.status().savedAt);
  assert.equal(restored.status().error, false, 'Expired write tokens must not prevent public restores');
  const committed = remote.body;
  await writeFile(join(target, 'msa_nav_warning_cache.json'), 'uncommitted');
  await restored.flush();
  assert.equal(restored.status().error, true, 'Expired tokens must not authorize new backups');
  assert.equal(remote.body, committed, 'An expired token must preserve the existing backup');
});
