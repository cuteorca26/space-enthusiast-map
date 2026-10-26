(function(root){
  'use strict';
  const M=root.NotamSatelliteAnalysisModel;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=x=>Number.isFinite(x)?x.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
  const date=x=>{const n=typeof x==='number'?x:M.epochMs(x);return Number.isFinite(n)?new Date(n).toISOString().replace('T',' ').replace(/\.\d+Z$/,' UTC'):'未提供';};
  const safeLink=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  const purposeLabels=Object.fromEntries(root.NotamSatelliteExplorer.PURPOSES);
  const scaleLabels={scale:'半长轴高度 a − R⊕ (km)',perigee:'近地点高度 (km)',apogee:'远地点高度 (km)'};
  const types={ACTIVE_PAYLOAD:'在役卫星',RETIRED_PAYLOAD:'退役卫星',ROCKET_BODY:'火箭体',DEBRIS:'碎片 / 部件',UNKNOWN:'状态未知'};
  function mount(options){
    const dialog=document.createElement('dialog');dialog.className='sa-dialog';dialog.setAttribute('aria-labelledby','saTitle');
    dialog.innerHTML=`<header class="sa-header"><div><span class="sa-eyebrow">SATELLITE WORKBENCH</span><h2 id="saTitle">轨道分析与发射关系</h2><p id="saContext">找出同一群卫星，比较轨道，再带回地图。</p></div><nav><button type="button" data-action="network">组网历程</button><button type="button" data-action="focusView" aria-pressed="false">专注图表</button><button type="button" data-action="close">返回地图 ×</button></nav></header>
      <div class="sa-content"><div class="sa-source"><strong id="saScope"></strong><button type="button" data-action="all">全目录</button><button type="button" data-action="selected">地图已选</button><span id="saSource"></span></div>
      <div class="sa-filters"><label class="sa-search">名称 / 编号 / 关系关键词<input id="saQuery" type="search" placeholder="如 遥感、Kuiper、A0389、Starlink Group 17-50" autocomplete="off"></label>
        <label>国家 / 机构<select id="saCountry"><option value="">全部</option></select></label><label>用途<select id="saPurpose"><option value="">全部</option>${Object.entries(purposeLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>系列<select id="saSeries"><option value="">全部</option></select></label><label>发射批次 / 发射日期<input id="saBatch" type="search" list="saBatchList" placeholder="如 2026-190 或 2026-08-19"><datalist id="saBatchList"></datalist></label>
        <label>对象类型<select id="saObject"><option value="">全部</option>${Object.entries(types).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>质量 / 地图状态<select id="saQuality"><option value="">全部</option><option value="available">可用轨道</option><option value="pending">待检查</option><option value="stale">根数过旧</option><option value="future">历元晚于分析时刻</option><option value="failed">传播失败</option><option value="missing">根数不完整</option><option value="unconfirmed">分类待确认</option><option value="selected">已加入地图</option></select></label><button type="button" data-action="reset">清除筛选</button></div>
      <details class="sa-advanced"><summary>轨道类别与参数范围 <span id="saRangeSummary"></span></summary><div class="sa-range-fields"><label>目录轨道类别<select id="saOrbit"><option value="">全部</option></select></label><label>倾角下限 °<input id="saInclinationMin" type="number" min="0" max="180" step="any" placeholder="不限"></label><label>倾角上限 °<input id="saInclinationMax" type="number" min="0" max="180" step="any" placeholder="不限"></label><label>高度参数<select id="saHeightField"><option value="scale">半长轴高度</option><option value="perigee">近地点高度</option><option value="apogee">远地点高度</option></select></label><label>高度下限 km<input id="saHeightMin" type="number" step="any" placeholder="不限"></label><label>高度上限 km<input id="saHeightMax" type="number" step="any" placeholder="不限"></label><button type="button" data-action="range">应用范围</button><button type="button" data-action="clearRange">清除范围</button></div><p class="sa-caption" id="saRangeHint">范围作用于分析时刻的轨道参数；留空表示不限。目录轨道类别沿用原目录标记。切换图表不会改变筛选。</p></details>
      <div id="saActiveFilters" class="sa-active-filters" aria-label="当前筛选条件"></div>
      <div id="saRelation" class="sa-relation" hidden></div>
      <div class="sa-metrics" id="saMetrics" aria-live="polite"></div><p class="sa-caption" id="saCountHelp"></p>
      <div class="sa-clock"><label>统一分析时刻（UTC）<input id="saTime" type="datetime-local" step="1"></label><button type="button" data-action="time">按此时刻重算</button><button type="button" data-action="mapTime">采用地图时间</button><label>旧根数阈值（天）<input id="saStale" type="number" min="0.1" max="3650" step="0.1" value="7"></label><span id="saProgress" role="status"></span></div>
      <div class="sa-main"><section class="sa-chart-section" aria-label="轨道参数图">
        <div class="sa-chart-controls"><label>图表<select id="saKind"><option value="scale">倾角 × 轨道尺度</option><option value="plane">赤经 × 沿轨相位</option></select></label><label id="saScaleLabel">纵轴<select id="saScale">${Object.entries(scaleLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>颜色<select id="saColor"><option value="country">国家</option><option value="purpose">用途组合</option><option value="series">系列</option><option value="batch">发射批次</option></select></label><label id="saOriginLabel" hidden>赤经切口<select id="saOrigin"><option value="0">0° / 360°</option><option value="180">180° / 540°（跨零度）</option></select></label><label id="saPhaseOriginLabel" hidden>相位切口<select id="saPhaseOrigin"><option value="0">0° / 360°</option><option value="180">180° / 540°（跨零度）</option></select></label><label>拖动操作<select id="saDragMode"><option value="brush">框选成员</option><option value="pan">平移视野</option></select></label><button type="button" data-action="resetZoom">完整视野</button><button type="button" data-action="zoomBrush">放大框选</button></div>
        <div class="sa-canvas-wrap"><canvas id="saCanvas" role="img" aria-label="轨道散点图；可拖动框选或点击卫星。相同数据也列在下方参数表。" tabindex="0"></canvas><div id="saHover" class="sa-hover" hidden></div></div>
        <p class="sa-caption" id="saPlotStatus"></p><div class="sa-selection-bar"><strong id="saPickedSummary">已勾选 0 个</strong><button type="button" data-action="showPicked">查看勾选名单 ↓</button><button type="button" data-action="addPicked" class="sa-primary">将勾选加入地图</button></div><p class="sa-caption">拖动可框选或平移；Shift 框选追加；滚轮缩放，Home 恢复完整视野。重叠点先展开候选名单，点击具体名称再定位；下方名单也能完成选择操作。</p>
        <details class="sa-legend"><summary id="saLegendTitle">颜色图例</summary><div id="saLegend"></div></details>
      </section><aside class="sa-inspector" aria-label="卫星参数和分类证据"><h3>单星档案与关系</h3><div id="saInspector"><p>点击散点或名单中的卫星，查看根数、证据，以及同批发射和同系列成员。</p></div></aside></div>
      <section class="sa-members"><div class="sa-members-head"><h3>成员名单与轨道参数</h3><span id="saMemberCount"></span><label><input type="checkbox" id="saOnlyBrush">仅看框选 / 勾选</label><button type="button" data-action="pickMatches">勾选全部匹配</button><button type="button" data-action="clearPick">清空勾选</button><button type="button" data-action="add" class="sa-primary">加入地图</button><button type="button" data-action="remove">从地图移除</button><button type="button" data-action="csv">导出名单 CSV</button></div>
      <div class="sa-table-tools"><label>名单排序<select id="saSort"><option value="catalog">目录顺序</option><option value="id">NORAD 编号</option><option value="name">卫星名称</option><option value="batch">发射批次</option><option value="inclination">倾角</option><option value="scale">半长轴高度</option><option value="perigee">近地点高度</option><option value="apogee">远地点高度</option><option value="raan">升交点赤经</option><option value="phase">沿轨相位</option><option value="epoch">轨道历元</option></select></label><button type="button" data-action="sortDirection">升序 ↑</button><span>缺失参数始终排在最后；导出采用当前名单和排序。</span></div><p id="saActionStatus" class="sa-caption"></p><div class="sa-table-scroll" tabindex="0" aria-label="卫星成员参数表"><table><thead><tr><th>选择</th><th>卫星 / NORAD</th><th>国家 / 系列</th><th>发射批次</th><th>倾角 °</th><th>a − R⊕ km</th><th>近地 / 远地 km</th><th>RAAN / 相位 °</th><th>根数与地图状态</th><th>轨道历元 UTC</th></tr></thead><tbody id="saRows"></tbody></table></div>
      <div class="sa-pager"><button type="button" data-action="prev">上一页</button><span id="saPage"></span><button type="button" data-action="next">下一页</button></div></section>
      <details class="sa-help"><summary>读图、计数与数据来源说明</summary><p>倾角表示轨道面相对赤道的夹角。半长轴高度是 a 减去参考地球半径，不是卫星瞬时离地高度。近地、远地及倾角均为分析时刻的 SGP4 平均根数；参考半径 6378.135 km，与本软件使用的传播库一致。</p><p>轨道面图采用同一 UTC 时刻的平均升交点赤经 Ω 与平均纬度幅角 u = ω + M（沿轨相位），范围为 0–360°；这不是地面经度，也不是真近点角。赤经和相位的角度切口可分别调整，方便框选跨 0° 的星群；大于 360° 的读数与减去 360° 后方向相同。几乎位于赤道面的对象没有稳定的升交点定义，单列提示并保留在名单中。图上的接近关系不构成身份或编队证据。</p><p>“本组”指当前入口、国家、系列、发射批次和关系共同限定的目录对象；搜索、用途、类型、轨道类别、参数范围和质量进一步得到“筛选匹配”。每项按 NORAD 去重。“已确认成员”依据已有分类证据，候选身份不计入；“有可用轨道”指在分析时刻已成功传播。过旧根数仍可画出，另行标记。地图已加入与可绘制分别计数，后者不是相机当前能看见的数量。</p><p>同次发射依据国际编号的 YYYY-NNN 前缀，包含搭载卫星、火箭体和碎片；它不等于同一用途或运营商。项目与平台关系只使用已有确认资料。统计只覆盖当前目录已知对象，不代表某个星座计划总数，也不能据此推断尚无公开轨道的卫星不存在。数据获取时间、证据日期与根数历元分开显示；缺少逐星获取时间时明确标为批次时间。</p><p>分析是冻结时刻的快照，不跟随动画逐帧重算。点击“定位地图”或加入地图时，地图会暂停在该分析时刻。关闭后停止分析线程。原有根数、卫星类别、轨迹与覆盖区均由原地图流程绘制。</p><p><a href="https://github.com/shashwatak/satellite-js" target="_blank" rel="noopener noreferrer">SGP4 传播库与算法文档</a> · 分类证据见逐星档案。</p></details></div>`;
    dialog.insertAdjacentHTML('beforeend','<div id="saToast" class="sa-toast" role="status" hidden></div>');
    document.body.appendChild(dialog);
    const el=id=>dialog.querySelector('#'+id),btn=a=>dialog.querySelector(`[data-action="${a}"]`);
    const canvas=el('saCanvas'),ctx=canvas.getContext('2d'),plotCache=document.createElement('canvas');
    let records=new Map(),results=new Map(),scope=null,scopeLabel='全目录',source={},snapshot=null,timeMs=Date.now(),staleDays=7;
    let filters={},kind='scale',scale='scale',colorBy='country',origin=0,phaseOrigin=0,sortKey='catalog',sortDirection='asc',sortCache=null,queryResult={cohort:[],matched:[]},picked=new Set(),focus='',page=0,tableIds=[];
    let worker=null,requestId=0,queryTimer=0,frame=0,plotPoints=[],grid=new Map(),bounds=null,manualBounds=null,drag=null,hoverIds=[],width=800,height=380;
    let selected=new Set(),drawn=new Set(),drawVersion='',renderedCount=0,lastSyncAt=0,syncTimer=0;
    const PAD={left:78,right:22,top:24,bottom:52};
    const inputs={saQuery:'query',saCountry:'country',saPurpose:'purpose',saSeries:'series',saBatch:'batch',saObject:'objectClass',saQuality:'quality',saOrbit:'orbit'};
    let noticeTimer=0;
    function notify(text){el('saActionStatus').textContent=text;el('saToast').textContent=text;el('saToast').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{el('saToast').hidden=true;},5500);}
    function resetFilters(){filters={};for(const id of Object.keys(inputs))el(id).value='';for(const id of ['saInclinationMin','saInclinationMax','saHeightMin','saHeightMax'])el(id).value='';el('saRelation').hidden=true;el('saRangeHint').textContent='范围作用于分析时刻的轨道参数；留空表示不限。目录轨道类别沿用原目录标记。';}
    function activeFilters(){
      const labels={query:'搜索',country:'国家',purpose:'用途',series:'系列',batch:'批次',objectClass:'类型',quality:'质量',orbit:'轨道类别'};
      const chips=Object.entries(inputs).filter(([,key])=>filters[key]).map(([id,key])=>{const input=el(id),value=input.tagName==='SELECT'?input.selectedOptions[0]?.textContent:filters[key];return '<button type="button" data-clear-filter="'+key+'" aria-label="移除 '+esc(labels[key]+'：'+value)+'">'+esc(labels[key]+'：'+value)+' ×</button>';});
      const ranges=Object.entries(filters.ranges||{}).map(([k,v])=>({inclination:'倾角',...scaleLabels}[k])+' '+(v.min??'不限')+'～'+(v.max??'不限'));
      if(ranges.length)chips.push('<button type="button" data-clear-filter="ranges">'+esc(ranges.join('；'))+' ×</button>');
      el('saActiveFilters').innerHTML=(scope?'<span>入口范围：'+esc(scopeLabel)+' · 可用“全目录”扩大范围</span>':'')+chips.join('');
      el('saRangeSummary').textContent=ranges.length?'· 已应用 '+ranges.length+' 项范围':'';
    }
    function applyRanges(){
      const ranges={},pairs=[['inclination','saInclinationMin','saInclinationMax'],[el('saHeightField').value,'saHeightMin','saHeightMax']];
      for(const [key,lo,hi]of pairs){const low=el(lo),high=el(hi),min=M.number(low.value),max=M.number(high.value);
        if(!low.validity.valid||!high.validity.valid||Number.isFinite(min)&&Number.isFinite(max)&&min>max){el('saRangeHint').textContent='范围未应用：请填写有效数值，且下限不能大于上限；倾角须在 0–180°。';notify(el('saRangeHint').textContent);return false;}
        if(Number.isFinite(min)||Number.isFinite(max))ranges[key]={min:Number.isFinite(min)?min:undefined,max:Number.isFinite(max)?max:undefined};
      }
      filters.ranges=ranges;el('saRangeHint').textContent='范围已应用；只有对应参数可用且落在范围内的对象会匹配。';updateQuery();return true;
    }
    function updateSeries(){const keys=new Map();for(const r of records.values())for(const g of r.memberships)if(!filters.country||g.countryCode===filters.country)keys.set(g.groupKey,g);el('saSeries').innerHTML='<option value="">全部</option>'+[...keys.values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')).map(g=>`<option value="${esc(g.groupKey)}">${esc(g.country+' · '+g.label)}</option>`).join('');if(filters.series&&!keys.has(filters.series))filters.series='';el('saSeries').value=filters.series||'';}
    function batchSuggestions(){const keys=new Map(),q=M.normalize(el('saBatch').value);for(const r of records.values())if(r.batch&&(!q||M.normalize([r.batch,...r.batchAliases,r.item.launchDate].join(' ')).includes(q))){if(!keys.has(r.batch))keys.set(r.batch,{n:0,aliases:r.batchAliases});keys.get(r.batch).n++;}el('saBatchList').innerHTML=[...keys].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,60).map(([k,v])=>`<option value="${esc(k)}">${esc(v.aliases.join(' / '))} · ${v.n} 个已知对象</option>`).join('');}
    function refreshMapState(){const s=options.mapState();selected=s.selected;drawn=s.drawn;}
    function updateQuery(reset=true){
      drag=null;plotCache.width=0;
      refreshMapState();queryResult=M.query(records,filters,{scope,results,timeMs,staleDays,selected});
      if(reset){page=0;picked.clear();el('saOnlyBrush').checked=false;manualBounds=null;}
      else{const n=picked.size;picked=M.retainMatched(picked,queryResult.matched);if(n>picked.size)notify('条件或轨道状态已变化，已取消 '+(n-picked.size)+' 个不再匹配对象的勾选。');}
      activeFilters();
      el('saScope').textContent=scopeLabel;renderMetrics();renderTable();scheduleDraw();
      if(focus)renderInspector();
    }
    function renderMetrics(){
      const s=M.summarize(records,queryResult.cohort,results,timeMs,staleDays,selected,drawn),m=M.summarize(records,queryResult.matched,results,timeMs,staleDays,selected,drawn);
      el('saContext').textContent=[filters.series?el('saSeries').selectedOptions[0]?.textContent:scopeLabel,filters.country?el('saCountry').selectedOptions[0]?.textContent:'',filters.batch?'批次 '+filters.batch:'',filters.query?'搜索 '+filters.query:'',`匹配 ${fmt(m.total)} 个对象`].filter(Boolean).join(' · ');
      el('saMetrics').innerHTML=[['已确认成员',s.confirmed,'本组 '+fmt(s.total)+' 个已知对象'],['有可用轨道',s.available,'完整根数 '+fmt(s.complete)+' · 待检查 '+fmt(s.pending)],['当前筛选匹配',m.total,'可用轨道 '+fmt(m.available)],['实际加入地图',m.selected,'其中可绘制 '+fmt(m.drawn)],['根数过旧',s.stale,'本组 · 超过 '+staleDays+' 天'],['传播失败 / 不完整',`${s.failed} / ${s.missing}`,'本组 · 保留在名单可查']].map(([title,n,sub])=>`<div><span>${title}</span><strong>${typeof n==='number'?fmt(n):n}</strong><small>${sub}</small></div>`).join('');
      el('saCountHelp').textContent=`本组计数不随关键词、用途、质量过滤缩小；“加入地图”计数针对当前匹配。历元晚于分析时刻 ${fmt(s.future)} 个；近赤道轨道面未定义 ${fmt(s.undefinedPlane)} 个。目录外、未提供轨道的计划成员不计入。`;
    }
    function runAnalysis(){
      worker?.terminate();results=new Map();requestId++;const token=requestId;
      try{
        worker=new Worker('/frontend/satellite-analysis-worker.mjs?v=20261022-review-2',{type:'module'});
        worker.onmessage=({data})=>{
          if(token!==requestId||data.requestId!==requestId||!dialog.open)return;
          if(data.type==='progress'){el('saProgress').textContent=`后台计算 ${fmt(data.done)} / ${fmt(data.total)}`;return;}
          results=new Map(data.results.map(r=>[r.id,r]));el('saProgress').textContent=`检查完成 · ${fmt(data.results.length)} 个对象 · ${(data.computeMs/1000).toFixed(2)} 秒`;
          dialog.dataset.computeMs=String(data.computeMs);worker?.terminate();worker=null;updateQuery(false);
        };
        worker.onerror=()=>{if(token!==requestId)return;worker?.terminate();worker=null;el('saProgress').textContent='分析线程未能载入，请点击“按此时刻重算”重试；待检查不计为传播失败。';updateQuery(false);};
        worker.postMessage({requestId:token,timeMs,items:[...records.values()].map(r=>({id:r.id,omm:r.item.omm}))});
        el('saProgress').textContent='正在后台检查全部根数及同一时刻的轨道…';
      }catch(error){worker?.terminate();worker=null;el('saProgress').textContent='无法启动分析线程：'+error.message;}
      updateQuery(false);
    }
    function capture(at){
      snapshot=options.snapshot(at);timeMs=snapshot.timeMs;source=snapshot.source||{};
      records=M.buildRecords(snapshot.items,snapshot.classifications,snapshot.index,snapshot.evidence,source);
      const countries=new Map();for(const r of records.values())for(const g of r.memberships)countries.set(g.countryCode,g.country);
      el('saCountry').innerHTML='<option value="">全部</option>'+[...countries].sort((a,b)=>a[1].localeCompare(b[1],'zh-CN')).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');
      el('saCountry').value=filters.country||'';el('saOrbit').innerHTML='<option value="">全部</option>'+[...new Set([...records.values()].map(r=>r.item.orbitClass).filter(Boolean))].sort().map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');el('saOrbit').value=filters.orbit||'';updateSeries();batchSuggestions();
      el('saTime').value=new Date(timeMs).toISOString().slice(0,19);
      el('saSource').textContent=`${snapshot.modeLabel} · 目录获取：${date(source.fetchedAt)} · 分类只读`;
      runAnalysis();
    }
    function status(r){const p=results.get(r.id),q=M.quality(r,p,timeMs,staleDays),parts=[];
      if(q.missing)parts.push('根数不完整');else if(q.failed)parts.push('传播失败');else if(q.pending)parts.push('待检查');else parts.push('可传播');
      if(q.stale)parts.push(`过旧 ${fmt(q.offsetDays)} 天`);if(q.future)parts.push(`历元在之后 ${fmt(-q.offsetDays)} 天`);if(q.distant)parts.push('远离历元');
      if(!r.confirmed)parts.push('分类待确认');if(selected.has(r.id))parts.push(drawn.has(r.id)?'地图可绘制':'地图已加入，暂未绘制');return parts.join(' · ');
    }
    function prepareTable(){
      if(!sortCache||sortCache.ids!==queryResult.matched||sortCache.results!==results||sortCache.key!==sortKey||sortCache.direction!==sortDirection)sortCache={ids:queryResult.matched,results,key:sortKey,direction:sortDirection,sorted:M.sortIds(queryResult.matched,records,results,sortKey,sortDirection)};
      tableIds=el('saOnlyBrush').checked?sortCache.sorted.filter(id=>picked.has(id)):sortCache.sorted;
    }
    function renderTable(){
      const active=document.activeElement,restore=active?.closest('#saRows')?{pick:active.dataset.pick,focus:active.dataset.focus}:null;
      prepareTable();
      
      page=Math.max(0,Math.min(page,Math.ceil(tableIds.length/60)-1));
      el('saMemberCount').textContent=`名单 ${fmt(tableIds.length)} · 框选 / 勾选 ${fmt(picked.size)}`;
      el('saPickedSummary').textContent='已勾选 '+fmt(picked.size)+' 个对象';btn('sortDirection').disabled=sortKey==='catalog';
      for(const a of ['add','remove','clearPick','zoomBrush','showPicked','addPicked'])btn(a).disabled=!picked.size;
      btn('pickMatches').disabled=!queryResult.matched.length;btn('csv').disabled=!tableIds.length;
      el('saRows').innerHTML=tableIds.slice(page*60,(page+1)*60).map(id=>{const r=records.get(id),p=results.get(id);return `<tr data-row="${esc(id)}"${focus===id?' class="sa-focused"':''}><td><input type="checkbox" data-pick="${esc(id)}" aria-label="勾选 ${esc(r.item.name)}"${picked.has(id)?' checked':''}></td><td><button type="button" data-focus="${esc(id)}">${esc(r.item.name)}</button><small>${esc(id)} · ${esc(r.item.internationalDesignator||'国际编号未知')}</small></td><td>${esc(r.c.country||'待核实')}<small>${esc(r.c.label||'待核实')}</small></td><td>${esc(r.batch||'未知')}</td><td>${fmt(p?.inclination)}</td><td>${fmt(p?.scale)}</td><td>${fmt(p?.perigee)} / ${fmt(p?.apogee)}</td><td>${p?.planeDefined?fmt(p.raan)+' / '+fmt(p.phase):'—'}</td><td>${esc(status(r))}</td><td>${esc(date(r.epoch))}</td></tr>`;}).join('')||'<tr><td colspan="10">没有符合条件的对象。可清除筛选或取消“仅看框选”。</td></tr>';
      el('saPage').textContent=`${page+1} / ${Math.max(1,Math.ceil(tableIds.length/60))} 页 · 每页最多 60 个`;
      btn('prev').disabled=page===0;btn('next').disabled=(page+1)*60>=tableIds.length;
      if(restore){const node=restore.pick?el('saRows').querySelector('[data-pick="'+CSS.escape(restore.pick)+'"]'):restore.focus?el('saRows').querySelector('[data-focus="'+CSS.escape(restore.focus)+'"]'):null;(node||dialog.querySelector('.sa-table-scroll')).focus({preventScroll:true});}
    }
    function renderInspector(){
      const r=records.get(focus);if(!r){el('saInspector').innerHTML='<p>点击散点或名单查看详情。</p>';return;}
      const p=results.get(focus),link=safeLink(r.c.sourceUrl),candidate=r.c.candidate;
      const preserve=el('saInspector').dataset.focus===focus,expanded=preserve&&el('saInspector').querySelector('details')?.open,scroll=preserve?el('saInspector').parentElement.scrollTop:0;el('saInspector').dataset.focus=focus;
      const field=(k,v)=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
      el('saInspector').innerHTML=`<h4>${esc(r.item.name)}</h4><p>NORAD ${esc(r.id)} · ${esc(r.item.internationalDesignator||'国际编号未提供')}</p><p class="sa-status">${esc(status(r))}</p>${queryResult.matched.includes(focus)?'':'<p class="sa-candidate">此对象不在当前筛选中；档案保留，便于继续查找关系。</p>'}
        <button type="button" data-action="locate" class="sa-primary">定位地图并查看参数</button><div class="sa-rel-buttons"><button type="button" data-relation="launch" ${r.batch?'':'disabled'}>同次发射</button><button type="button" data-relation="series" ${r.confirmed?'':'disabled'}>同系列 / 已确认关系</button><button type="button" data-relation="program" ${r.program?'':'disabled'}>同项目</button><button type="button" data-relation="platform" ${r.memberships.length>1?'':'disabled'}>同平台系列</button></div>
        <dl>${field('分类',r.memberships.map(g=>g.country+' · '+g.label+(g.relation?'（'+g.relation+'）':'')).join('；'))}${field('用途',r.purposes.map(p=>purposeLabels[p]).join(' / '))}${field('发射批次',r.batch+(r.batchAliases.length?' · '+r.batchAliases.join(' / '):'')||'未知')}${Object.entries(options.launchInfo?.(r.item)||{}).filter(([k])=>['time','site','vehicle','upperStage'].includes(k)).map(([k,v])=>field({time:'发射时间',site:'发射场 / 工位',vehicle:'运载火箭',upperStage:'上面级'}[k],v)).join('')}${field('公开项目',r.program||'未确认')}${field('目录登记 / 对接',[(r.item.owner||''),(r.item.dockedTo||'')].filter(Boolean).join(' / ')||'未提供')}
        ${field('分类证据',`${r.c.evidenceLabel||'未确认'} · ${r.c.method||'未提供'}`)}${field('证据日期',date(r.evidenceAt))}${field('数据获取时间',date(r.fetchedAt))}${field('获取时间口径',r.fetchScope)}${field('轨道历元',date(r.epoch))}${field('统一分析时刻',date(timeMs))}${field('根数来源',r.item.elementSource||snapshot.modeLabel)}${field('当前轨道参数',p?.status==='ok'?`倾角 ${fmt(p.inclination)}°；a−R⊕ ${fmt(p.scale)} km；近/远地 ${fmt(p.perigee)} / ${fmt(p.apogee)} km；周期 ${fmt(p.period)} 分`:(p?.reason||r.validation.reason||'待检查'))}${field('沿轨相位',p?.planeDefined?`${fmt(p.phase)}° · 平均纬度幅角 ω + M`:'尚不可用或赤道面未定义')}${r.c.reviewNote?field('复核说明',r.c.reviewNote):''}</dl>
        ${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">打开分类证据来源 ↗</a>`:''}
        ${candidate?`<div class="sa-candidate"><strong>候选身份 · 未确认为此成员</strong><p>${esc((candidate.names||[]).join(' / '))}</p><small>${esc(candidate.reason||'仅作为搜索线索')}</small></div>`:''}
        <details${expanded?' open':''}><summary>原名与公开别名</summary><p>${esc((r.c.aliases||[]).join(' · ')||r.item.name)}</p></details>`;
      el('saInspector').parentElement.scrollTop=scroll;
    }
    function focusSatellite(id,locate=true){
      if(!records.has(id))return;focus=id;if(el('saOnlyBrush').checked&&!picked.has(id))el('saOnlyBrush').checked=false;
      prepareTable();
      const at=tableIds.indexOf(id);if(at>=0)page=Math.floor(at/60);renderInspector();renderTable();scheduleDraw();
      if(locate){const out=options.focus(id,timeMs,snapshot);notify(out?.message||'参数已选中；返回地图查看定位。');refreshMapState();renderMetrics();renderTable();renderInspector();}
      const row=el('saRows').querySelector('.sa-focused'),scroller=dialog.querySelector('.sa-table-scroll');
      if(row)scroller.scrollTop+=row.getBoundingClientRect().top-scroller.getBoundingClientRect().top-36;
    }
    function relationship(kind){
      if(!focus)return;const r=records.get(focus);resetFilters();scope=null;scopeLabel='关系搜索';filters.relation=kind;filters.anchor=focus;
      el('saRelation').hidden=false;el('saRelation').innerHTML=`<strong>${esc(r.item.name)}</strong> → ${esc({launch:'同次发射 '+r.batch,series:'同系列与已确认关联',program:'同项目 '+r.program,platform:'同平台系列'}[kind])} <button type="button" data-action="clearRelation">解除关系筛选</button>`;
      updateSeries();updateQuery();
    }
    function scheduleDraw(){if(!frame&&dialog.open)frame=requestAnimationFrame(()=>{frame=0;draw();});}
    function getBounds(points){
      if(kind==='plane')return {x0:0,x1:360,y0:0,y1:360};
      if(!points.length)return {x0:0,x1:180,y0:0,y1:1000};
      let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of points){x0=Math.min(x0,p.value[0]);x1=Math.max(x1,p.value[0]);y0=Math.min(y0,p.value[1]);y1=Math.max(y1,p.value[1]);}
      const dx=Math.max(.15,(x1-x0)*.05),dy=Math.max(5,(y1-y0)*.06);return {x0:Math.max(0,x0-dx),x1:Math.min(180,x1+dx),y0:y0-dy,y1:y1+dy};
    }
    function px(v){return PAD.left+(v-bounds.x0)/(bounds.x1-bounds.x0)*(width-PAD.left-PAD.right);}
    function py(v){return height-PAD.bottom-(v-bounds.y0)/(bounds.y1-bounds.y0)*(height-PAD.top-PAD.bottom);}
    function unproject(x,y){return [bounds.x0+(x-PAD.left)/(width-PAD.left-PAD.right)*(bounds.x1-bounds.x0),bounds.y0+(height-PAD.bottom-y)/(height-PAD.top-PAD.bottom)*(bounds.y1-bounds.y0)];}
    function draw(){
      if(!dialog.open)return;const rect=canvas.getBoundingClientRect();width=Math.max(PAD.left+PAD.right+1,rect.width);height=Math.max(PAD.top+PAD.bottom+1,rect.height);const dpr=Math.min(2,devicePixelRatio||1);
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      // Brush motion only repaints the rubber band; do not re-index 33k points,
      // rebuild the legend, or rerun propagation for every pointer event.
      if(drag&&!drag.pan&&plotCache.width===canvas.width&&plotCache.height===canvas.height){ctx.drawImage(plotCache,0,0,width,height);drawBrush();return;}
      const points=[],legend=new Map();for(const id of queryResult.matched){const value=M.axes(results.get(id),kind,scale,origin,phaseOrigin);if(!value||!value.every(Number.isFinite))continue;const key=M.colorKey(records.get(id),colorBy,purposeLabels);points.push({id,value,key});legend.set(key,(legend.get(key)||0)+1);}
      bounds=manualBounds||getBounds(points);ctx.font='11px system-ui';ctx.lineWidth=1;
      for(let n=0;n<=5;n++){const t=n/5,x=PAD.left+t*(width-PAD.left-PAD.right),y=height-PAD.bottom-t*(height-PAD.top-PAD.bottom);ctx.strokeStyle='#26394b';ctx.beginPath();ctx.moveTo(x,PAD.top);ctx.lineTo(x,height-PAD.bottom);ctx.moveTo(PAD.left,y);ctx.lineTo(width-PAD.right,y);ctx.stroke();ctx.fillStyle='#aac0d4';ctx.textAlign='center';ctx.fillText(fmt(bounds.x0+t*(bounds.x1-bounds.x0)+(kind==='plane'?origin:0)),x,height-PAD.bottom+18);ctx.textAlign='right';ctx.fillText(fmt(bounds.y0+t*(bounds.y1-bounds.y0)+(kind==='plane'?phaseOrigin:0)),PAD.left-9,y+4);}
      ctx.textAlign='center';ctx.fillStyle='#d8e6f2';ctx.fillText(kind==='plane'?'升交点赤经 Ω (°)':'倾角 (°)',PAD.left+(width-PAD.left-PAD.right)/2,height-9);
      ctx.save();ctx.translate(16,PAD.top+(height-PAD.top-PAD.bottom)/2);ctx.rotate(-Math.PI/2);ctx.fillText(kind==='plane'?'沿轨相位 ω + M (°)':scaleLabels[scale],0,0);ctx.restore();
      ctx.save();ctx.beginPath();ctx.rect(PAD.left,PAD.top,width-PAD.left-PAD.right,height-PAD.top-PAD.bottom);ctx.clip();
      plotPoints=[];grid=new Map();const buckets=new Map();
      for(const p of points){p.x=px(p.value[0]);p.y=py(p.value[1]);if(p.x<PAD.left||p.x>width-PAD.right||p.y<PAD.top||p.y>height-PAD.bottom)continue;plotPoints.push(p);const cell=`${Math.floor(p.x/16)},${Math.floor(p.y/16)}`;if(!grid.has(cell))grid.set(cell,[]);grid.get(cell).push(p);if(!buckets.has(p.key))buckets.set(p.key,[]);buckets.get(p.key).push(p);}
      for(const [key,list]of buckets){ctx.fillStyle=M.colorFor(key);ctx.globalAlpha=picked.size?.28:.72;ctx.beginPath();for(const p of list){ctx.moveTo(p.x+2.5,p.y);ctx.arc(p.x,p.y,2.5,0,Math.PI*2);}ctx.fill();}
      ctx.globalAlpha=1;ctx.strokeStyle='#ffffff';ctx.lineWidth=.8;for(const [key,list]of buckets){ctx.fillStyle=M.colorFor(key);ctx.beginPath();for(const p of list)if(picked.has(p.id)){ctx.moveTo(p.x+3.3,p.y);ctx.arc(p.x,p.y,3.3,0,Math.PI*2);}ctx.fill();ctx.stroke();}
      const fp=plotPoints.find(p=>p.id===focus);if(fp){ctx.strokeStyle='#f7c768';ctx.lineWidth=2;ctx.beginPath();ctx.arc(fp.x,fp.y,7,0,Math.PI*2);ctx.stroke();}
      ctx.restore();renderedCount=points.length;canvas.dataset.points=String(points.length);canvas.dataset.visiblePoints=String(plotPoints.length);canvas.dataset.picked=String(picked.size);canvas.dataset.focus=focus;
      el('saPlotStatus').textContent=`${fmt(points.length)} 个可绘制点 / ${fmt(queryResult.matched.length)} 个匹配；当前视野 ${fmt(plotPoints.length)} 个。分析时刻 ${date(timeMs)}。${kind==='plane'?'0° 与 360° 为同一方向。':''}`;
      if(!points.length){ctx.fillStyle='#b8cede';ctx.textAlign='center';ctx.font='14px system-ui';ctx.fillText(worker?'后台计算中…':'此筛选没有可用绘图点，请查看下方成员状态。',width/2,height/2);}
      el('saLegendTitle').textContent=`颜色图例 · ${legend.size} 类${colorBy==='purpose'?'（多用途按组合显示）':''}`;
      el('saLegend').innerHTML=[...legend].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([key,n])=>`<span><i style="background:${M.colorFor(key)}"></i>${esc(key)} <b>${fmt(n)}</b></span>`).join('')+(legend.size>100?'<span>其余颜色见单星档案；可按批次或系列缩小范围。</span>':'');
      plotCache.width=canvas.width;plotCache.height=canvas.height;plotCache.getContext('2d').drawImage(canvas,0,0);if(drag&&!drag.pan)drawBrush();
    }
    function drawBrush(){ctx.strokeStyle='#73cfff';ctx.fillStyle='rgba(80,180,255,.12)';ctx.lineWidth=1;ctx.fillRect(drag.start[0],drag.start[1],drag.end[0]-drag.start[0],drag.end[1]-drag.start[1]);ctx.strokeRect(drag.start[0],drag.start[1],drag.end[0]-drag.start[0],drag.end[1]-drag.start[1]);}
    function pointer(event,clamp=true){const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*width/r.width,y=(event.clientY-r.top)*height/r.height;return clamp?[Math.max(PAD.left,Math.min(width-PAD.right,x)),Math.max(PAD.top,Math.min(height-PAD.bottom,y))]:[x,y];}
    function inside(p){return p[0]>=PAD.left&&p[0]<=width-PAD.right&&p[1]>=PAD.top&&p[1]<=height-PAD.bottom;}
    function nearest(x,y){const a=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const p of grid.get(`${Math.floor(x/16)+dx},${Math.floor(y/16)+dy}`)||[]){const d=(p.x-x)**2+(p.y-y)**2;if(d<=64)a.push({...p,d});}return a.sort((a,b)=>a.d-b.d||a.id.localeCompare(b.id));}
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0||!bounds||!inside(pointer(e,false)))return;const p=pointer(e);drag={start:p,end:p,append:e.shiftKey,pan:el('saDragMode').value==='pan',bounds:{...bounds}};canvas.setPointerCapture(e.pointerId);el('saHover').hidden=true;});
    canvas.addEventListener('pointermove',e=>{
      if(!bounds)return;const p=pointer(e);if(drag){drag.end=p;if(drag.pan){const b=drag.bounds,dx=(p[0]-drag.start[0])/(width-PAD.left-PAD.right)*(b.x1-b.x0),dy=(p[1]-drag.start[1])/(height-PAD.top-PAD.bottom)*(b.y1-b.y0);manualBounds={x0:b.x0-dx,x1:b.x1-dx,y0:b.y0+dy,y1:b.y1+dy};}scheduleDraw();return;}
      const candidates=inside(pointer(e,false))?nearest(...p):[],hover=el('saHover');hover.hidden=!candidates.length;
      if(candidates.length){const point=candidates[0],r=records.get(point.id),value=results.get(point.id);hover.textContent=r.item.name+' · '+r.id+'\n'+(kind==='plane'?'赤经 '+fmt(value.raan)+'° / 相位 '+fmt(value.phase)+'°':'倾角 '+fmt(value.inclination)+'° / '+scaleLabels[scale]+' '+fmt(value[scale]))+(candidates.length>1?'\n邻近 / 重叠 '+candidates.length+' 个；点击查看候选名单':'');hover.style.left=Math.max(0,Math.min(width-240,p[0]+12))+'px';hover.style.top=Math.max(4,p[1]-70)+'px';}
    });
    canvas.addEventListener('pointerleave',()=>{el('saHover').hidden=true;});
    canvas.addEventListener('pointercancel',()=>{drag=null;scheduleDraw();});
    canvas.addEventListener('pointerup',e=>{
      if(!drag)return;const d=drag;drag=null;d.end=pointer(e);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(d.pan){scheduleDraw();return;}
      if(Math.hypot(d.end[0]-d.start[0],d.end[1]-d.start[1])<5){const near=nearest(...d.end);
        if(near.length===1)focusSatellite(near[0].id);
        else if(near.length>1){picked=new Set([...(d.append?picked:[]),...near.map(p=>p.id)]);el('saOnlyBrush').checked=true;page=0;focusSatellite(near[0].id,false);notify('此位置有 '+near.length+' 个邻近 / 重叠对象，已展开候选名单；点击具体卫星名称再定位地图。');dialog.querySelector('.sa-members').scrollIntoView({block:'start',behavior:'smooth'});}
        scheduleDraw();return;
      }
      const a=unproject(...d.start),b=unproject(...d.end),ids=M.brush(queryResult.matched,results,{x0:a[0],x1:b[0],y0:a[1],y1:b[1]},kind,scale,origin,phaseOrigin);
      picked=new Set([...(d.append?picked:[]),...ids]);page=0;renderTable();scheduleDraw();notify('已框选 '+fmt(picked.size)+' 个对象。可查看名单或点击“加入地图”。');
    });
    function zoomAt(point,factor){if(!bounds)return;const [x,y]=unproject(...point),next={x0:x+(bounds.x0-x)*factor,x1:x+(bounds.x1-x)*factor,y0:y+(bounds.y0-y)*factor,y1:y+(bounds.y1-y)*factor};if(!Object.values(next).every(Number.isFinite)||next.x1-next.x0<1e-5||next.y1-next.y0<1e-5||next.x1-next.x0>1e7||next.y1-next.y0>1e10)return;manualBounds=next;scheduleDraw();}
    canvas.addEventListener('wheel',e=>{if(!bounds||!inside(pointer(e,false)))return;e.preventDefault();zoomAt(pointer(e),e.deltaY>0?1.2:1/1.2);},{passive:false});
    canvas.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();manualBounds=null;scheduleDraw();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoomAt([(PAD.left+width-PAD.right)/2,(PAD.top+height-PAD.bottom)/2],e.key==='-'?1.2:1/1.2);}else if(e.key==='Escape'&&drag){e.preventDefault();e.stopPropagation();drag=null;scheduleDraw();}});
    const resize=new ResizeObserver(scheduleDraw);resize.observe(canvas);
    dialog.addEventListener('input',e=>{if(e.target.id==='saQuery'||e.target.id==='saBatch'){filters[inputs[e.target.id]]=e.target.value;clearTimeout(queryTimer);queryTimer=setTimeout(()=>{queryTimer=0;if(e.target.id==='saBatch')batchSuggestions();updateQuery();},140);}});
    dialog.addEventListener('change',e=>{
      const id=e.target.id;if(inputs[id]){clearTimeout(queryTimer);queryTimer=0;filters[inputs[id]]=e.target.value;if(id==='saCountry')updateSeries();updateQuery();}
      if(id==='saKind'||id==='saScale'||id==='saOrigin'||id==='saPhaseOrigin'){kind=el('saKind').value;scale=el('saScale').value;origin=Number(el('saOrigin').value);phaseOrigin=Number(el('saPhaseOrigin').value);el('saScaleLabel').hidden=kind==='plane';el('saOriginLabel').hidden=kind!=='plane';el('saPhaseOriginLabel').hidden=kind!=='plane';manualBounds=null;scheduleDraw();}
      if(id==='saSort'){sortKey=e.target.value;page=0;renderTable();}
      if(id==='saDragMode'){canvas.style.cursor=e.target.value==='pan'?'grab':'crosshair';}
      if(['saHeightField','saInclinationMin','saInclinationMax','saHeightMin','saHeightMax'].includes(id))el('saRangeHint').textContent='范围尚未应用，请点击“应用范围”。';
      if(id==='saColor'){colorBy=e.target.value;scheduleDraw();}
      if(id==='saStale'){const n=Number(e.target.value);if(Number.isFinite(n)&&n>0&&n<=3650){staleDays=n;updateQuery(false);}else{e.target.value=staleDays;notify('旧根数阈值须在 0–3650 天之间。');}}
      if(id==='saOnlyBrush'){page=0;renderTable();}
      if(e.target.dataset.pick){const id=e.target.dataset.pick;if(e.target.checked)picked.add(id);else picked.delete(id);renderTable();scheduleDraw();}
    });
    dialog.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;if(queryTimer){clearTimeout(queryTimer);queryTimer=0;updateQuery();}
      if(b.dataset.focus){if(queryResult.matched.includes(b.dataset.focus))focusSatellite(b.dataset.focus);else notify('该对象已不在当前筛选中，请选择更新后的名单。');return;}if(b.dataset.relation){relationship(b.dataset.relation);return;}
      const a=b.dataset.action;
      if(b.dataset.clearFilter){const key=b.dataset.clearFilter;delete filters[key];for(const [id,k]of Object.entries(inputs))if(k===key)el(id).value='';if(key==='ranges')for(const id of ['saInclinationMin','saInclinationMax','saHeightMin','saHeightMax'])el(id).value='';updateSeries();updateQuery();return;}
      if(a==='range')applyRanges();
      if(a==='clearRange'){delete filters.ranges;for(const id of ['saInclinationMin','saInclinationMax','saHeightMin','saHeightMax'])el(id).value='';updateQuery();}
      if(a==='sortDirection'){sortDirection=sortDirection==='asc'?'desc':'asc';b.textContent=sortDirection==='asc'?'升序 ↑':'降序 ↓';page=0;renderTable();}
      if(a==='showPicked'){el('saOnlyBrush').checked=true;page=0;renderTable();dialog.querySelector('.sa-members').scrollIntoView({block:'start',behavior:'smooth'});}
      if(a==='focusView'){const on=dialog.classList.toggle('sa-focus-view');b.textContent=on?'展开条件':'专注图表';b.setAttribute('aria-pressed',String(on));dialog.scrollTop=0;scheduleDraw();}
      if(a==='close')dialog.close();
      if(a==='network')options.network?.({series:filters.series||window.NotamSatelliteLaunchModel.commonSeries(records,queryResult.matched)});
      if(a==='reset'){resetFilters();updateSeries();updateQuery();}
      if(a==='all'||a==='selected'){scope=a==='selected'?new Set(options.mapState().selected):null;scopeLabel=a==='selected'?'地图已选快照':'全目录';resetFilters();updateSeries();updateQuery();}
      if(a==='clearRelation'){delete filters.relation;delete filters.anchor;scopeLabel='全目录';el('saRelation').hidden=true;updateQuery();}
      if(a==='time'||a==='mapTime'){const t=a==='time'?M.epochMs(el('saTime').value):options.mapState().timeMs;if(!Number.isFinite(t)){notify('请输入有效的 UTC 时间。');return;}picked.clear();focus='';page=0;el('saOnlyBrush').checked=false;el('saInspector').innerHTML='<p>已更改分析时刻，请重新选择卫星查看档案。</p>';manualBounds=null;capture(t);}
      if(a==='pickMatches'){picked=new Set(queryResult.matched);renderTable();scheduleDraw();}
      if(a==='clearPick'){picked.clear();el('saOnlyBrush').checked=false;renderTable();scheduleDraw();}
      if(a==='add'||a==='addPicked'||a==='remove'){const out=options.apply([...picked],a==='remove'?'remove':'add',timeMs,snapshot);updateQuery(false);notify(out?.message||`已处理 ${picked.size} 个对象。`);}
      if(a==='locate'&&focus)focusSatellite(focus);
      if(a==='prev'||a==='next'){page+=a==='next'?1:-1;renderTable();el('saRows').parentElement.parentElement.scrollTop=0;}
      if(a==='resetZoom'){manualBounds=null;scheduleDraw();}
      if(a==='zoomBrush'){const next=M.selectionBounds([...picked],results,kind,scale,origin,phaseOrigin);if(next){manualBounds=next;scheduleDraw();}else notify('所选对象缺少此图可用的轨道参数。');}
      if(a==='csv')exportCsv();
    });
    function exportCsv(){
      const rows=[['NORAD','名称','国家','系列','发射批次','用途','倾角_deg','半长轴高度_km','近地点_km','远地点_km','RAAN_deg','平均沿轨相位_deg','分析时刻_UTC','轨道历元_UTC','数据获取时间_UTC','获取时间口径','分类证据','证据日期_UTC','证据来源','状态']];
      for(const id of tableIds){const r=records.get(id),p=results.get(id);rows.push([id,r.item.name,r.c.country,r.c.label,r.batch,r.purposes.map(x=>purposeLabels[x]).join(' / '),p?.inclination,p?.scale,p?.perigee,p?.apogee,p?.planeDefined?p.raan:'',p?.planeDefined?p.phase:'',date(timeMs),date(r.epoch),date(r.fetchedAt),r.fetchScope,r.c.method,date(r.evidenceAt),r.c.sourceUrl,status(r)]);}
      const cell=M.csvCell;
      const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`卫星轨道分析_${new Date(timeMs).toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(`已导出当前名单 ${tableIds.length} 个对象，含证据、获取时间和轨道历元。`);
    }
    function sync(){
      if(!dialog.open)return;
      const delay=600-(performance.now()-lastSyncAt);
      if(delay>0){if(!syncTimer)syncTimer=setTimeout(()=>{syncTimer=0;sync();},delay+1);return;}
      lastSyncAt=performance.now();const state=options.mapState(),version=`${state.selectionRevision}:${state.drawRevision}`;
      if(version===drawVersion)return;drawVersion=version;selected=state.selected;drawn=state.drawn;
      if(filters.quality==='selected')updateQuery(false);else{renderMetrics();renderTable();if(focus)renderInspector();}
    }
    dialog.addEventListener('close',()=>{if(dialog.open)return;clearTimeout(noticeTimer);el('saToast').hidden=true;worker?.terminate();worker=null;requestId++;clearTimeout(queryTimer);queryTimer=0;clearTimeout(syncTimer);syncTimer=0;cancelAnimationFrame(frame);frame=0;drag=null;});
    return {
      open(config={}){scope=config.ids?new Set(config.ids.map(String)):null;scopeLabel=config.label||'全目录';resetFilters();picked.clear();focus='';page=0;manualBounds=null;el('saOnlyBrush').checked=false;el('saInspector').innerHTML='<p>点击散点或名单查看详情与关系。</p>';notify('先筛选星群，再框选或勾选成员；点击单星会在分析时刻定位地图。');if(!dialog.open)dialog.showModal();capture();(dialog.classList.contains('sa-focus-view')?btn('focusView'):el('saQuery')).focus();},
      sync,
      isOpen:()=>dialog.open,
    };
  }
  root.NotamSatelliteAnalysis={mount};
})(globalThis);
