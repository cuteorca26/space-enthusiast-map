import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Linux FAA recovery uses individual requests, loads every page and rejects incomplete pagination', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'space-faa-recovery-'));
  process.env.DATA_DIR = directory;
  process.env.FAA_NOTAM_RETRY_DELAY_MS = '0';
  process.env.FAA_NOTAM_REQUEST_INTERVAL_MS = '0';
  const originalFetch = globalThis.fetch;
  t.after(async () => { globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const params = new URLSearchParams(options.body);
    const code = params.get('designatorsForLocation');
    const offset = Number(params.get('offset'));
    requests.push({ code, offset });
    assert.ok(!code.includes(','));
    assert.match(options.headers.cookie, /fnsDisclaimer=agreed/);
    const total = code === 'COMP' ? 31 : code === 'EMPTY' ? 0 : 40;
    const length = code === 'INCOMP' && offset > 0 ? 0 : Math.min(30, Math.max(0, total - offset));
    return new Response(JSON.stringify({ totalNotamCount: total,
      notamList: Array.from({ length }, (_, i) => ({ transactionID: `${code}-${offset+i}`, text: `NOTAM ${offset+i}` })) }),
      { headers: { 'content-type': 'application/json' } });
  };
  const { recoverFaaNotamFirs } = await import('../server.mjs');
  const results = await recoverFaaNotamFirs(['COMP', 'EMPTY', 'INCOMP'].map(code => ({ code })), 'linux');
  assert.equal(results[0].loadedCount, 31);
  assert.equal(results[0].pagesFetched, 2);
  assert.equal(results[1].loadedCount, 0);
  assert.equal(results[1].error, undefined);
  assert.match(results[2].error, /pagination incomplete/);
  assert.equal(results[2].notams.length, 0);
  assert.ok(requests.some(request => request.code === 'COMP' && request.offset === 30));
});
