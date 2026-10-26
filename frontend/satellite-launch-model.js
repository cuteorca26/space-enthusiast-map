(function(root){
  'use strict';
  const DAY=86400000;
  function day(value){const s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;const n=Date.parse(s+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s?n:NaN;}
  function launchFor(item,data){
    if(!data)return null;
    const id=String(item.id||item.noradId||'');
    const direct=data.objectLaunches?.[id] || item.launchKey;
    const batch=direct || String(item.internationalDesignator||item.omm?.OBJECT_ID||'').match(/^\d{4}-\d{3}/)?.[0];
    const launch=data.launches?.[batch];
    if(!launch)return null;
    // Reject a designator-only join if the known launch date disagrees. Docked
    // deployments can keep the carrier's COSPAR launch designation.
    if(!direct&&item.launchDate&&launch.time.day&&item.launchDate.slice(0,10)!==launch.time.day)return null;
    return launch;
  }
  function fields(item,data){
    const l=launchFor(item,data),t=l?.time;
    const time=t?.iso?(t.precision==='minute'?t.iso.slice(0,16).replace('T',' ')+' UTC（精确到分钟）':t.iso.replace('T',' ').replace(t.precision==='fraction'?/Z$/:/\.000Z$/,' UTC')):t?.raw?`${t.raw} UTC${t.uncertain?'（时间待核实）':t.precision==='day'?'（仅到日期）':''}`:item.launchDate?item.launchDate+'（仅到日期，UTC）':'公开资料未提供';
    return {time,site:l?[l.site,l.pad&&'发射位 '+l.pad,l.platform&&'平台 '+l.platform,l.carrierSite&&'载机起飞场 '+l.carrierSite].filter(Boolean).join(' · '):'公开资料未提供',vehicle:l?.vehicle?[l.vehicle,l.variant&&'构型 '+l.variant].filter(Boolean).join(' · '):'公开资料未提供',upperStage:l?.upperStage||'未取得可核验的对应构型资料',evidence:l?.upperStageEvidence||'',batch:l?.key||'',mission:l?.mission||'',flightId:l?.flightId||'',stages:l?.stages||[],precision:t?.precision||'day',uncertain:Boolean(t?.uncertain),source:l?'GCAT 发射记录及火箭构型表':'SATCAT / 现有目录',fetchedAt:data?.fetchedAt||''};
  }
  function buildHistoryIndex(data,currentItems,classifications,series){
    const records=new Map(data.objects.map(x=>[String(x.id),{...x}]));
    for(const item of currentItems){
      const c=classifications.get(String(item.id));
      if(c?.physicalType!=='PAYLOAD'||item.customOrbit)continue;
      const old=records.get(String(item.id));
      records.set(String(item.id),{...old,...item,launchDate:old?.launchDate||item.launchDate,decayDate:old?.decayDate||'',historyExcluded:old?.historyExcluded||false});
    }
    const groups=new Map();
    for(const [id,item] of records){
      const c=classifications.get(id)||series.classifyDetailed(item);
      if(c.physicalType!=='PAYLOAD')continue;
      for(const g of [c,...(c.relatedGroups||[])]){
        if(['UNCLASSIFIED','ROCKET_BODY','DEBRIS','COMPONENT'].includes(g.key))continue;
        if(!groups.has(g.groupKey))groups.set(g.groupKey,{key:g.groupKey,label:g.label,country:g.country,countryCode:g.countryCode,records:new Map()});
        groups.get(g.groupKey).records.set(id,item);
      }
    }
    return {groups,through:data.historyThrough||data.sources?.find(s=>s.key==='satcat')?.fetchedAt?.slice(0,10)||data.fetchedAt.slice(0,10)};
  }
  function timeline(records,{through,from='',to=''}={}){
    if(from&&!Number.isFinite(day(from))||to&&!Number.isFinite(day(to)))throw Error('请输入有效的 UTC 日期');
    const end=day(through),events=new Map();let excluded=0,missingDate=0,future=0;
    const seen=new Set();
    for(const r of records){
      const id=String(r.id);if(seen.has(id))continue;seen.add(id);
      if(r.historyExcluded){excluded++;continue;}
      const start=day(r.launchDate),stop=r.decayDate?day(r.decayDate):NaN;
      if(!Number.isFinite(start)||r.decayDate&&!Number.isFinite(stop)||Number.isFinite(stop)&&stop<start){missingDate++;continue;}
      if(start>end){future++;continue;}
      for(const [t,key]of [[start,'launched'],[stop,'decayed']]){
        if(!Number.isFinite(t)||t>end)continue;
        if(!events.has(t))events.set(t,{time:t,launched:0,decayed:0});events.get(t)[key]++;
      }
    }
    let launched=0,decayed=0;
    const all=[...events.values()].sort((a,b)=>a.time-b.time).map(e=>{launched+=e.launched;decayed+=e.decayed;return {...e,totalLaunched:launched,totalDecayed:decayed,inOrbit:launched-decayed};});
    const start=Number.isFinite(day(from))?day(from):all.length?all[0].time-DAY:end-DAY;
    const finish=Number.isFinite(day(to))?Math.min(day(to),end):end;
    if(!Number.isFinite(end)||start>finish)throw Error('日期范围无效或晚于历史档案的截止日');
    let before={time:start,launched:0,decayed:0,totalLaunched:0,totalDecayed:0,inOrbit:0};
    for(const row of all)if(row.time<start)before={...row,time:start,launched:0,decayed:0};else break;
    const rows=all.filter(e=>e.time>=start&&e.time<=finish);
    const points=[before,...rows];if(points.at(-1).time<finish)points.push({...points.at(-1),time:finish,launched:0,decayed:0});
    return {points,events:rows,start,end:finish,excluded,missingDate,future,known:seen.size,last:points.at(-1)};
  }
  function at(points,time){let lo=0,hi=points.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(points[m].time<=time)lo=m;else hi=m-1;}return points[lo];}
  function dailyRows(plot){const rows=[];let i=0;for(let t=plot.start;t<=plot.end;t+=DAY){while(i+1<plot.points.length&&plot.points[i+1].time<=t)i++;const p=plot.points[i];rows.push([new Date(t).toISOString().slice(0,10),p.time===t?p.launched:0,p.time===t?p.decayed:0,p.inOrbit,p.totalLaunched,p.totalDecayed]);}return rows;}
  function commonSeries(records,ids){let shared=null;for(const id of ids){const record=records.get(String(id));if(!record||record.c?.physicalType!=='PAYLOAD')return '';const groups=new Set((record.memberships||[]).map(g=>g.groupKey).filter(k=>k&&!/::(?:UNCLASSIFIED|ROCKET_BODY|DEBRIS|COMPONENT)$/.test(k)));shared=shared===null?groups:new Set([...shared].filter(k=>groups.has(k)));if(!shared.size)return '';}return shared?.values().next().value||'';}
  // Build individual events once per series/range. Filtering and pagination are
  // views of these records, so a large constellation never needs thousands of DOM rows.
  function eventRecords(records,data,plot){
    const out=[],seen=new Set(),metadata=new Map();
    for(const item of records){
      const id=String(item.id);if(seen.has(id))continue;seen.add(id);
      const start=day(item.launchDate),stop=item.decayDate?day(item.decayDate):NaN;
      if(item.historyExcluded||!Number.isFinite(start)||item.decayDate&&!Number.isFinite(stop)||Number.isFinite(stop)&&stop<start||start>plot.end)continue;
      const l=launchFor(item,data),mk=l?.key||id;
      if(!metadata.has(mk))metadata.set(mk,fields(item,data));
      const launch=metadata.get(mk);
      for(const [time,type]of [[start,'launch'],[stop,'reentry']]){
        if(!Number.isFinite(time)||time<plot.start||time>plot.end)continue;
        out.push({id,type,time,date:new Date(time).toISOString().slice(0,10),item,launch,
          search:[item.name,id,item.internationalDesignator,launch.batch,launch.mission,launch.flightId,launch.vehicle,launch.upperStage,launch.site,item.launchDate,item.decayDate].join(' ').toLocaleLowerCase()});
      }
    }
    return out.sort((a,b)=>b.time-a.time||a.type.localeCompare(b.type)||a.id.localeCompare(b.id,undefined,{numeric:true}));
  }
  function groupEvents(events,{grouping='batch',type='',query=''}={}){
    const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),groups=new Map();
    for(const event of events){
      if(type&&event.type!==type||!terms.every(term=>event.search.includes(term)))continue;
      // Never infer a common rocket from a shared date or an anonymous object name.
      const key=[event.type,event.date,grouping==='satellite'?event.id:event.launch.batch||'unknown-'+event.id,event.item.launchDate].join('|');
      if(!groups.has(key))groups.set(key,{key,type:event.type,date:event.date,time:event.time,launch:event.launch,members:[]});
      groups.get(key).members.push(event);
    }
    return [...groups.values()];
  }
  function eventCsvRows(events){return [['事件','事件日期_UTC','卫星名称','NORAD','国际编号','发射批次','发射任务','发射时间_UTC','火箭型号与构型','飞行编号','上面级','发射场与发射位','再入日期_UTC','发射资料来源','上面级证据','资料获取时间'],...events.map(e=>[e.type==='launch'?'发射':'再入',e.date,e.item.name,e.id,e.item.internationalDesignator,e.launch.batch,e.launch.mission,e.launch.time,e.launch.vehicle,e.launch.flightId,e.launch.upperStage,e.launch.site,e.item.decayDate,e.launch.source,e.launch.evidence,e.launch.fetchedAt])];}
  function csvText(rows){return '\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
  const api={DAY,day,launchFor,fields,buildHistoryIndex,timeline,at,dailyRows,commonSeries,eventRecords,groupEvents,eventCsvRows,csvText};
  if(typeof module==='object'&&module.exports)module.exports=api;root.NotamSatelliteLaunchModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
