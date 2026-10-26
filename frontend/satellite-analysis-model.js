/* Shared, side-effect-free model for the orbit workbench and its worker. */
(function(root){
  'use strict';
  const EARTH_RADIUS_KM=6378.135, DAY=86400000;
  const normalize=x=>String(x??'').normalize('NFKC').toUpperCase().replace(/[-‐‑–—_]/g,' ').replace(/\s+/g,' ').trim();
  const number=x=>(typeof x==='number'||typeof x==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x.trim()))&&Number.isFinite(Number(x))?Number(x):NaN;
  const wrap=x=>((x%360)+360)%360;
  function epochMs(value){
    if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value)<=8.64e15?value:NaN;
    if(typeof value!=='string')return NaN;
    const s=value.trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/i);
    if(!m)return NaN;
    const y=Number(m[1]),month=Number(m[2]),d=Number(m[3]),days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
    // Date.parse normalizes 31 February into March; reject it instead of
    // silently analyzing a different day. Unzoned input explicitly means UTC.
    if(y<1||month<1||month>12||d<1||d>days[month-1]||Number(m[4]||0)>23||Number(m[5]||0)>59||Number(m[6]||0)>59)return NaN;
    return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]||'00'}:${m[5]||'00'}:${m[6]||'00'}${m[7]||''}${m[8]||'Z'}`);
  }
  function launchBatch(value){return String(value||'').toUpperCase().match(/^(\d{4}-\d{3})[A-Z]+$/)?.[1]||'';}
  function validateElements(omm){
    if(!omm)return {ok:false,reason:'缺少轨道根数'};
    const required=['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
    const missing=required.filter(k=>!Number.isFinite(number(omm[k])));
    if(!Number.isFinite(epochMs(omm.EPOCH)))missing.push('EPOCH');
    if(!String(omm.NORAD_CAT_ID||'').trim())missing.push('NORAD_CAT_ID');
    if(missing.length)return {ok:false,reason:'缺少或无效字段：'+missing.join('、')};
    if(number(omm.MEAN_MOTION)<=0||number(omm.ECCENTRICITY)<0||number(omm.ECCENTRICITY)>=1||number(omm.INCLINATION)<0||number(omm.INCLINATION)>180)return {ok:false,reason:'平均运动、偏心率或倾角超出有效范围'};
    return {ok:true,reason:''};
  }
  function fromMeanElements(m){
    if(!m||![m.am,m.em,m.im,m.Om,m.om,m.mm].every(Number.isFinite)||m.am<=0||m.em<0||m.em>=1)return null;
    const a=m.am*EARTH_RADIUS_KM;
    let inclination=wrap(m.im*180/Math.PI),node=m.Om*180/Math.PI,phase=(m.om+m.mm)*180/Math.PI;
    // Deep-space secular propagation can cross i=0. Reflect the orbital plane
    // and shift BOTH node and argument of latitude, preserving its orientation.
    if(inclination>180){inclination=360-inclination;node+=180;phase+=180;}
    return {inclination,scale:a-EARTH_RADIUS_KM,perigee:a*(1-m.em)-EARTH_RADIUS_KM,apogee:a*(1+m.em)-EARTH_RADIUS_KM,
      raan:wrap(node),phase:wrap(phase),eccentricity:m.em,period:Number.isFinite(m.nm)&&m.nm>0?2*Math.PI/m.nm:null,
      // An equatorial orbit has no uniquely defined ascending node.
      planeDefined:Math.abs(Math.sin(m.im))>1e-5};
  }
  function buildRecords(items,classifications,index,evidence={},source={}){
    const records=new Map();
    for(const item of items){
      const id=String(item.id),c=classifications.get(id)||{},r=index.records.get(id)||{},ev=evidence[id]||{};
      const memberships=[c,...(c.relatedGroups||[])].filter(x=>x.groupKey);
      const trusted=!ev.candidate&&(!ev.piece||ev.piece===item.internationalDesignator);
      const batch=launchBatch(item.internationalDesignator||item.omm?.OBJECT_ID);
      const batchAliases=trusted?(ev.names||[]).map(n=>String(n).match(/^(Starlink Group \d+-\d+)-\d+$/i)?.[1]).filter(Boolean):[];
      const program=trusted?String(ev.program||''):'';
      const confirmed=c.key!=='UNCLASSIFIED'&&c.evidenceStatus!=='unresolved'&&Number(c.confidence)>0;
      const individualFetchedAt=item.fetchedAt||item.retrievedAt||item.importedAt||'';
      const fetchedAt=individualFetchedAt||(item.customOrbit?'':source.fetchedAt||'');
      const text=normalize([r.text,item.name,id,item.internationalDesignator,item.launchDate,batch,...batchAliases,program,item.owner,item.dockedTo,
        ...memberships.flatMap(g=>[g.label,g.key,g.country,g.countryCode,g.relation,index.groups?.get(g.groupKey)?.text]),c.candidateSearchText].filter(Boolean).join(' '));
      records.set(id,{id,item,c,evidence:ev,memberships,purposes:r.purposes||['unknown'],objectClass:r.objectClass||item.objectClass||'UNKNOWN',batch,batchAliases,program,
        confirmed,text,fetchedAt,fetchScope:individualFetchedAt?'逐条记录':item.customOrbit?'用户输入：未记录导入时间':'目录批次完成时间（未提供逐星抓取时间）',
        evidenceAt:c.evidenceDate||ev.verifiedAt||'',validation:validateElements(item.omm),epoch:epochMs(item.omm?.EPOCH||item.epoch)});
    }
    return records;
  }
  function related(records,anchorId,kind){
    const a=records.get(String(anchorId));if(!a)return new Set();
    const result=new Set(),groups=new Set(a.memberships.map(x=>x.groupKey));
    for(const r of records.values()){
      if(kind==='launch'&&a.batch&&r.batch===a.batch)result.add(r.id);
      if(kind==='series'&&a.confirmed&&r.confirmed&&r.memberships.some(x=>groups.has(x.groupKey)&&!x.groupKey.endsWith('::UNCLASSIFIED')))result.add(r.id);
      if(kind==='program'&&a.program&&r.program===a.program)result.add(r.id);
      if(kind==='platform'&&a.memberships.length>1&&r.memberships.some(x=>a.memberships.slice(1).some(g=>x.groupKey===g.groupKey)))result.add(r.id);
    }
    return result;
  }
  function quality(r,result,timeMs,staleDays=7){
    const offsetDays=(timeMs-r.epoch)/DAY;
    return {missing:!r.validation.ok,failed:result?.status==='failed',pending:r.validation.ok&&!result,
      stale:Number.isFinite(offsetDays)&&offsetDays>staleDays,future:Number.isFinite(offsetDays)&&offsetDays<0,
      distant:Number.isFinite(offsetDays)&&Math.abs(offsetDays)>staleDays,offsetDays};
  }
  function query(records,filters={},context={}){
    const cohort=[],matched=[];const terms=normalize(filters.query).split(' ').filter(Boolean);
    const batchQuery=normalize(filters.batch);
    const relationSet=filters.relation?related(records,filters.anchor,filters.relation):null;
    for(const r of records.values()){
      if(context.scope&&!context.scope.has(r.id))continue;
      if(filters.country&&!r.memberships.some(g=>g.countryCode===filters.country))continue;
      if(filters.series&&!r.memberships.some(g=>g.groupKey===filters.series))continue;
      if(batchQuery&&!normalize([r.batch,...r.batchAliases,r.item.launchDate].join(' ')).includes(batchQuery))continue;
      if(relationSet&&!relationSet.has(r.id))continue;
      cohort.push(r.id);
      if(filters.purpose&&!r.purposes.includes(filters.purpose))continue;
      if(filters.objectClass&&r.objectClass!==filters.objectClass)continue;
      if(filters.orbit&&r.item.orbitClass!==filters.orbit)continue;
      if(!terms.every(t=>r.text.includes(t)))continue;
      const result=context.results?.get(r.id),q=quality(r,result,context.timeMs,context.staleDays);
      if(filters.quality==='available'&&result?.status!=='ok')continue;
      if(filters.quality==='pending'&&!q.pending)continue;
      if(filters.quality==='missing'&&!q.missing)continue;
      if(filters.quality==='failed'&&!q.failed)continue;
      if(filters.quality==='stale'&&!q.stale)continue;
      if(filters.quality==='future'&&!q.future)continue;
      if(filters.quality==='unconfirmed'&&r.confirmed)continue;
      if(filters.quality==='selected'&&!context.selected?.has(r.id))continue;
      if(!matchesRanges(result,filters.ranges))continue;
      matched.push(r.id);
    }
    return {cohort,matched};
  }
  function summarize(records,ids,results,timeMs,staleDays=7,selected=new Set(),drawn=new Set()){
    const s={total:ids.length,confirmed:0,complete:0,available:0,missing:0,failed:0,pending:0,stale:0,future:0,undefinedPlane:0,selected:0,drawn:0};
    for(const id of ids){const r=records.get(id);if(!r)continue;const result=results.get(id),q=quality(r,result,timeMs,staleDays);
      s.confirmed+=Number(r.confirmed);s.complete+=Number(r.validation.ok);s.available+=Number(result?.status==='ok');
      for(const k of ['missing','failed','pending','stale','future'])s[k]+=Number(q[k]);
      s.undefinedPlane+=Number(result?.status==='ok'&&!result.planeDefined);s.selected+=Number(selected.has(id));s.drawn+=Number(drawn.has(id));
    }return s;
  }
  function axes(result,kind,scale='scale',origin=0,phaseOrigin=origin){
    if(result?.status!=='ok')return null;
    if(kind==='plane')return result.planeDefined?[wrap(result.raan-origin),wrap(result.phase-phaseOrigin)]:null;
    return [result.inclination,result[scale]];
  }
  function inRect(point,rect){return Boolean(point)&&point[0]>=Math.min(rect.x0,rect.x1)&&point[0]<=Math.max(rect.x0,rect.x1)&&point[1]>=Math.min(rect.y0,rect.y1)&&point[1]<=Math.max(rect.y0,rect.y1);}
  function brush(ids,results,rect,kind,scale,origin,phaseOrigin=origin){return ids.filter(id=>inRect(axes(results.get(id),kind,scale,origin,phaseOrigin),rect));}
  function matchesRanges(result,ranges={}){
    for(const [field,range]of Object.entries(ranges||{})){
      const min=number(range.min),max=number(range.max);
      if(!Number.isFinite(min)&&!Number.isFinite(max))continue;
      const value=result?.[field];
      if(result?.status!=='ok'||!Number.isFinite(value)||Number.isFinite(min)&&value<min||Number.isFinite(max)&&value>max)return false;
    }return true;
  }
  function retainMatched(picked,matched){const allowed=new Set(matched);return new Set([...picked].filter(id=>allowed.has(id)));}
  function sortIds(ids,records,results,key='catalog',direction='asc'){
    if(key==='catalog')return ids.slice();
    const sign=direction==='desc'?-1:1;
    const value=id=>{const r=records.get(id);if(key==='name')return r?.item.name||null;if(key==='batch')return r?.batch||null;if(key==='epoch')return Number.isFinite(r?.epoch)?r.epoch:null;if(key==='id')return number(id);const p=results.get(id);return p?.status==='ok'&&(!['raan','phase'].includes(key)||p.planeDefined)&&Number.isFinite(p[key])?p[key]:null;};
    const values=new Map(ids.map(id=>[id,value(id)]));
    return ids.slice().sort((a,b)=>{const av=values.get(a),bv=values.get(b),am=av===null||typeof av==='number'&&!Number.isFinite(av),bm=bv===null||typeof bv==='number'&&!Number.isFinite(bv);
      if(am!==bm)return am?1:-1;
      const delta=am?0:typeof av==='number'?av-bv:String(av).localeCompare(String(bv),'zh-CN',{numeric:true});
      return delta*sign||String(a).localeCompare(String(b),'en',{numeric:true});});
  }
  function selectionBounds(ids,results,kind,scale,origin=0,phaseOrigin=origin){
    const points=ids.map(id=>axes(results.get(id),kind,scale,origin,phaseOrigin)).filter(p=>p?.every(Number.isFinite));
    if(!points.length)return null;
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    for(const [x,y]of points){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    const dx=Math.max(.05,(x1-x0)*.1),dy=Math.max(kind==='plane'?.05:1,(y1-y0)*.1);
    return {x0:x0-dx,x1:x1+dx,y0:y0-dy,y1:y1+dy};
  }
  function csvCell(value){
    // Only untrusted text needs formula protection; keep negative numeric
    // orbital values numeric when the CSV is opened in a spreadsheet.
    let s=String(value??'');if(typeof value!=='number'&&/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function colorKey(r,by,labels={}){if(by==='country')return r.c.country||'国家待核实';if(by==='series')return r.c.label||'系列待核实';if(by==='batch')return r.batch||'发射批次未知';return r.purposes.map(p=>labels[p]||p).sort().join(' + ');}
  function colorFor(key){let h=2166136261;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619)>>>0;return `hsl(${h%360} 68% 64%)`;}
  const api={EARTH_RADIUS_KM,normalize,number,wrap,epochMs,launchBatch,validateElements,fromMeanElements,buildRecords,related,quality,query,summarize,axes,inRect,brush,colorKey,colorFor,matchesRanges,retainMatched,sortIds,selectionBounds,csvCell};
  if(typeof module==='object'&&module.exports)module.exports=api;root.NotamSatelliteAnalysisModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
