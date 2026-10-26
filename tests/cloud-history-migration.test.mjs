import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('cloud v3 inventory preserves captured summaries and discovers unindexed snapshots',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'cloud-history-migration-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const savedAt='2026-10-01T00:00:00Z';
 const captured={id:'satellite_saved.json',source:'satellite',savedAt,total:1,drawable:1,message:'capture-time metadata',summaryParseVersion:''};
 await mkdir(join(directory,'satellite_catalog_snapshots'));
 await writeFile(join(directory,'satellite_catalog_snapshots',captured.id),JSON.stringify({savedAt,data:{satellites:[{noradId:25544}]}}));
 await mkdir(join(directory,'hydropac_snapshots'));
 await writeFile(join(directory,'hydropac_snapshots','missing.json'),JSON.stringify({savedAt,data:{restrictions:[],skipped:[],source:{message:'discovered'}}}));
 await writeFile(join(directory,'refresh_history_index.json'),JSON.stringify({version:3,sources:{notam:[],hydropac:[],navarea:[],msa:[],satellite:[captured]}}));
 const script=`const s=await import(${JSON.stringify(new URL('../server.mjs',import.meta.url).href)});try{console.log(JSON.stringify(await s.buildRefreshHistoryListAsync()));}finally{await s.closePerformanceWorkers();}`;
 const {stdout}=await promisify(execFile)(process.execPath,['--expose-gc','--max-old-space-size=256','--input-type=module','-e',script],{windowsHide:true,timeout:30000,env:{...process.env,HOST:'0.0.0.0',DATA_DIR:directory,MEMORY_BUDGET_MODE:'1',PUBLIC_DATA_REPOSITORY:'',GITHUB_DATA_TOKEN:''}});
 const list=JSON.parse(stdout.trim());
 assert.deepEqual(list.sources.satellite,[captured]);
 assert.equal(list.sources.hydropac[0].id,'missing.json');
 assert.equal(list.preparing,false);
 const index=JSON.parse(await readFile(join(directory,'refresh_history_index.json')));
 assert.equal(index.version,4);assert.equal(index.scanComplete,true);
});
