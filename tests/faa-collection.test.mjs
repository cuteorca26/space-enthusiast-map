import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as access from '../faa-notam-access.mjs';
import {firstNotamText,canonicalNotamText} from '../faa-notam-export.mjs';
const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
function block(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));if(start<0)throw Error(name);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?source.length:start+1+next);}
const fir=code=>({code,group:{id:'test',label:'test'}});
const complete=code=>({fir:fir(code),memberFirs:[fir(code)],notams:[{notamNumber:code}],loadedCount:1,totalAvailable:1});
function fixture(extra={}){const ctx={...access,Set,Map,Error,console,FAA_NOTAM_TRANSPORT:'auto',FAA_NOTAM_EXPORT_ENABLED:false,FAA_NOTAM_MAX_PER_FIR:0,FAA_NOTAM_ADAPTIVE_BATCH_SIZE:3,FAA_NOTAM_ADAPTIVE_CONCURRENCY:2,FAA_NOTAM_RETRY_CONCURRENCY:2,...extra};const names=['faaFirResultNeedsRecovery','uniqueFaaFirs','countFaaResultFirs','mergeFaaBatchRecoveryResults','fetchFaaNotamFirs','recoverFaaNotamFirsInBrowser'];vm.runInNewContext(names.map(block).join('\n')+'\nthis.run=fetchFaaNotamFirs;',ctx);return ctx;}
test('midstream 403 retries only unfinished FIRs and keeps successful full pages',async()=>{
 let requested=[],closed=0;
 const ctx=fixture({fetchFaaNotamFirsViaFetch:async()=>{throw Object.assign(access.faaHttpError(403),{faaResults:[complete('AAAA'),{fir:fir('BBBB'),error:'403'}]});},createFaaNotamBrowserSession:async()=>({fetchForm:async()=>({notamList:[],totalNotamCount:0}),close:async()=>{closed++;}}),buildFaaNotamSearchParams:()=>({}),fetchFaaNotamFirsViaBrowser:async(firs)=>{requested=firs.map(f=>f.code);return{results:firs.map(f=>complete(f.code)),diagnostics:{}};}});
 const gateway={transport:'fetch'};const result=await ctx.run(['AAAA','BBBB','CCCC'].map(fir),gateway);
 assert.deepEqual(Array.from(requested),['BBBB','CCCC']);assert.equal(result.results.length,3);assert.equal(result.diagnostics.preservedCompletedFirs,1);assert.equal(result.diagnostics.recoveredFirs,2);assert.equal(closed,0);assert.equal(gateway.browserAttempted,true);await gateway.browserSession.close();
});
test('403 during adaptive retry keeps earlier primary successes',async()=>{
 let calls=0,requested=[];
 const ctx=fixture({fetchFaaNotamFirsViaFetch:async()=>{if(++calls===1)return[complete('AAAA'),{fir:fir('BBBB'),error:'timeout'}];throw Object.assign(access.faaHttpError(403),{faaResults:[{fir:fir('BBBB'),error:'403'}]});},createFaaNotamBrowserSession:async()=>({fetchForm:async()=>({notamList:[],totalNotamCount:0}),close:async()=>{}}),buildFaaNotamSearchParams:()=>({}),fetchFaaNotamFirsViaBrowser:async(firs)=>{requested=firs.map(f=>f.code);return{results:firs.map(f=>complete(f.code)),diagnostics:{}};}});
 const r=await ctx.run(['AAAA','BBBB'].map(fir),{transport:'fetch'});assert.equal(r.results.length,2);assert.deepEqual(Array.from(requested),['BBBB']);
});
test('midstream 429 does not switch to browser',async()=>{
 let opened=0;const ctx=fixture({fetchFaaNotamFirsViaFetch:async()=>{throw access.faaHttpError(429);},createFaaNotamBrowserSession:async()=>{opened++;}});await assert.rejects(ctx.run([fir('AAAA')],{transport:'fetch'}),e=>e.code==='FAA_RATE_LIMITED');assert.equal(opened,0);
});
test('failed browser recovery closes session and reports both failures',async()=>{
 let closed=0;const ctx=fixture({fetchFaaNotamFirsViaFetch:async()=>{throw access.faaHttpError(403);},createFaaNotamBrowserSession:async()=>({fetchForm:async()=>{throw access.faaHttpError(403);},close:async()=>{closed++;}}),buildFaaNotamSearchParams:()=>({})});
 await assert.rejects(ctx.run([fir('AAAA')],{transport:'fetch'}),e=>e.transportAttempts.length===2);assert.equal(closed,1);
});
test('same-size fresh discovery cannot silently drop a previously known FIR',async()=>{
 let saved;const ctx={Map,Set,Error,FAA_NOTAM_GROUPS:[{codes:['AAAA']}],FAA_NOTAM_DISCOVER_GLOBAL_FIRS:true,FAA_NOTAM_REQUIRED_FIRS:['AAAA'],FAA_GLOBAL_FIR_GROUP:{},readFaaFirDesignatorCache:()=>[fir('AAAA'),fir('BBBB')],discoverFaaFirDesignators:async()=>[fir('CCCC')],writeFaaFirDesignatorCache:firs=>{saved=firs;}};
 vm.runInNewContext(block('expandFaaNotamFirs')+'\nthis.run=expandFaaNotamFirs',ctx);const result=await ctx.run();assert.deepEqual(Array.from(result,f=>f.code),['AAAA','CCCC','BBBB']);assert.equal(saved.length,3);
});

test('subsequent JSON pages request official totals and preserve offsets',()=>{
 const ctx={};vm.runInNewContext(block('buildFaaNotamSearchParams')+'\nthis.run=buildFaaNotamSearchParams;',ctx);
 for(const offset of [0,30,60]){const p=ctx.run({code:'KZNY'},offset);assert.equal(p.notamsOnly,'false');assert.equal(p.offset,String(offset));assert.equal(p.designatorsForLocation,'KZNY');}
});

test('pagination completes 41 records across two metadata-bearing pages',async()=>{
 const requested=[];
 const ctx={FAA_NOTAM_MAX_PER_FIR:0,FAA_NOTAM_PAGE_SIZE:30,FAA_NOTAM_PAGE_DELAY_MS:0,FAA_NOTAM_REQUEST_INTERVAL_MS:0,Set,JSON,Error,Number,notamText:n=>n.text,buildFaaNotamSearchParams:(fir,offset)=>({offset}),fetchFaaNotamForm:async(url,jar,p)=>{requested.push(p.offset);return{totalNotamCount:41,notamList:Array.from({length:p.offset===0?30:11},(_,i)=>({transactionID:i+p.offset+1,text:'Notice '+(i+p.offset)}))};},FAA_NOTAM_SEARCH_ENDPOINT:'fixture',sleep:async()=>{}};
 vm.runInNewContext(block('fetchFaaNotamFir')+'\nthis.run=fetchFaaNotamFir;',ctx);
 const r=await ctx.run({code:'KZNY'},new Map());assert.equal(r.loadedCount,41);assert.equal(r.pagesFetched,2);assert.deepEqual(requested,[0,30]);
});

test('changed official total on a later page cannot publish an incomplete snapshot',async()=>{
 const ctx={FAA_NOTAM_MAX_PER_FIR:0,FAA_NOTAM_PAGE_SIZE:30,FAA_NOTAM_PAGE_DELAY_MS:0,FAA_NOTAM_REQUEST_INTERVAL_MS:0,Set,JSON,Error,Number,notamText:n=>n.text,buildFaaNotamSearchParams:(fir,offset)=>({offset}),fetchFaaNotamForm:async(url,jar,p)=>({totalNotamCount:p.offset?42:41,notamList:Array.from({length:p.offset?12:30},(_,i)=>({transactionID:i+p.offset+1,text:'Notice'}))}),FAA_NOTAM_SEARCH_ENDPOINT:'fixture',sleep:async()=>{}};
 vm.runInNewContext(block('fetchFaaNotamFir')+'\nthis.run=fetchFaaNotamFir;',ctx);
 await assert.rejects(ctx.run({code:'KZNY'},new Map()),/total changed/);
});

test('identical notices returned under several FIRs retain one display identity',()=>{
 const ctx={JSON,notamText:firstNotamText,canonicalNotamText};vm.runInNewContext(block('faaNotamDeduplicationKey')+'\nthis.run=faaNotamDeduplicationKey;',ctx);
 const a={notamNumber:'A3216/26',facilityDesignator:'WSJC',icaoMessage:'A3216/26 NOTAMN\r\nA) WSJC WIIF\r\nE) A COMPLETE BOUNDARY'};
 const b={...a,facilityDesignator:'WIIF',icaoMessage:a.icaoMessage.replace(/\r\n/g,' ')};
 assert.equal(ctx.run(a),ctx.run(b));
});

test('different long multipart notices are not merged by a shared 4000-character prefix',()=>{
 const ctx={JSON,notamText:firstNotamText,canonicalNotamText};vm.runInNewContext(block('faaNotamDeduplicationKey')+'\nthis.run=faaNotamDeduplicationKey;',ctx);
 const a={notamNumber:'A1/26',icaoMessage:'A'.repeat(4500)+' AREA 1'},b={...a,icaoMessage:'A'.repeat(4500)+' AREA 2'};
 assert.notEqual(ctx.run(a),ctx.run(b));
});
