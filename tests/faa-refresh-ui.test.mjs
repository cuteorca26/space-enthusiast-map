import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function loadRestrictions('),source.indexOf('\nfunction clearFaaRefreshPoll('));
function fixture(fetch){
 const old=[{id:'keep-region',geometry:{type:'Polygon'}}],ctx={state:{faaRestrictions:old,payload:{restrictions:old,sources:{faaNotamSearch:{fetchedAt:'earlier'}}}},
  fetch,window:{APP_DEPLOYMENT:{online:true}},AbortController,Date,activeLoadController:null,pendingFaaRefresh:false,
  faaRefreshRequestedAt:0,faaRefreshPollFailureCount:0,els:{sourceLine:{},sourceStatus:{}},enrichRestriction:r=>r,escapeHtml:s=>s,
  faaRefreshProgressMessage:r=>r.message,polls:0};
 for(const name of ['clearFaaRefreshPoll','setLoading','syncCombinedRestrictions','renderSourceStatus','renderFilters','renderWatchFilters','renderLegend','renderNotamIdSearchResults','applyFilters','updateRefreshProgress','loadRefreshHistory'])ctx[name]=()=>{};
 ctx.scheduleFaaRefreshPoll=()=>ctx.polls++;
 runInNewContext(code+'\nthis.load=loadRestrictions;',ctx);return ctx;
}
test('accepted remote refresh preserves displayed notices, geometry and original timestamp',async()=>{
 const ctx=fixture(async()=>new Response(JSON.stringify({refreshAccepted:true,sources:{faaNotamSearch:{backgroundRefresh:{active:true,remote:true,message:'queued'}}}}),{status:202}));
 const old=ctx.state.faaRestrictions;await ctx.load(true);
 assert.equal(ctx.state.faaRestrictions,old);assert.equal(ctx.state.payload.restrictions,old);
 assert.equal(ctx.state.payload.sources.faaNotamSearch.fetchedAt,'earlier');assert.equal(ctx.polls,1);
});
test('page reopen loads current data and resumes existing remote progress; status outage does not lose data',async()=>{
 for(const outage of [false,true]){
  const ctx=fixture(async url=>{
   if(url.includes('status=1')){if(outage)throw Error('network');return new Response(JSON.stringify({backgroundRefresh:{active:true,remote:true,message:'running'}}));}
   return new Response(JSON.stringify({restrictions:[{id:'new-data'}],sources:{}}));
  });
  await ctx.load(false);assert.equal(ctx.state.faaRestrictions[0].id,'new-data');assert.equal(ctx.polls,outage?0:1);
 }
});
