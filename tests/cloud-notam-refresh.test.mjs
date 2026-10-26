import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCloudNotamRefresh} from '../cloud-notam-refresh.mjs';
import {packPublicData,unpackPublicData} from '../public-data-persistence.mjs';

async function fixture(t,extra={}){
 const directory=await mkdtemp(join(tmpdir(),'remote-notam-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 let requests=[],clock=Date.parse('2026-10-25T09:00:00Z'),persisted=0;
 const options={directory,repository:'owner/map',token:'private-test-token',enabled:true,now:()=>clock,
  persist:()=>persisted++,fetchImpl:async(url,init)=>{requests.push({url,init});return new Response(null,{status:204});},...extra};
 const client=createCloudNotamRefresh(options);
 return{directory,options,client,requests,persisted:()=>persisted,advance:ms=>clock+=ms,
  report:async(requestId,result)=>writeFile(join(directory,'scheduled_refresh_state.json'),JSON.stringify({manualResults:[{requestId,result}]}))};
}
test('concurrent manual refresh dispatches once with scoped repository event, never saving credentials',async t=>{
 const f=await fixture(t);const result=await Promise.all([f.client.start(),f.client.start(),f.client.start()]);
 assert.equal(f.requests.length,1);assert(result.every(r=>r.requestId===result[0].requestId&&r.active));
 const {url,init}=f.requests[0];assert.equal(url,'https://api.github.com/repos/owner/map/dispatches');
 assert.equal(init.method,'POST');assert.equal(init.headers.authorization,'Bearer private-test-token');
 const body=JSON.parse(init.body);assert.equal(body.event_type,'manual-notam-refresh');
 assert.equal(body.client_payload.requestId,result[0].requestId);
 const saved=await readFile(join(f.directory,'manual_notam_refresh.json'),'utf8');assert(!saved.includes('token'));assert(f.persisted()>0);
 assert.equal((await f.client.start()).started,false);assert.equal(f.requests.length,1);
});
test('pending job and request identity survive durable backup and restart',async t=>{
 const f=await fixture(t);const start=await f.client.start();
 const archive=join(f.directory,'backup.gz'),packed=await packPublicData(f.directory,archive);
 const restored=join(f.directory,'restored');await mkdir(restored);await unpackPublicData(createReadStream(archive),restored,packed.sha256);
 const restarted=createCloudNotamRefresh({...f.options,directory:restored});
 assert.equal((await restarted.start()).requestId,start.requestId);assert.equal(f.requests.length,1);
});
test('hourly retry remains active, unrelated outcomes cannot finish it, success and exhausted failures do',async t=>{
 const f=await fixture(t);const {requestId}=await f.client.start();
 await f.report('different-request',{status:'success'});assert.equal(f.client.status().active,true);
 await f.report(requestId,{status:'failed',attempt:1,nextRetryAt:'2026-10-25T10:05:00Z',retryExhausted:false});
 assert.equal(f.client.status().active,true);assert.match(f.client.status().message,/第 1 次/);
 await f.report(requestId,{status:'success',total:13407,fetchedAt:'2026-10-25T09:05:00Z',finishedAt:'2026-10-25T09:06:00Z'});
 assert.equal(f.client.status().active,false);assert.equal(f.client.status().lastRefresh.restrictionsCount,13407);
 const next=await f.client.start();assert.notEqual(next.requestId,requestId);assert.equal(f.requests.length,2);
 await f.report(next.requestId,{status:'failed',attempt:3,retryExhausted:true,message:'FAA unavailable'});
 assert.equal(f.client.status().active,false);assert.equal(f.client.status().lastRefresh.status,'error');
});
test('ambiguous dispatch timeout does not duplicate work or claim confirmed acceptance',async t=>{
 let count=0;const f=await fixture(t,{fetchImpl:async()=>{count++;throw Error('timeout');}});
 await f.client.start();await f.client.start();assert.equal(count,1);assert.match(f.client.status().message,/等待 GitHub 确认/);
 f.advance(6*3600000+1);assert.equal(f.client.status().active,false);assert.equal(f.client.status().lastRefresh.status,'error');
});
test('dispatch rejection and missing token fail safely without revealing upstream bodies',async t=>{
 const f=await fixture(t,{fetchImpl:async()=>new Response('secret details',{status:403})});
 await assert.rejects(f.client.start(),/HTTP 403/);assert.equal(f.client.status().active,false);
 assert(!JSON.stringify(f.client.status()).includes('secret details'));
 const noToken=await fixture(t,{token:''});await assert.rejects(noToken.client.start(),/凭据/);assert.equal(noToken.requests.length,0);
});

for(const source of ['hydropac','navarea','msa'])test(`${source} manual collection has its own durable request and completion identity`,async t=>{
 const f=await fixture(t,{source});const start=await f.client.start();
 const body=JSON.parse(f.requests[0].init.body);assert.equal(body.event_type,'manual-warning-refresh');assert.equal(body.client_payload.source,source);
 const archive=join(f.directory,'backup.gz'),packed=await packPublicData(f.directory,archive);
 const restored=join(f.directory,'restored');await mkdir(restored);await unpackPublicData(createReadStream(archive),restored,packed.sha256);
 const restarted=createCloudNotamRefresh({...f.options,directory:restored});assert.equal(restarted.status().requestId,start.requestId);
 await f.report(start.requestId,{source,status:'success',total:99,finishedAt:'2026-10-25T09:05:00Z'});
 assert.equal(f.client.status().active,false);assert.equal(f.client.status().lastRefresh.status,'success');
 assert.match(f.client.status().message,/全量刷新完成/);
});
