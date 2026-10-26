(function(root){
  'use strict';
  const M=root.NotamSatelliteLaunchModel;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=n=>new Date(n).toISOString().slice(0,10),num=n=>n.toLocaleString('zh-CN'),PAGE_SIZE=20;
  function mount(options){
    const dialog=document.createElement('dialog');dialog.className='sn-dialog';dialog.setAttribute('aria-labelledby','snTitle');
    dialog.innerHTML=`
      <header><div><span class="sw-eyebrow">CONSTELLATION HISTORY</span><h2 id="snTitle">组网历程</h2><p>同一系列的在轨卫星数量，随时间怎样变化。</p></div><button type="button" data-action="close">返回 ×</button></header>
      <div class="sn-body"><p id="snStatus" role="status">正在载入发射与再入档案…</p>
        <div class="sn-filters">
          <label>国家 / 机构<select id="snCountry"><option value="">全部</option></select></label>
          <label>查找系列<input id="snSearch" type="search" placeholder="星链、遥感、OneWeb…"></label>
          <label>卫星系列<select id="snSeries"></select></label>
          <label>起始日期（UTC）<input id="snFrom" type="date"></label><label>结束日期（UTC）<input id="snTo" type="date"></label>
        </div>
        <div class="sn-actions"><button type="button" data-action="apply">应用日期</button><button type="button" data-action="all">完整历程</button><button type="button" data-action="year">最近一年</button><button type="button" data-action="csv">导出每日变化 CSV</button><button type="button" data-action="events-jump">查看事件明细 ↓</button></div>
        <div id="snMetrics" class="sn-metrics"></div>
        <div class="sn-legend"><span>● 在轨数量</span><span>┄ 累计发射</span><small>在轨包含退役卫星；不代表在役数量或已完成部署。</small></div>
        <div class="sn-chart-wrap"><svg id="snChart" viewBox="0 0 1000 340" role="img" aria-label="卫星在轨数量随时间变化"></svg></div>
        <label class="sn-date-slider">查看日期<input id="snCursor" type="range" min="0" max="1" value="1" step="1"></label><p id="snReadout" class="sn-readout" aria-live="polite"></p>
        <section class="sn-events" id="snEvents" aria-labelledby="snEventsTitle">
          <div class="sn-events-heading"><div><span class="sw-eyebrow">LAUNCH & REENTRY LOG</span><h3 id="snEventsTitle">发射与再入事件</h3></div><button type="button" data-action="event-csv">导出当前事件明细 CSV</button></div>
          <p class="sn-event-note">每行直接显示发射时间、火箭与上面级、发射场。再入记录保留原始发射资料；再入日期精确到 UTC 日。批次人数仅统计当前系列。</p>
          <div class="sn-event-tools"><label>查看方式<select id="snGrouping"><option value="batch">按发射批次</option><option value="satellite">逐颗卫星</option></select></label><label>事件类型<select id="snEventType"><option value="">全部事件</option><option value="launch">仅发射</option><option value="reentry">仅再入</option></select></label><label>搜索事件<input id="snEventSearch" type="search" placeholder="卫星、NORAD、批次、火箭、发射场…"></label></div>
          <div class="sn-event-summary"><span id="snEventCount" role="status"></span><span>最新事件在前 · 日期随上方范围筛选</span></div>
          <div class="sn-event-table-scroll" tabindex="0" aria-label="发射与再入事件明细表，可横向滚动"><table class="sn-event-table"><thead><tr><th scope="col">事件 / 日期</th><th scope="col">发射批次与卫星</th><th scope="col">发射时间 · UTC</th><th scope="col">火箭 / 上面级</th><th scope="col">发射场 / 发射位</th></tr></thead><tbody id="snRows"></tbody></table></div>
          <nav class="sn-event-pager" aria-label="事件分页"><button type="button" data-action="event-prev">上一页</button><span id="snEventPage"></span><button type="button" data-action="event-next">下一页</button></nav><p id="snEventSource" class="sn-event-note"></p>
        </section></div>`;
    document.body.append(dialog);const el=id=>dialog.querySelector('#'+id);
    let index=null,data=null,plot=null,key='',loadId=0,events=[],view=[],page=0,searchTimer;
    function clear(){
      plot=null;events=[];view=[];page=0;
      el('snStatus').hidden=false;
      for(const id of ['snChart','snMetrics','snRows'])el(id).innerHTML='';
      for(const id of ['snReadout','snEventCount','snEventPage','snEventSource'])el(id).textContent='';
      for(const action of ['csv','event-csv','event-prev','event-next'])dialog.querySelector(`[data-action="${action}"]`).disabled=true;
    }
    function seriesOptions({preserveMissing=false}={}){
      if(!index)return;
      const country=el('snCountry').value,q=el('snSearch').value.trim().toUpperCase();
      const groups=[...index.groups.values()].filter(g=>(!country||g.countryCode===country)&&(!q||(g.label+' '+g.country+' '+g.key).toUpperCase().includes(q))).sort((a,b)=>b.records.size-a.records.size||a.label.localeCompare(b.label));
      el('snSeries').innerHTML=groups.map(g=>`<option value="${esc(g.key)}">${esc(g.country+' · '+g.label)}（${num(g.records.size)} 个历史成员）</option>`).join('');
      if(groups.some(g=>g.key===key))el('snSeries').value=key;else if(preserveMissing&&key)el('snSeries').value='';else key=groups[0]?.key||'';render();
    }
    function render(){
      key=el('snSeries').value;const group=index?.groups.get(key);clear();
      if(!group){el('snTitle').textContent='组网历程';el('snStatus').textContent='没有可统计的历史系列，请调整国家、系列或搜索词。';return;}
      try{plot=M.timeline(group.records.values(),{through:index.through,from:el('snFrom').value,to:el('snTo').value});}catch(error){el('snStatus').textContent=error.message;el('snReadout').textContent='请更正日期后重新应用。';return;}
      el('snStatus').hidden=true;el('snTitle').textContent=group.label+' · 组网历程';dialog.querySelector('header p').textContent=`${group.country} · 历史档案截止 ${index.through}（UTC）`;
      el('snMetrics').innerHTML=[['日末在轨',plot.last.inOrbit],['累计发射',plot.last.totalLaunched],['累计再入',plot.last.totalDecayed],['缺少日期 / 不适用',plot.missingDate+plot.excluded]].map(([label,n])=>`<div><small>${label}</small><strong>${num(n)}</strong></div>`).join('');
      const left=66,right=976,top=25,bottom=292,singleDay=plot.end===plot.start,range=Math.max(M.DAY,plot.end-plot.start),max=Math.max(1,plot.last.totalLaunched,...plot.points.map(p=>p.inOrbit));const x=t=>left+(t-plot.start)/range*(right-left),y=n=>bottom-n/max*(bottom-top);
      let svg='';for(let i=0;i<=4;i++){const n=Math.round(max*i/4),py=y(n);svg+=`<line x1="${left}" y1="${py}" x2="${right}" y2="${py}" class="sn-grid"/><text x="${left-12}" y="${py+4}" text-anchor="end">${num(n)}</text>`;}
      if(singleDay)svg+=`<text x="521" y="322" text-anchor="middle">${date(plot.start)} UTC 日末</text>`;else for(let i=0;i<=4;i++){const t=plot.start+range*i/4;svg+=`<text x="${x(t)}" y="322" text-anchor="${i===0?'start':i===4?'end':'middle'}">${date(t)}</text>`;}
      const path=metric=>singleDay?`M${left},${y(plot.last[metric])}H${right}`:plot.points.map((p,i)=>i?`H${x(p.time)}V${y(p[metric])}`:`M${x(p.time)},${y(p[metric])}`).join('');
      svg+=`<path d="${path('totalLaunched')}" class="sn-launched"/><path d="${path('inOrbit')}" class="sn-orbit"/><line id="snGuide" x1="${right}" y1="${top}" x2="${right}" y2="${bottom}" class="sn-guide"/>`;
      el('snChart').innerHTML=svg;el('snCursor').max=String(Math.max(0,Math.round((plot.end-plot.start)/M.DAY)));el('snCursor').value=el('snCursor').max;cursor();dialog.querySelector('[data-action="csv"]').disabled=false;
      events=M.eventRecords(group.records.values(),data,plot);
      const matched=new Set(events.filter(e=>e.launch.batch).map(e=>e.id)).size,total=new Set(events.map(e=>e.id)).size;
      el('snEventSource').textContent=`已关联发射档案 ${num(matched)} / ${num(total)} 颗 · 发射资料：GCAT · 再入日期：CelesTrak SATCAT · 档案获取 ${data.fetchedAt.replace('T',' ').replace(/\.\d+Z$/,' UTC')}`;
      filterEvents();
    }
    function filterEvents(){page=0;view=M.groupEvents(events,{grouping:el('snGrouping').value,type:el('snEventType').value,query:el('snEventSearch').value});renderEvents();}
    function renderEvents(){
      const pages=Math.max(1,Math.ceil(view.length/PAGE_SIZE));page=Math.max(0,Math.min(page,pages-1));const slice=view.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),individual=el('snGrouping').value==='satellite',count=view.reduce((sum,e)=>sum+e.members.length,0);
      el('snEventCount').textContent=`${num(view.length)} ${individual?'条逐星记录':'条批次事件'} · ${num(count)} 次卫星事件`;el('snEventPage').textContent=`${page+1} / ${pages} 页`;
      dialog.querySelector('[data-action="event-prev"]').disabled=page===0;dialog.querySelector('[data-action="event-next"]').disabled=page>=pages-1;dialog.querySelector('[data-action="event-csv"]').disabled=!view.length;
      el('snRows').innerHTML=slice.length?slice.map(row=>{
        const f=row.launch,memberNames=row.members.map(e=>`<li><span>${esc(e.item.name||'未命名卫星')}</span><small>NORAD ${esc(e.id)}${e.item.internationalDesignator?' · '+esc(e.item.internationalDesignator):''}</small></li>`).join('');
        const stage=f.stages.length?f.stages.map(s=>`<span class="sn-stage">第 ${s.number} 级 · ${esc(s.name)}${s.uncertain?' · 待核实':''}</span>`).join(''):`<span class="sn-stage">${esc(f.upperStage)}</span>`;
        return `<tr><td><span class="sn-event-kind sn-${row.type}">${row.type==='launch'?'↗ 发射':'↘ 再入'}</span><strong class="sn-date">${row.date}</strong><small>${row.type==='reentry'?'UTC · 仅到日期':'UTC 发射日'}</small></td><td><strong>${esc(f.mission||f.batch||'发射批次未确认')}</strong><small>${f.batch?esc(f.batch)+' · ':''}${num(row.members.length)} 颗${el('snEventSearch').value.trim()?'匹配卫星':''}</small><ul class="sn-member-names" tabindex="0" aria-label="本事件全部卫星">${memberNames}</ul></td><td><time>${esc(f.time)}</time>${f.uncertain?'<small class="sn-uncertain">时间待核实</small>':''}</td><td><strong>${esc(f.vehicle)}</strong>${f.flightId?`<small>飞行编号 ${esc(f.flightId)}</small>`:''}<span class="sn-field-label">上面级 / 二级及后续级段</span>${stage}<small class="sn-evidence">${esc(f.evidence)}</small></td><td>${esc(f.site)}</td></tr>`;
      }).join(''):'<tr><td colspan="5" class="sn-empty">当前范围没有匹配事件，请调整日期、事件类型或搜索词。</td></tr>';
    }
    function cursor(){if(!plot)return;const t=plot.start+Number(el('snCursor').value)*M.DAY,p=M.at(plot.points,t);const x=plot.start===plot.end?521:66+(t-plot.start)/Math.max(M.DAY,plot.end-plot.start)*910;const guide=el('snGuide');guide?.setAttribute('x1',x);guide?.setAttribute('x2',x);el('snReadout').textContent=`${date(t)} UTC 日末：在轨 ${num(p.inOrbit)} 颗 · 累计发射 ${num(p.totalLaunched)} 颗 · 累计再入 ${num(p.totalDecayed)} 颗`;}
    function download(rows,label){const url=URL.createObjectURL(new Blob([M.csvText(rows)],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=label+'_'+key.replace(/[^\w-]/g,'_')+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    el('snCursor').addEventListener('input',cursor);el('snChart').addEventListener('pointermove',event=>{if(!plot)return;const r=el('snChart').getBoundingClientRect(),ratio=Math.max(0,Math.min(1,((event.clientX-r.left)/r.width*1000-66)/910));el('snCursor').value=String(Math.round(ratio*Number(el('snCursor').max)));cursor();});
    el('snCountry').addEventListener('change',seriesOptions);el('snSearch').addEventListener('input',()=>{if(index)seriesOptions();});el('snSeries').addEventListener('change',render);
    for(const id of ['snGrouping','snEventType'])el(id).addEventListener('change',filterEvents);
    el('snEventSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(filterEvents,120);});
    dialog.addEventListener('click',e=>{
      const a=e.target.closest('[data-action]')?.dataset.action;if(a==='close'){dialog.close();return;}if(!index)return;
      if(a==='all'){el('snFrom').value='';el('snTo').value='';render();}if(a==='year'){el('snFrom').value=date(M.day(index.through)-365*M.DAY);el('snTo').value=index.through;render();}if(a==='apply')render();
      if(a==='events-jump')el('snEvents').scrollIntoView({block:'start'});
      if(a==='event-prev'||a==='event-next'){page+=a==='event-next'?1:-1;renderEvents();el('snEvents').scrollIntoView({block:'start'});}
      if(a==='csv'&&plot)download([['日期_UTC_日末','当日发射','当日再入','在轨数量','累计发射','累计再入'],...M.dailyRows(plot)],'卫星组网历程');
      if(a==='event-csv'&&view.length){clearTimeout(searchTimer);filterEvents();download(M.eventCsvRows(view.flatMap(row=>row.members)),'卫星发射与再入明细');}
    });
    dialog.addEventListener('close',()=>{loadId++;clearTimeout(searchTimer);});
    return {async open(config={}){
      if(!dialog.open)dialog.showModal();dialog.scrollTop=0;const request=++loadId;key=config.series||'';index=null;clear();el('snTitle').textContent='组网历程';el('snEventSearch').value='';el('snEventType').value='';el('snStatus').textContent='正在读取完整发射与再入档案…';
      try{data=await options.data();if(request!==loadId||!dialog.open)return;const s=options.snapshot();index=M.buildHistoryIndex(data,s.items,s.classifications,root.NotamSatelliteSeries);el('snCountry').innerHTML='<option value="">全部</option>'+[...new Map([...index.groups.values()].map(g=>[g.countryCode,g.country]))].sort((a,b)=>a[1].localeCompare(b[1],'zh-CN')).map(([code,label])=>`<option value="${esc(code)}">${esc(label)}</option>`).join('');el('snSearch').value='';el('snFrom').value='';el('snTo').value='';el('snFrom').max=index.through;el('snTo').max=index.through;seriesOptions({preserveMissing:Boolean(config.series)});}
      catch(error){if(request===loadId)el('snStatus').textContent='档案暂不可用：'+error.message+'。请在数据管理中更新后重试。';}
    }};
  }
  root.NotamSatelliteNetwork={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
