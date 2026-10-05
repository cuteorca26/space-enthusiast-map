import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));

test('cloud-mode server starts and serves the complete app and API without local caches', async t => {
  const portFinder = createServer();
  await new Promise(resolve => portFinder.listen(0, '127.0.0.1', resolve));
  const port = portFinder.address().port;
  await new Promise(resolve => portFinder.close(resolve));
  const data = await mkdtemp(join(tmpdir(), 'space-map-server-'));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, windowsHide: true,
    env: { ...process.env, HOST: '0.0.0.0', PORT: String(port), DATA_DIR: data, BALLISTIC_WORKERS: '1',
      ADMIN_SECRET_SHA256: '', PUBLIC_DATA_REPOSITORY: '', GITHUB_DATA_TOKEN: '' } });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    await rm(data, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${log}`)), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Startup failed (${code}): ${log}`)); });
    child.stdout.on('data', () => { if (log.includes('Serving Space Enthusiast Map')) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/msa-warnings?refresh=1`)).status, 401);
  const missingLogin = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"secret":"test"}' });
  assert.equal(missingLogin.status, 503);
  for (const path of ['/api/restrictions?status=1', '/api/satellites?status=1', '/api/msa-warnings?status=1']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(await response.json());
  }
  const page = await (await fetch(`${base}/`)).text();
  assert.ok(page.includes('航天爱好者地图'));
  assert.ok(page.includes('/deployment-config.js'));
  assert.ok((await (await fetch(`${base}/deployment-config.js`)).text()).includes('"online":true'));
  for (const path of ['/frontend/app.js', '/frontend/satellite-orbit-worker.js', '/node_modules/three/build/three.module.js',
    '/node_modules/three/build/three.core.js', '/node_modules/satellite.js/dist/index.js', '/node_modules/jszip/dist/jszip.min.js']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  for (const path of ['/api/restrictions?details=0&tfr=0', '/api/hydropac', '/api/msa-warnings', '/api/navarea-warnings',
    '/api/launches', '/api/satellites', '/api/refresh-history', '/api/sources']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok(await response.json());
  }
  assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/data/saved_regions.json`)).status, 404);
  const parse = await fetch(`${base}/api/notam/parse`, { method: 'POST', headers: { 'content-type': 'text/plain' },
    body: 'AIRSPACE AREA BOUNDED BY 300000N 1100000E 300000N 1110000E 310000N 1110000E 300000N 1100000E. SFC-UNL.' });
  assert.equal(parse.status, 200);
  assert.ok((await parse.json()).parsed);
  const blocked = await fetch(`${base}/api/notam/parse`, { method: 'POST', headers: { origin: 'https://other.example' }, body: 'test' });
  assert.equal(blocked.status, 403);
  const oversized = await fetch(`${base}/api/notam/parse`, { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(oversized.status, 413);
});
