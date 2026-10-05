import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('MSA records keep exact text without retaining large downloaded HTML pages', async t => {
  const data = await mkdtemp(join(tmpdir(), 'space-msa-memory-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  const script = `
    import { parseMsaWarningDetail } from './server.mjs';
    import assert from 'node:assert/strict';
    global.gc();
    const before = process.memoryUsage().heapUsed;
    const records = [];
    for (let i = 0; i < 100; i++) {
      const title = 'CNSEA' + (10000+i) + '/26 China maritime warning';
      const body = '航警区域 300000N 1100000E 300000N 1110000E 310000N 1110000E。';
      const html = '<meta name="ArticleTitle" content="'+title+'"><meta name="ContentSource" content="中国上海海事局航行通告"><meta name="PubDate" content="2026-10-05">'+
        '<!--'+('x'.repeat(1000000))+i+'--><p>'+body+'</p>';
      const record = parseMsaWarningDetail(html, { bureau: '上海海事局', title, url: 'https://example.com/'+i, publishDateText: '2026-10-05' });
      assert.equal(record.title, title);
      assert.equal(record.rawText, body);
      assert.equal(record.bureau, '中国上海海事局航行通告');
      records.push(record);
    }
    global.gc();
    const retainedMB = (process.memoryUsage().heapUsed - before)/1024/1024;
    assert.equal(records.length, 100);
    assert.ok(retainedMB < 15, 'HTML retained by small records: '+retainedMB+' MB');
    console.log(JSON.stringify({ records: records.length, retainedMB }));
  `;
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--expose-gc', '--max-old-space-size=128', '--input-type=module', '-e', script],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATA_DIR: data }, windowsHide: true, timeout: 30000 });
  assert.equal(JSON.parse(stdout).records, 100);
});
