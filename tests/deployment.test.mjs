import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadCloudFile, publicFilePath, runtimeSettings, sameOriginWrite } from '../deployment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('local defaults and cloud PORT/HOST/DATA_DIR work', () => {
  assert.equal(runtimeSettings(root, {}, []).host, '127.0.0.1');
  assert.equal(runtimeSettings(root, {}, []).online, false);
  const cloud = runtimeSettings(root, { HOST: '0.0.0.0', PORT: '10000', DATA_DIR: join(tmpdir(), 'space-map') }, []);
  assert.equal(cloud.port, 10000);
  assert.equal(cloud.online, true);
  assert.equal(runtimeSettings(root, { PORT: '10000' }, ['--port=10075']).port, 10075);
  assert.throws(() => runtimeSettings(root, { PORT: '-1' }, []));
});

test('only browser assets are public; source, runtime data and traversal are blocked', () => {
  assert.ok(publicFilePath(root, '/'));
  assert.ok(publicFilePath(root, '/frontend/app.js?v=1'));
  assert.ok(publicFilePath(root, '/node_modules/three/build/three.module.js'));
  assert.ok(publicFilePath(root, '/node_modules/three/build/three.core.js'));
  assert.ok(publicFilePath(root, '/node_modules/satellite.js/dist/index.js'));
  for (const path of ['/server.mjs', '/package.json', '/.env', '/data/saved_regions.json',
    '/frontend/../server.mjs', '/frontend/%2e%2e/server.mjs', '/frontend/%5c..%5cserver.mjs',
    '/frontend/%00', '/frontend/%zz', '/node_modules/h5wasm/package.json']) {
    assert.equal(publicFilePath(root, path), null, path);
  }
});

test('same-origin HTTPS writes work behind the hosting proxy', () => {
  assert.equal(sameOriginWrite({ headers: { origin: 'https://space-map.onrender.com', host: 'space-map.onrender.com' } }), true);
  assert.equal(sameOriginWrite({ headers: { origin: 'http://127.0.0.1:10075', host: '127.0.0.1:10075' } }), true);
  assert.equal(sameOriginWrite({ headers: { origin: 'https://other.example', host: 'space-map.onrender.com' } }), false);
});

test('cloud download streams to disk and preserves the last good file on failure', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'space-cloud-test-'));
  const server = createServer((req, res) => {
    if (req.url === '/ok') res.end(Buffer.alloc(4096, 7));
    else if (req.url === '/small') res.end('broken');
    else { res.writeHead(503); res.end('unavailable'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const file = join(directory, 'cloud.nc');
  await downloadCloudFile(`${base}/ok`, file, { minimumBytes: 1000 });
  assert.equal((await readFile(file)).length, 4096);
  await assert.rejects(downloadCloudFile(`${base}/small`, file, { minimumBytes: 1000 }));
  await assert.rejects(downloadCloudFile(`${base}/fail`, file, { minimumBytes: 1000 }));
  assert.equal((await readFile(file))[0], 7);
  assert.deepEqual(await readdir(directory), ['cloud.nc']);
});
