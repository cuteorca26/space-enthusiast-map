import './satellite-analysis-model.js?v=20261022-review-2';
import {json2satrec,propagate} from '/node_modules/satellite.js/dist/index.js';
import {positionWithinSatrecEnvelope} from '/frontend/satellite-orbit-validity.mjs';
const model=globalThis.NotamSatelliteAnalysisModel;
const ERRORS={1:'偏心率超出范围',2:'平均运动无效',3:'受摄偏心率超出范围',4:'半通径无效',5:'轨道处于亚轨道状态',6:'传播位置进入地球，可能已衰减'};
export function analyze(item,timeMs){
  const validation=model.validateElements(item.omm);
  if(!validation.ok)return {id:item.id,status:'missing',reason:validation.reason};
  try{
    const satrec=json2satrec({...item.omm,EPOCH:new Date(model.epochMs(item.omm.EPOCH)).toISOString()}),state=propagate(satrec,new Date(timeMs));
    const values=model.fromMeanElements(state?.meanElements);
    if(satrec.error||!values||!state?.position||!Object.values(state.position).every(Number.isFinite))return {id:item.id,status:'failed',reason:ERRORS[satrec.error]||'SGP4 未返回有限位置或平均根数'};
    if(!positionWithinSatrecEnvelope(state.position,satrec))return {id:item.id,status:'failed',reason:'传播超出原根数的合理轨道包络；与地图保护规则一致'};
    return {id:item.id,status:'ok',...values};
  }catch(error){return {id:item.id,status:'failed',reason:'根数解析失败：'+String(error.message).slice(0,160)};}
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.onmessage=async({data})=>{
  const {items,timeMs,requestId}=data;const results=[];const started=performance.now();
  for(let i=0;i<items.length;i++){
    results.push(analyze(items[i],timeMs));
    if((i+1)%1000===0){self.postMessage({type:'progress',requestId,done:i+1,total:items.length});await new Promise(resolve=>setTimeout(resolve,0));}
  }
  self.postMessage({type:'complete',requestId,results,timeMs,computeMs:performance.now()-started});
};
