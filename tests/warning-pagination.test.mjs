import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.FAA_NOTAM_REQUEST_INTERVAL_MS = '0';
process.env.FAA_NOTAM_REQUEST_RETRY_ATTEMPTS = '1';
const { fetchFaaNotamFir, fetchSeaLagomNavareaRegion, fetchHydropacCurrentTextWarnings, probeFaaNotamGateway } = await import('../server.mjs');
test('explicit FAA access denial stops the gateway without trying another transport',async t=>{
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);let requests=0;
  globalThis.fetch=async()=>{requests++;return new Response('<h1>Access Denied</h1>',{status:403});};
  await assert.rejects(probeFaaNotamGateway({code:'TEST'}),/403.*保留/);
  assert.equal(requests,1);
});

test('FAA denial hidden in an HTTP 200 page and rate limiting stop before switching transports', async t => {
  const old = globalThis.fetch; t.after(() => { globalThis.fetch = old; });
  for (const status of [200, 429]) {
    let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response('<html>Access Denied Reference #18.test</html>', { status }); };
    await assert.rejects(probeFaaNotamGateway({ code: 'TEST' }), error => error.code === 'FAA_ACCESS_DENIED');
    assert.equal(requests, 1);
  }
  globalThis.fetch = async () => new Response('{}', { status: 429, headers: { 'retry-after': '7200' } });
  await assert.rejects(probeFaaNotamGateway({ code: 'TEST' }), error => error.code === 'FAA_RATE_LIMITED' && Boolean(error.retryAfterAt));
});
test('FAA empty lists accept numeric or string zero totals',async t=>{
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
  for(const total of [0,'0']) {globalThis.fetch=async()=>new Response(JSON.stringify({notamList:null,totalNotamCount:total}));const d=await fetchFaaNotamFir({code:'TEST'},new Map());assert.equal(d.loadedCount,0);}
});
test('FAA changing totals and malformed success pages are rejected',async t=>{
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
  let page=0;
  globalThis.fetch=async()=>new Response(JSON.stringify({totalNotamCount:page?61:60,notamList:Array.from({length:30},(_,i)=>({transactionID:(page*30+i+1)})),page:page++}));
  await assert.rejects(fetchFaaNotamFir({code:'TEST'},new Map()),/total changed/);
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'upstream unavailable'}));
  await assert.rejects(fetchFaaNotamFir({code:'TEST'},new Map()),/valid NOTAM list/);
});
test('error pages and repeated HYDROPAC pages cannot replace the cache with an incomplete result',async()=>{
  const card=readFileSync(new URL('fixtures/hydropac-1.html',import.meta.url),'utf8');
  await assert.rejects(fetchHydropacCurrentTextWarnings(async()=>'Page 1 of 2 '+card),/overlap/);
  await assert.rejects(fetchHydropacCurrentTextWarnings(async()=>'<h1>Could not load messages</h1>'),/incomplete/);
  await assert.rejects(fetchHydropacCurrentTextWarnings(async()=>'Page 1 of 201 '+card),/incomplete/);
  const data=await fetchSeaLagomNavareaRegion({id:'4',label:'NAVAREA IV'},async url=>new URL(url).searchParams.has('page')?'<h1>Could not load messages</h1>':'<script>{"totalPages":2}</script>');
  assert.equal(data.coverage.scannedPages,1);assert.equal(data.coverage.totalPages,2);assert.ok(data.coverage.errors.length);
});
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
