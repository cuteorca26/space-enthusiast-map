import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFaaTransport, readFaaSearchResponse, faaHttpError, validateFaaSearchPayload } from '../faa-notam-access.mjs';
const valid={notamList:[{notamNumber:'A1/26'}],totalNotamCount:1};
const denied=()=>faaHttpError(403,'<title>Access Denied</title> Reference #a.b.123');

test('direct 403 reaches one normal browser, preserves diagnosis and does not call Windows',async()=>{
 let opened=0,queried=0,windows=0;
 const session={fetchForm:async()=>{queried++;return valid;},close:async()=>{}};
 const result=await selectFaaTransport({params:{},direct:async()=>{throw denied();},openBrowser:async()=>{opened++;return session;},windows:async()=>{windows++;return valid;}});
 assert.equal(result.transport,'browser');assert.equal(opened,1);assert.equal(queried,1);assert.equal(windows,0);
 assert.equal(result.attempts[0].httpStatus,403);assert.equal(result.browserAttempted,true);
});
test('explicit fetch mode never launches a browser',async()=>{
 let opened=0;await assert.rejects(selectFaaTransport({mode:'fetch',direct:async()=>{throw denied();},openBrowser:async()=>{opened++;}}),/保留上次完整缓存/);assert.equal(opened,0);
});
test('429 stops all transports and preserves Retry-After',async()=>{
 let opened=0;const error=faaHttpError(429,'','120',Date.UTC(2026,9,25));
 await assert.rejects(selectFaaTransport({direct:async()=>{throw error;},openBrowser:async()=>{opened++;}}),e=>e.code==='FAA_RATE_LIMITED'&&e.retryAfterAt==='2026-10-25T00:02:00.000Z');assert.equal(opened,0);
});
test('browser denied closes it once and stops subsequent transports',async()=>{
 let closed=0,windows=0;
 await assert.rejects(selectFaaTransport({direct:async()=>{throw denied();},openBrowser:async()=>({fetchForm:async()=>{throw denied();},close:async()=>{closed++;}}),windows:async()=>{windows++;return valid;}}),e=>e.transportAttempts.length===2&&e.code==='FAA_ACCESS_DENIED');
 assert.equal(closed,1);assert.equal(windows,0);
});
test('missing browser can still use configured Windows transport',async()=>{
 const r=await selectFaaTransport({direct:async()=>{throw Error('timeout');},openBrowser:async()=>{throw Error('Chrome unavailable');},windows:async()=>valid});assert.equal(r.transport,'powershell');
});
test('successful direct probe does not allocate a browser',async()=>{
 const r=await selectFaaTransport({direct:async()=>valid,openBrowser:async()=>{throw Error('must not open');}});assert.equal(r.transport,'fetch');assert.equal(r.browserAttempted,false);
});
for(const [name,value] of [['empty-object',{}],['html-string','<html>'],['null',null],['query-error',{notamList:[],totalNotamCount:0,error:'captcha required'}],['negative-total',{notamList:[],totalNotamCount:-1}],['fraction-total',{notamList:[],totalNotamCount:1.5}]])test('reject misleading successful response '+name,()=>assert.throws(()=>validateFaaSearchPayload(value)));
test('accept genuine empty FIR and string totals',()=>{
 assert.equal(validateFaaSearchPayload({totalNotamCount:'0'}).totalNotamCount,'0');
 assert.equal(validateFaaSearchPayload({...valid,totalNotamCount:'1',error:false}).notamList.length,1);
});

test('zero total cannot excuse a malformed NOTAM list',()=>{
 assert.throws(()=>validateFaaSearchPayload({notamList:'invalid',totalNotamCount:0}));
 assert.throws(()=>validateFaaSearchPayload({notamList:{},totalNotamCount:0}));
 assert.deepEqual(validateFaaSearchPayload({notamList:null,totalNotamCount:0}),{notamList:null,totalNotamCount:0});
});
test('HTTP reader rejects HTML with status 200 and truncated JSON',async()=>{
 await assert.rejects(readFaaSearchResponse(new Response('<html>Maintenance</html>')),/网页入口/);
 await assert.rejects(readFaaSearchResponse(new Response('{"notamList":')),/JSON 不完整/);
});
test('a list without an official total cannot masquerade as a complete page',()=>{
 assert.throws(()=>validateFaaSearchPayload({notamList:[{}]}),/总数/);
 assert.throws(()=>validateFaaSearchPayload([{}]),/总数/);
 assert.throws(()=>validateFaaSearchPayload({notamList:[],totalNotamCount:' '}),/总数/);
});
test('unusable Retry-After headers do not mask the actual HTTP error',()=>{
 assert.equal(faaHttpError(429,'','9999999999999999999').code,'FAA_RATE_LIMITED');
});
test('HTTP reader detects an Access Denied HTML body even with status 200',async()=>{
 await assert.rejects(readFaaSearchResponse(new Response('<title>Access Denied</title>')),e=>e.code==='FAA_ACCESS_DENIED');
});
test('diagnostics never contain arbitrary response HTML or token values',()=>{
 const e=faaHttpError(403,'<title>Access Denied</title> secret-token=secret Reference #abc.12');assert(!e.message.includes('secret'));assert(e.message.includes('abc.12'));
});
