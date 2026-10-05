import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('a slow maritime scan retries a disconnect, follows HTTP links, and publishes its complete result without blocking saved reads', async t => {
  const finder = createServer();
  await new Promise(resolve => finder.listen(0, '127.0.0.1', resolve));
  const port = finder.address().port;
  await new Promise(resolve => finder.close(resolve));
  const data = await mkdtemp(join(tmpdir(), 'space-background-test-'));
  const script = `
    import https from 'node:https';
    import http from 'node:http';
    import { EventEmitter } from 'node:events';
    import { Readable } from 'node:stream';
    import { syncBuiltinESMExports } from 'node:module';
    import { fileURLToPath } from 'node:url';
    const date = new Date().toISOString().slice(0,10);
    const index = '<li class="nav_lv2_list"><a href="https://www.msa.gov.cn/test/index.jhtml"><div class="nav_lv2_text">上海海事局</div></a></li>'+
      '<a href="http://www.msa.gov.cn/notice.jhtml"><span class="name">CNSEA10000/26 航警</span><span class="time">'+date+'</span></a>';
    const detail = '<meta name="ArticleTitle" content="CNSEA10000/26 航警"><meta name="PubDate" content="'+date+'"><meta name="ContentSource" content="上海海事局">'+
      '<p>航警区域 300000N 1100000E 300000N 1110000E 310000N 1110000E。SFC-UNL.</p>';
    let firstRequest = true;
    const mockGet = protocol => (url, options, callback) => {
      if (!String(url).startsWith(protocol)) throw new Error('The source link used the wrong HTTP transport');
      if (options.agent.protocol !== protocol) throw new Error('The source link used the wrong HTTP agent');
      const request = new EventEmitter();
      request.setTimeout = () => request;
      request.destroy = error => request.emit('error', error);
      if (firstRequest) {
        firstRequest = false;
        const connection = Object.assign(new Error('connection reset'), {code:'ECONNRESET'});
        setTimeout(() => request.emit('error', new AggregateError([connection], '')), 10);
        return request;
      }
      setTimeout(() => {
        const response = Readable.from([Buffer.from(String(url).includes('notice.jhtml') ? detail : index)]);
        response.statusCode = 200; response.headers = {};
        if (String(url).includes('94df14ce1110415da44e67593e76619f')) {
          response.statusCode = 302;
          response.headers.location = 'http://www.msa.gov.cn/start/index.jhtml';
        }
        callback(response);
      }, 1500);
      return request;
    };
    https.get = mockGet('https:');
    http.get = mockGet('http:');
    syncBuiltinESMExports();
    process.argv[1] = fileURLToPath(new URL('./server.mjs', import.meta.url));
    await import('./server.mjs');
  `;
  const child = spawn(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
    env: { ...process.env, HOST: '0.0.0.0', PORT: String(port), DATA_DIR: data, MEMORY_BUDGET_MODE: '1' },
  });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    await rm(data, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(log)), 15000);
    child.once('error', reject);
    child.once('exit', code => reject(new Error('Startup failed '+code+': '+log)));
    child.stdout.on('data', () => { if (log.includes('Serving Space Enthusiast Map')) { clearTimeout(timeout); resolve(); } });
  });
  const base = 'http://127.0.0.1:'+port;
  const started = Date.now();
  const response = await fetch(base+'/api/msa-warnings?refresh=1');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source.backgroundRefresh.active, true);
  assert.ok(Date.now()-started < 1500, 'The API waited for the slow upstream source');
  const status = await (await fetch(base+'/api/msa-warnings?status=1')).json();
  assert.equal(status.active, true);
  assert.equal((await fetch(base+'/api/health')).status, 200);
  assert.equal((await fetch(base+'/api/restrictions?details=0&tfr=0')).status, 200);
  let complete;
  for (let i=0; i<150; i++) {
    complete = await (await fetch(base+'/api/msa-warnings?status=1')).json();
    if (!complete.active) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(complete.lastRefresh?.status, 'success', log);
  const saved = await (await fetch(base+'/api/msa-warnings')).json();
  assert.equal(saved.source.status, 'ok');
  assert.equal(saved.source.scannedDetailPages, 1);
  assert.equal(saved.source.lookbackDays, 180);
});
