import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {fetchMsaWarningDetails,fetchMsaText,formatMsaTransportError,withMsaRefreshFallback,closePerformanceWorkers} from '../server.mjs';
after(closePerformanceWorkers);
const items=names=>names.map(name=>({title:name,bureau:'test',url:`https://www.msa.gov.cn/${name}.html`}));
test('MSA retries only failed details, at most two more times, while retaining successful rows and order',async()=>{
  const calls={},observed=[];
  const result=await fetchMsaWarningDetails(items(['ok','recover1','recover2']),{
    retryDelayMs:0,concurrency:3,detailObserver:r=>observed.push(r.title),fetchDetail:async item=>{
      const attempt=calls[item.title]=(calls[item.title]||0)+1;
      if(attempt<=({ok:0,recover1:1,recover2:2}[item.title]))throw new Error('temporary connection reset');
      return {...item,rawText:'valid warning'};
    },
  });
  assert.deepEqual(calls,{ok:1,recover1:2,recover2:3});
  assert.deepEqual(result.records.map(r=>r.title),['ok','recover1','recover2']);
  assert.equal(new Set(observed).size,3);assert.equal(observed.length,3);
  assert.deepEqual(result.sourceErrors,[]);
  assert.deepEqual(result.retry,{initialFailed:2,recovered:2,failed:0,rounds:2,retryRequests:3});
});
test('MSA permanent failure remains explicit after exactly three attempts and does not discard successful details',async()=>{
  const calls={};
  const result=await fetchMsaWarningDetails(items(['ok','fail']),{retryDelayMs:0,fetchDetail:async item=>{
    calls[item.title]=(calls[item.title]||0)+1;if(item.title==='fail')throw new Error('HTTP503');return item;
  }});
  assert.deepEqual(calls,{ok:1,fail:3});assert.deepEqual(result.records.map(r=>r.title),['ok']);
  assert.equal(result.sourceErrors.length,1);assert.match(result.sourceErrors[0],/https:\/\/www\.msa\.gov\.cn\/fail\.html/);
  assert.match(result.sourceErrors[0],/after 3 attempts.*HTTP503/);
  assert.equal(result.retry.failed,1);
});
test('MSA recovery requests are limited to two in parallel',async()=>{
  const calls={};let active=0,peak=0;
  const result=await fetchMsaWarningDetails(items(['a','b','c','d','e','f']),{concurrency:6,retryDelayMs:0,fetchDetail:async item=>{
    calls[item.title]=(calls[item.title]||0)+1;if(calls[item.title]===1)throw new Error('reset');
    active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return item;
  }});
  assert.equal(peak,2);assert.equal(result.records.length,6);assert.equal(result.retry.recovered,6);
});
test('both Windows transport failures retain the URL and concise diagnostics without a command script',async()=>{
  const first=Object.assign(new Error('socket reset'),{code:'ECONNRESET'});
  const second=Object.assign(new Error('Command failed: powershell.exe\n$ErrorActionPreference=Stop\n$client.DownloadData()'),{code:1,killed:true,signal:'SIGTERM',stderr:'Remote server connection timed out\nAt line:10 char:1\n+ $client.DownloadData()'});
  await assert.rejects(fetchMsaText('https://www.msa.gov.cn/detail.html',5,{platform:'win32',fetchHttps:async()=>{throw first;},fetchPowerShell:async()=>{throw second;}}),error=>{
    assert.match(error.message,/https:\/\/www\.msa\.gov\.cn\/detail\.html/);
    assert.match(error.message,/HTTPS: ECONNRESET/);assert.match(error.message,/PowerShell:.*timeout\/process killed.*Remote server connection timed out/);
    assert.doesNotMatch(error.message,/ErrorActionPreference|DownloadData|Command failed/);return true;
  });
});
test('a killed child process without stderr still has a compact actionable reason',()=>{
  const error=Object.assign(new Error('Command failed: powershell.exe\n'+('script\n'.repeat(100))),{killed:true,signal:'SIGTERM'});
  const message=formatMsaTransportError(error);assert.match(message,/timeout\/process killed/);assert.ok(message.length<100);assert.doesNotMatch(message,/script|powershell/);
});
test('successful fallback still returns the response, and non-Windows failure never launches PowerShell',async()=>{
  assert.equal(await fetchMsaText('https://www.msa.gov.cn/x',5,{platform:'win32',fetchHttps:async()=>{throw new Error('reset');},fetchPowerShell:async()=>'<html>good</html>'}),'<html>good</html>');
  let invoked=false;
  await assert.rejects(fetchMsaText('https://www.msa.gov.cn/x',5,{platform:'linux',fetchHttps:async()=>{throw new Error('timeout');},fetchPowerShell:async()=>{invoked=true;}}),/HTTPS: timeout/);
  assert.equal(invoked,false);
});
test('incomplete MSA refresh retains the previous data/date and exposes this attempt errors',()=>{
  const stale={generatedAt:'2026-10-17T00:00:00Z',cacheSavedAt:'2026-10-17T00:00:00Z',restrictions:[{id:'old'}],skipped:[],source:{status:'ok',sourceErrors:[]}};
  const error=Object.assign(new Error('MSA refresh incomplete'),{sourceErrors:['GD390 detail request failed']});
  const fallback=withMsaRefreshFallback(stale,error);
  assert.equal(fallback.source.status,'warn');assert.equal(fallback.source.cacheFallback,true);assert.equal(fallback.source.refreshIncomplete,true);
  assert.deepEqual(fallback.source.sourceErrors,['GD390 detail request failed']);
  assert.strictEqual(fallback.restrictions,stale.restrictions);assert.equal(fallback.cacheSavedAt,stale.cacheSavedAt);
  assert.equal(stale.source.status,'ok');assert.deepEqual(stale.source.sourceErrors,[]);
});
