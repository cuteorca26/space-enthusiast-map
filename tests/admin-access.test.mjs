import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiresAdministrator } from '../admin-access.mjs';

test('public refresh and history deletion require a server-issued session; logout revokes it', async t => {
  const finder = createServer();
  await new Promise(resolve => finder.listen(0, '127.0.0.1', resolve));
  const port = finder.address().port;
  await new Promise(resolve => finder.close(resolve));
  const data = await mkdtemp(join(tmpdir(), 'space-admin-'));
  const secret = 'test-only-secret-not-for-production';
  const child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
    env: { ...process.env, HOST: '0.0.0.0', PORT: String(port), DATA_DIR: data, PUBLIC_DATA_REPOSITORY: '', GITHUB_DATA_TOKEN: '',
      ADMIN_SECRET_SHA256: createHash('sha256').update(secret).digest('hex'), BALLISTIC_WORKERS: '1' } });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    await rm(data, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(log)), 15000);
    child.once('error', reject); child.once('exit', code => reject(new Error('Startup '+code+': '+log)));
    child.stdout.on('data', () => { if (log.includes('Serving Space Enthusiast Map')) { clearTimeout(timeout); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const paths = ['/api/restrictions?refresh=1', '/api/hydropac?refresh=1', '/api/msa-warnings?refresh=1',
    '/api/navarea-warnings?refresh=1', '/api/launches?refresh=1', '/api/satellites?refresh=1', '/api/cloud-satellite?refresh=1',
    '/api/hydropac-history?date=2026-10-05&refresh=1', '/api/cloud-satellite?%72efresh=%31'];
  for (const path of paths) assert.equal((await fetch(base+path)).status, 401, path);
  const deletePath = base+'/api/refresh-history/item?source=msa&id=example.json';
  assert.equal((await fetch(deletePath, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(base+'/api/msa-warnings')).status, 200);
  assert.equal((await fetch(base+'/api/refresh-history')).status, 200);
  const publicCloud = await (await fetch(base+'/api/cloud-satellite')).json();
  assert.deepEqual(publicCloud.timeline, []);
  const publicHistory = await (await fetch(base+'/api/hydropac-history?date=2026-10-05')).json();
  assert.equal(publicHistory.source.cacheOnly, true);
  const initial = await (await fetch(base+'/api/admin/status')).json();
  assert.equal(initial.administrator, false); assert.equal(initial.configured, true);
  assert.ok(!JSON.stringify(initial).includes(secret));
  const login = value => fetch(base+'/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: value }) });
  assert.equal((await login('wrong')).status, 401);
  const response = await login(secret); assert.equal(response.status, 200);
  const session = await response.json();
  const headers = { authorization: 'Bearer '+session.token };
  assert.equal((await (await fetch(base+'/api/admin/status', { headers })).json()).administrator, true);
  // A nonexistent item proves the authorized request passed the permission gate without deleting real data.
  assert.equal((await fetch(deletePath, { method: 'DELETE', headers })).status, 404);
  assert.equal((await fetch(deletePath, { method: 'DELETE', headers: { ...headers, origin: 'https://other.example' } })).status, 403);
  await fetch(base+'/api/admin/logout', { method: 'POST', headers });
  assert.equal((await fetch(deletePath, { method: 'DELETE', headers })).status, 401);
  for (let i=0; i<8; i++) await login('wrong');
  assert.equal((await login(secret)).status, 429);
});

test('read-only public endpoints remain available and every refresh variant is protected', () => {
  for (const path of ['/api/msa-warnings', '/api/msa-warnings?status=1', '/api/refresh-history/item?source=msa&id=a.json'])
    assert.equal(requiresAdministrator('GET', new URL(path, 'https://example.com')), false);
  assert.equal(requiresAdministrator('DELETE', new URL('/api/refresh-history/item', 'https://example.com')), true);
  assert.equal(requiresAdministrator('GET', new URL('/api/cloud-satellite?refresh=1', 'https://example.com')), true);
});
