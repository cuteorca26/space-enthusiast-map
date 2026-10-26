import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const SOURCE_LABELS={notam:'FAA NOTAM',hydropac:'HYDROPAC',navarea:'NAVAREA',msa:'中国航警'};
const read=(path,fallback={})=>{try{return JSON.parse(readFileSync(path,'utf8'));}catch{return fallback;}};
export function createCloudNotamRefresh({directory,repository,token='',enabled=false,source='notam',ready=Promise.resolve(),
 fetchImpl=fetch,now=Date.now,sync=async()=>{},persist=()=>{}}={}){
 if(!Object.hasOwn(SOURCE_LABELS,source))throw Error('Unknown warning source');
 const configured=enabled&&/^[\w.-]+\/[\w.-]+$/.test(repository||'');
 const path=join(directory,`manual_${source}_refresh.json`);let starting;
 function save(state){mkdirSync(directory,{recursive:true});const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(state));renameSync(tmp,path);persist();}
 function status(){
  const reports=read(join(directory,'scheduled_refresh_state.json')).manualResults||[];
  let state=read(path);
  // A crash can precede the next full backup of the dispatch receipt. The
  // immutable collector outcome still identifies that source's latest request.
  if(!state.requestId){
   const recovered=reports.filter(r=>r.result?.source===source&&Number.isFinite(Date.parse(r.cycleStartedAt)))
    .sort((a,b)=>b.cycleStartedAt.localeCompare(a.cycleStartedAt))[0];
   if(recovered)state={requestId:recovered.requestId,startedAt:recovered.cycleStartedAt};
  }
  if(!state.requestId)return{active:false,lastRefresh:null};
  const report=reports.find(r=>r.requestId===state.requestId);
  const result=report?.result;
  const finished=result&&(result.status==='success'||result.retryExhausted);
  const timedOut=now()-Date.parse(state.startedAt)>6*3600000;
  const active=!state.error&&!finished&&!timedOut;
  const message=state.error|| (result?.status==='success'?`${SOURCE_LABELS[source]} 全量刷新完成，数据已保存并导入网站。`:
   result?.status==='failed'?(result.nextRetryAt?`第 ${result.attempt} 次采集失败，将在 ${result.nextRetryAt} 重试；继续显示上次完整数据。`:result.message):
   timedOut?'云端采集超过等待时限，请查看 GitHub 任务状态；已有数据保持不变。':
   state.pendingConfirmation?'刷新请求已发送，正在等待 GitHub 确认结果；当前地图保持显示。':'云端全量采集已排队或运行中，当前地图保持显示。');
  return{active,status:active?'running':'idle',remote:true,requestId:state.requestId,startedAt:state.startedAt,
   elapsedMs:Math.max(0,now()-Date.parse(state.startedAt)),message,nextRetryAt:result?.nextRetryAt||null,
   lastRefresh:active?null:{status:result?.status==='success'?'success':'error',finishedAt:result?.finishedAt||new Date(now()).toISOString(),
    fetchedAt:result?.fetchedAt||'',restrictionsCount:result?.total||0,message}};
 }
 async function dispatch(){
  await ready;
  if(status().active)return{...status(),started:false};
  if(!token)throw Object.assign(Error('云端刷新需要现有长期存储凭据。'),{status:503});
  const state={requestId:randomUUID(),startedAt:new Date(now()).toISOString()};save(state);
  let response;
  try{response=await fetchImpl(`https://api.github.com/repos/${repository}/dispatches`,{method:'POST',
   headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'space-map-manual-refresh'},
   body:JSON.stringify({event_type:source==='notam'?'manual-notam-refresh':'manual-warning-refresh',client_payload:{source,requestId:state.requestId,requestedAt:state.startedAt}}),signal:AbortSignal.timeout(20000)});
  }catch{
   // A timeout can occur after GitHub accepted the event. Keep its identity and
   // wait for the result; automatically dispatching again would duplicate work.
   save({...state,pendingConfirmation:true});
   return{...status(),started:true};
  }
  await response.body?.cancel();
  if(response.status!==204){save({...state,error:`无法启动云端刷新（GitHub HTTP ${response.status}），已有数据保持不变。`});throw Object.assign(Error(status().message),{status:502});}
  return{...status(),started:true};
 }
 return{enabled:configured,status,
  start(){if(!configured)return Promise.reject(Error('Cloud refresh is not configured'));if(!starting)starting=dispatch().finally(()=>{starting=null;});return starting;},
  check(){if(configured&&status().active)void sync().catch(()=>{});},
 };
}
