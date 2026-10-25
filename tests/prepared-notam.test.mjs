import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync,existsSync,createReadStream} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareNotamPublication,copyPreparedNotam,preparedNotamFiles} from '../prepared-notam.mjs';
import {packPublicData,unpackPublicData} from '../public-data-persistence.mjs';
import {applyDailyArchive,dailyAssetName} from '../scheduled-refresh.mjs';
import {readStreamedNotamResponse,restrictionsCacheKey,migrateCachedNotamParseResults} from '../server.mjs';

test('collector prepares identical map/history responses, imports and restores them without rebuilding on the free server',async t=>{
 const root=mkdtempSync(join(tmpdir(),'prepared-notam-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const source=join(root,'source'),bundle=join(root,'bundle'),target=join(root,'target');for(const dir of [source,bundle,target])mkdirSync(dir);
 const id='test_notam.json',savedAt='2026-10-25T09:00:00Z',cacheKey=restrictionsCacheKey({includeDetails:false,includeGlobalNotams:true,includeTfr:false});
 const data=migrateCachedNotamParseResults({generatedAt:savedAt,sources:{faaNotamSearch:{status:'ok',fetchedAt:savedAt}},restrictions:[
  {id:'test',source:'FAA NOTAM Search live',rawText:'WITHIN 5NM RADIUS OF 213000N 1573000W',country:'United States',hasGeometry:false},
 ]}).data;
 const body=JSON.stringify({savedAt,cacheKey,data});mkdirSync(join(source,'faa_notam_snapshots'));writeFileSync(join(source,'faa_notam_cache.json'),body);writeFileSync(join(source,'faa_notam_snapshots',id),body);
 const index={version:3,sources:{notam:[{source:'notam',id,savedAt,total:1,drawable:1,latest:false}],navarea:[],hydropac:[],msa:[]}};
 writeFileSync(join(source,'refresh_history_index.json'),JSON.stringify(index));
 await prepareNotamPublication(source,opts=>readStreamedNotamResponse({...opts,path:opts.path||join(source,'faa_notam_cache.json')}),cacheKey);
 const names=preparedNotamFiles(source);assert.equal(names.length,4);
 const responses=names.filter(n=>!n.endsWith('.meta.json')).map(n=>JSON.parse(readFileSync(join(source,'derived_notam_stream_v1',n))));
 assert(responses.some(r=>r.id===id));assert(responses.some(r=>r.restrictions));
 assert(responses.every(r=>(r.data||r).restrictions[0].geometry));
 copyPreparedNotam(source,bundle);assert.deepEqual(preparedNotamFiles(bundle),names);
 // A disposable runtime derivation must never inflate durable backups.
 const stale='e'.repeat(64)+'.json';writeFileSync(join(source,'derived_notam_stream_v1',stale),'{}');
 const archive=join(root,'archive.gz'),packed=await packPublicData(source,archive);await unpackPublicData(createReadStream(archive),bundle,packed.sha256);
 assert(!existsSync(join(bundle,'derived_notam_stream_v1',stale)));
 applyDailyArchive(target,bundle,dailyAssetName({runId:123,sha256:packed.sha256}));
 assert.deepEqual(preparedNotamFiles(target),names);
 for(const name of names)assert.deepEqual(readFileSync(join(target,'derived_notam_stream_v1',name)),readFileSync(join(source,'derived_notam_stream_v1',name)));
 const backup=join(root,'backup.gz'),saved=await packPublicData(target,backup),restored=join(root,'restored');mkdirSync(restored);
 await unpackPublicData(createReadStream(backup),restored,saved.sha256);assert.deepEqual(preparedNotamFiles(restored),names);
});
test('unsafe or incomplete prepared manifests are rejected before importing source data',()=>{
 const root=mkdtempSync(join(tmpdir(),'prepared-invalid-'));
 try{
  writeFileSync(join(root,'notam_prepared.json'),JSON.stringify({version:1,files:['../../secret']}));
  assert.throws(()=>preparedNotamFiles(root),/Invalid prepared/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
