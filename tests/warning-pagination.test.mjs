import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.FAA_NOTAM_REQUEST_INTERVAL_MS = '0';
process.env.FAA_NOTAM_REQUEST_RETRY_ATTEMPTS = '1';
const { fetchFaaNotamFir, fetchSeaLagomNavareaRegion, fetchHydropacCurrentTextWarnings } = await import('../server.mjs');
test('overlapping FAA pages fail without reporting missing records as complete', async t => {
  const old = globalThis.fetch; t.after(() => { globalThis.fetch = old; });
  let page = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ totalNotamCount: 60,
    notamList: Array.from({ length: 30 }, (_, i) => ({ transactionID: i + (page ? 20 : 0) + 1, text: `record ${i}` })), page: page++ }));
  await assert.rejects(fetchFaaNotamFir({ code: 'TEST' }, new Map()), /overlaps/);
});
test('NAVAREA scans beyond eight pages and reports actual upstream totals on failure', async t => {
  const old = globalThis.fetch; t.after(() => { globalThis.fetch = old; });
  for (const fail of [false, true]) {
    const fetchPage = async url => {
      if (fail && new URL(url).searchParams.get('page') === '2') throw Error('timeout');
      return '<script>{"totalPages":12}</script>';
    };
    const data = await fetchSeaLagomNavareaRegion({ id: '4', roman: 'IV', label: 'NAVAREA IV' }, fetchPage);
    assert.equal(data.coverage.totalPages, 12);
    assert.equal(data.coverage.scannedPages, fail ? 11 : 12);
    assert.equal(data.coverage.errors.length > 0, fail);
  }
  await assert.rejects(fetchSeaLagomNavareaRegion({ id: '21', label: 'NAVAREA XXI' }, async () => '<h1>Could not load messages.</h1>'), /coverage unavailable/);
});
test('HYDROPAC later-page failure rejects the refresh, normal pages retain unique IDs', async t => {
  const old = globalThis.fetch; t.after(() => { globalThis.fetch = old; });
  for (const fail of [false, true]) {
    const fetchPage = async url => {
      const page = Number(new URL(url).searchParams.get('page') || 1);
      if (fail && page === 2) throw Error('timeout');
      return 'Page 1 of 3 ' + readFileSync(new URL(`fixtures/hydropac-${page}.html`, import.meta.url), 'utf8');
    };
    if (fail) await assert.rejects(fetchHydropacCurrentTextWarnings(fetchPage), /incomplete/);
    else assert.deepEqual((await fetchHydropacCurrentTextWarnings(fetchPage)).map(r => r.msgNumber), [2903, 2801, 1903]);
  }
});
