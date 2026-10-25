import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

test('cloud manual refresh acknowledges immediately without reading old NOTAM bodies, preserves admin protection and deduplicates jobs',async t=>{
 const finder=createServer();await new Promise(r=>finder.listen(0,'127.0.0.1',r));const port=finder.address().port;await new Promise(r=>finder.close(r));
 const directory=await mkdtemp(join(tmpdir(),'faa-cloud-start-'));
 await writeFile(join(directory,'faa_notam_cache.json'),'this archive must not be decoded on the web thread');
 const script=`
  import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {fileURLToPath} from 'node:url';
  const original=fs.readFileSync;
  fs.readFileSync=function(path,...args){if(String(path).endsWith('faa_notam_cache.json')){console.error('FORBIDDEN_CACHE_READ');throw Error('Synchronous cache read');}return original(path,...args);};syncBuiltinESMExports();
  globalThis.fetch=async()=>new Promise(()=>{});
  process.argv[1]=fileURLToPath(new URL('./server.mjs',import.meta.url));await import('./server.mjs');`;
 const child=spawn(process.execPath,['--expose-gc','--input-type=module','-e',script],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,
  env:{...process.env,HOST:'0.0.0.0',PORT:String(port),DATA_DIR:directory,MEMORY_BUDGET_MODE:'1',PUBLIC_DATA_REPOSITORY:'',GITHUB_DATA_TOKEN:'',ADMIN_SECRET_SHA256:createHash('sha256').update('test-secret').digest('hex')}});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 t.after(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await rm(directory,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 const endpoint='/api/restrictions?refresh=1&details=0&tfr=0';
 assert.equal((await fetch(base+endpoint)).status,401);
 const login=await (await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:'test-secret'})})).json();
 const headers={authorization:'Bearer '+login.token};
 for(const expected of ['started','running']){
  const response=await fetch(base+endpoint,{headers,signal:AbortSignal.timeout(3000)});assert.equal(response.status,202);
  const data=await response.json();assert.equal(data.refreshAccepted,true);assert.equal(data.sources.faaNotamSearch.backgroundRefresh.status,expected);
  assert.equal(data.restrictions,undefined,'acknowledgment must not replace the displayed notices with an empty array');
 }
 assert.equal((await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)})).status,200);
 assert(!logs.includes('FORBIDDEN_CACHE_READ'),logs);
});
