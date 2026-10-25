import {existsSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,statSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
export const PREPARED_NOTAM_DIRECTORY='derived_notam_stream_v1';
export const PREPARED_NOTAM_MANIFEST='notam_prepared.json';
const NAME=/^[a-f0-9]{64}(?:\.meta)?\.json$/;

// Only two exact responses (current map and its saved history) are included in
// each publication/backup. Other derived files remain disposable local caches.
export function preparedNotamFiles(directory){
 const path=join(directory,PREPARED_NOTAM_MANIFEST);
 if(!existsSync(path))return [];
 const manifest=JSON.parse(readFileSync(path,'utf8'));
 const names=manifest.files;
 if(manifest.version!==1||!Array.isArray(names)||names.length!==4||new Set(names).size!==4||
   names.some(name=>!NAME.test(name)||!existsSync(join(directory,PREPARED_NOTAM_DIRECTORY,name)))||
   names.filter(n=>!n.endsWith('.meta.json')).some(n=>!names.includes(n.replace(/\.json$/,'.meta.json'))))
  throw Error('Invalid prepared NOTAM publication');
 return names;
}
export function copyPreparedNotam(from,to,{current=true}={}){
 const files=preparedNotamFiles(from);if(!files.length)return;
 const directory=join(to,PREPARED_NOTAM_DIRECTORY);mkdirSync(directory,{recursive:true});
 for(const name of files)copyFileSync(join(from,PREPARED_NOTAM_DIRECTORY,name),join(directory,name));
 if(current)copyFileSync(join(from,PREPARED_NOTAM_MANIFEST),join(to,PREPARED_NOTAM_MANIFEST));
 // Keep latest published responses even when visitors replay old snapshots.
 const keep=new Set([...files,...preparedNotamFiles(to)]);
 const old=readdirSync(directory).filter(n=>NAME.test(n)&&!keep.has(n));
 for(const name of old)try{unlinkSync(join(directory,name));}catch{}
}
export async function prepareNotamPublication(directory,prepare,cacheKey){
 const index=JSON.parse(readFileSync(join(directory,'refresh_history_index.json'),'utf8'));
 const record=index.sources.notam?.[0];if(!record)throw Error('NOTAM snapshot missing before preparation');
 const files=[];
 for(const options of [{current:true,cacheKey},{id:record.id,path:join(directory,'faa_notam_snapshots',record.id)}]){
  const response=await prepare(options);
  if(!response||response.summary.total!==record.total||response.summary.drawable!==record.drawable)
   throw Error('Prepared NOTAM response differs from collected snapshot');
  const name=response.filePath.split(/[\\/]/).at(-1),target=join(directory,PREPARED_NOTAM_DIRECTORY);
  mkdirSync(target,{recursive:true});
  for(const filename of [name,name.replace(/\.json$/,'.meta.json')]){
   const source=response.filePath.replace(/[^\\/]+$/,filename);
   if(source!==join(target,filename))copyFileSync(source,join(target,filename));
   if(!statSync(join(target,filename)).size)throw Error('Empty prepared NOTAM response');
   files.push(filename);
  }
 }
 writeFileSync(join(directory,PREPARED_NOTAM_MANIFEST),JSON.stringify({version:1,files}));
 return files;
}
