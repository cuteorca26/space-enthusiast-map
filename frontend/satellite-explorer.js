/* Satellite discovery only: does not change identity evidence or orbital elements. */
(function (root) {
  'use strict';
  const PURPOSES = [
    ['communication', '通信 / 互联网'], ['earth', '遥感 / 地球观测'],
    ['weather', '气象 / 环境'], ['navigation', '导航 / 授时'],
    ['science', '科学 / 天文'], ['technology', '技术 / 教育'],
    ['crewed', '空间站 / 载人'], ['security', '预警 / 空间监视'],
    ['objects', '火箭体 / 部件 / 碎片'], ['unknown', '用途待核实'],
  ];
  const LABELS = Object.fromEntries(PURPOSES);
  const KEY_TAGS = {
    communication: 'STARLINK AMAZON_LEO ONEWEB GUOWANG QIANFAN IRIDIUM GLOBALSTAR ORBCOMM INTELSAT ECHOSTAR VIASAT SIRIUSXM DIRECTV AST_SPACEMOBILE LYNK US_MSS_LEGACY WGS AEHF MILSTAR DSCS MUOS UFO FLTSATCOM TDRS TIANLIAN TJS CHINASAT RASSVET_1440 GONETS LUCH EXPRESS YAMAL MERIDIAN RODNIK RUSSIAN_MILITARY_COMMS INMARSAT SES_O3B HUBBLE_IOT TIANQI ASTRANIS',
    earth: 'LANDSAT PLANET VANTOR BLACKSKY CAPELLA UMBRA JILIN YAOGAN GAOFEN ZIYUAN TIANHUI CHINA_OCEAN_ENV CHINA_COMMERCIAL_RS RESURS KANOPUS KONDOR SENTINEL PLEIADES COSMO_SKYMED ICEYE RADARSAT KOMPSAT SYNSPECTIVE IQPS AXELSPACE PIXXEL SATELLOGIC FOREST GHGSAT HANCOM_SEJONG PRISMA_ITALY RESOURCE_OTHER SAR_OTHER GEODETIC_OTHER',
    weather: 'FENGYUN METEOR ELEKTRO_ARKTIKA WEATHER_OTHER US_MIL_WEATHER FOREST GHGSAT CHINA_OCEAN_ENV',
    navigation: 'GPS BEIDOU GLONASS GALILEO NAV_OTHER',
    science: 'UME BRITE SCIENCE_OTHER ASTRONOMY_OTHER',
    technology: 'PRISMA_SWEDEN BLACKWING STP ENGINEERING_OTHER CALIBRATION_OTHER',
    crewed: 'ISS_STATION CHINA_STATION',
    security: 'US_MISSILE_WARNING US_SPACE_AWARENESS EKS SIGINT_OTHER',
  };
  const KEY_PURPOSES = new Map();
  for (const [tag, keys] of Object.entries(KEY_TAGS)) for (const key of keys.split(' ')) {
    if (!KEY_PURPOSES.has(key)) KEY_PURPOSES.set(key, []);
    KEY_PURPOSES.get(key).push(tag);
  }
  const normalize = value => String(value || '').normalize('NFKC').toUpperCase().replace(/[-‐‑–—_]/g, ' ').replace(/\s+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const format = value => Number(value).toLocaleString('zh-CN');

  function purposesFor(item, classification, info = {}, evidence = {}) {
    if (['ROCKET_BODY','DEBRIS','COMPONENT'].includes(classification.physicalType) || ['ROCKET_BODY','DEBRIS','COMPONENT'].includes(classification.key)) return ['objects'];
    if (classification.key === 'UNCLASSIFIED') return ['unknown'];
    const tags = new Set();
    // Only confirmed identity evidence may supply a mission category. Candidate names
    // remain searchable, but cannot imply a mission or country.
    const category = !evidence.candidate && (!evidence.piece || evidence.piece === item.internationalDesignator) ? String(evidence.category || '') : '';
    for (const raw of category.split(/[\s/,]+/)) {
      if (raw.includes('?')) continue;
      const code = raw.replace(/\*/g, '');
      if (/^(COM|MCOM)/.test(code)) tags.add('communication');
      if (/^(IMG|EOSCI|GEOD)/.test(code)) tags.add('earth');
      if (/^MET/.test(code)) tags.add('weather');
      if (/^NAV/.test(code)) tags.add('navigation');
      if (/^(SCI|AST|PLAN|BIO|MATERIALS)$/.test(code)) tags.add('science');
      if (/^(TECH|CAL|EDU|AMAT)$/.test(code)) tags.add('technology');
      if (/^(SIG|EW|SS-A)$/.test(code)) tags.add('security');
    }
    // Curated homogeneous mission families may also carry a broader discovery tag.
    for (const tag of KEY_PURPOSES.get(classification.key) || []) tags.add(tag);
    // A mixed constellation's broad description must not override a member's purpose.
    if (tags.size) {
      if (['FOREST','GHGSAT','CHINA_OCEAN_ENV'].includes(classification.key)) { tags.add('earth'); tags.add('weather'); }
      return [...tags];
    }
    const text = `${info.label || classification.label || ''} ${info.purpose || ''}`;
    if (/通信|通讯|互联网|宽带|物联网|数据中继|广播|电视/.test(text)) tags.add('communication');
    if (/遥感|对地观测|测绘|测高|高光谱|雷达成像/.test(text)) tags.add('earth');
    if (/气象|天气|环境监测|温室气体|火情|林火/.test(text)) tags.add('weather');
    if (/导航|授时/.test(text)) tags.add('navigation');
    if (/科学|天文|测光|电离层|太阳物理|太阳观测/.test(text)) tags.add('science');
    if (/技术|教育|大学|业余无线电|校准|编队|平台试验/.test(text)) tags.add('technology');
    if (/空间站|载人|货运飞船/.test(text)) tags.add('crewed');
    if (/预警|空间态势|信号监测|目标监视|导弹跟踪/.test(text)) tags.add('security');
    return tags.size ? [...tags] : ['unknown'];
  }

  function buildIndex(items, classifications, series, evidence = {}, objectClass = s => s.objectClass || 'UNKNOWN') {
    const records = new Map(), groups = new Map(), countries = new Map();
    for (const item of items) {
      const id = String(item.id), c = classifications.get(id);
      if (!c) continue;
      const info = series.describe(c.key) || {}, purposes = purposesFor(item, c, info, evidence[id]);
      const number = Number(id);
      const alpha5 = Number.isInteger(number) && number >= 100000 && number < 340000
        ? 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(number / 10000) - 10] + String(number % 10000).padStart(4, '0') : '';
      const text = normalize([item.name, id, alpha5, item.internationalDesignator, ...(item.catalogIdAliases || []), ...(c.aliases || []), c.candidateSearchText, ...purposes.map(tag => LABELS[tag])].join(' '));
      records.set(id, {id, text, purposes, objectClass: objectClass(item), orbit: item.orbitClass});
      for (const membership of [c, ...(c.relatedGroups || [])]) {
        const key = membership.groupKey;
        if (!groups.has(key)) {
          const definition = series.describe(membership.key) || {};
          groups.set(key, {key, seriesKey: membership.key, country: membership.country, countryCode: membership.countryCode,
            label: membership.label, text: normalize([membership.label, membership.key, membership.country, membership.countryCode, ...(definition.aliases || [])].join(' ')), ids: new Set()});
        }
        groups.get(key).ids.add(id);
        if (!countries.has(membership.countryCode)) countries.set(membership.countryCode, {code: membership.countryCode, label: membership.country, ids: new Set()});
        countries.get(membership.countryCode).ids.add(id);
      }
    }
    return {records, groups, countries: [...countries.values()].sort((a,b) => ({PRC:0,US:1,CIS:2}[a.code] ?? 9) - ({PRC:0,US:1,CIS:2}[b.code] ?? 9) || a.label.localeCompare(b.label,'zh-CN'))};
  }

  function queryIndex(index, filters = {}, favorites = new Set(), selected = new Set()) {
    const terms = normalize(filters.query).split(' ').filter(Boolean), output = [], unique = new Set();
    for (const group of index.groups.values()) {
      if (filters.country && group.countryCode !== filters.country) continue;
      if (filters.scope === 'favorites' && !favorites.has(group.key)) continue;
      const groupTerms = terms.filter(term => !group.text.includes(term)), ids = [], purposeTags = new Set();
      for (const id of group.ids) {
        const r = index.records.get(id);
        if (filters.purpose && !r.purposes.includes(filters.purpose)) continue;
        if (filters.objectClass && r.objectClass !== filters.objectClass) continue;
        if (filters.orbit && r.orbit !== filters.orbit) continue;
        if (filters.scope === 'selected' && !selected.has(id)) continue;
        if (!groupTerms.every(term => r.text.includes(term))) continue;
        ids.push(id); unique.add(id); for (const tag of r.purposes) purposeTags.add(tag);
      }
      if (ids.length) output.push({...group, total:group.ids.size, ids, purposes:[...purposeTags]});
    }
    output.sort((a,b) => {
      if (filters.sort === 'name') return a.label.localeCompare(b.label,'zh-CN') || a.country.localeCompare(b.country,'zh-CN');
      return Number(favorites.has(b.key))-Number(favorites.has(a.key)) || b.ids.length-a.ids.length || a.label.localeCompare(b.label,'zh-CN');
    });
    return {groups:output, ids:[...unique]};
  }

  class Basket {
    constructor() { this.groups = new Map(); }
    toggle(group) {
      let entry = this.groups.get(group.key);
      const all = entry && group.ids.every(id => entry.ids.has(id));
      if (!entry) { entry = {key:group.key,label:`${group.country} · ${group.label}`,ids:new Set()}; this.groups.set(group.key,entry); }
      for (const id of group.ids) { if (all) entry.ids.delete(id); else entry.ids.add(id); }
      if (!entry.ids.size) this.groups.delete(group.key);
    }
    add(group) { const old=this.groups.get(group.key);this.groups.set(group.key,{key:group.key,label:`${group.country} · ${group.label}`,ids:new Set([...(old?.ids || []),...group.ids])}); }
    ids() { return [...new Set([...this.groups.values()].flatMap(g=>[...g.ids]))]; }
    prune(index) { for(const [key,g]of this.groups){g.ids=new Set([...g.ids].filter(id=>index.records.has(id)));if(!g.ids.size)this.groups.delete(key);} }
  }

  function selectionOperation(current, incoming, mode, available, limit=50000) {
    const valid=[...new Set(incoming.map(String))].filter(id=>available.has(id));
    const next=mode==='replace'?new Set():new Set([...current].filter(id=>available.has(id)));
    let limited=0;
    for(const id of valid){if(mode==='remove')next.delete(id);else if(next.has(id)||next.size<limit)next.add(id);else limited++;}
    return {ids:next,limited,matched:valid.length};
  }

  function mount(host, options) {
    if (!host) return null;
    const storageKey='space-map-satellite-explorer-v1', basket=new Basket();
    let preferences={favorites:[],recent:[]};
    try {const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&Array.isArray(saved.favorites))preferences={favorites:saved.favorites.filter(x=>typeof x==='string').slice(0,1500),recent:Array.isArray(saved.recent)?saved.recent.filter(x=>typeof x==='string').slice(0,5):[]};}catch{}
    const favorites=new Set(preferences.favorites);
    let index=null, selection=new Set(), selectionRef=null, selectionRevision=-1, page=0, result={groups:[],ids:[]}, timer=0;
    const filters={query:'',country:'',purpose:'',orbit:'',objectClass:'',scope:'all',sort:'count'};
    host.innerHTML=`<div class="sx-toolbar"><span>按条件找群，组合显示</span><button type="button" data-action="expand">展开卫星库 ↗</button></div><button type="button" class="sx-analysis-entry" data-action="analyze">轨道分析 · 发射批次与关系 ↗</button><div class="sx-discovery-controls"><p class="sx-intro">先筛选，再勾选卫星群。支持跨国家组合；同一颗卫星只绘制一次。</p>
      <div class="sx-search"><label for="sxQuery">搜索系列或卫星</label><input id="sxQuery" type="search" placeholder="例如 中国 遥感、亚马逊、Kuiper、NORAD 编号" autocomplete="off"></div>
      <div class="sx-filters"><label>国家 / 机构<select id="sxCountry"><option value="">全部国家 / 机构</option></select></label><label>用途<select id="sxPurpose"><option value="">全部用途</option>${PURPOSES.map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label></div>
      <div class="sx-presets" aria-label="常用筛选"><button type="button" data-preset="china">中国遥感</button><button type="button" data-preset="us">美国通信</button><button type="button" data-preset="navigation">全球导航</button><button type="button" data-preset="weather">气象环境</button><button type="button" data-action="reset">重置筛选</button></div>
      <details class="sx-more"><summary>更多筛选：轨道与对象类型</summary><div class="sx-filters"><label>轨道<select id="sxOrbit"><option value="">所有轨道</option>${['LEO','MEO','GEO','HEO'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>对象类型<select id="sxObject"><option value="">所有状态和类型</option><option value="ACTIVE_PAYLOAD">在役卫星</option><option value="RETIRED_PAYLOAD">退役卫星</option><option value="ROCKET_BODY">火箭体</option><option value="DEBRIS">碎片 / 部件</option><option value="UNKNOWN">状态未知对象</option></select></label></div></details>
      <div class="sx-tabs" role="group" aria-label="卫星群范围"><button type="button" data-scope="all" aria-pressed="true">全部系列</button><button type="button" data-scope="favorites" aria-pressed="false">我的收藏</button><button type="button" data-scope="selected" aria-pressed="false">地图已选</button></div>
      <div class="sx-recent" id="sxRecent"></div>
      </div><div class="sx-discovery-results"><div class="sx-results-head"><span id="sxCount" role="status">等待卫星目录…</span><label class="sx-sort">排序<select id="sxSort"><option value="count">收藏优先 · 数量</option><option value="name">名称</option></select></label></div>
      <div class="sx-batch"><button type="button" data-action="pickAll">勾选全部匹配</button><button type="button" data-action="clearBasket">清空待选</button></div>
      <div id="sxResults" class="sx-results" role="group" aria-label="匹配的卫星群"></div>
      <div class="sx-pager"><button type="button" data-action="prev" aria-label="上一页卫星群">上一页</button><span id="sxPage"></span><button type="button" data-action="next" aria-label="下一页卫星群">下一页</button></div>
      </div><div class="sx-basket"><div class="sx-basket-title"><strong id="sxBasketCount">待显示：0 个对象</strong><span id="sxMapCount">地图已选 0</span></div><div id="sxBasketChips" class="sx-basket-chips"></div><div class="sx-actions"><button type="button" data-apply="replace" class="sx-primary">仅显示待选</button><button type="button" data-apply="add">加入地图</button><button type="button" data-apply="remove">从地图移除</button></div><small>换筛选条件会保留待选；只有点击显示按钮才改变地图。</small></div>
      <p id="sxActionStatus" class="sx-status" role="status" aria-live="polite"></p>
      <details class="sx-help"><summary>国籍、用途和计数怎么理解？</summary><p>国家按公开目录所属国家 / 机构显示，托管任务另有任务国家入口。用途可多重归属，只采用现有确认资料，无法确定的保留在“用途待核实”。搜索支持原名、别名、编号和候选名；候选名命中不代表身份已确认。系列显示“匹配数 / 总数”时，只操作筛选出的成员。总数按对象编号去重。</p><p>收藏保存在此浏览器；原有完整国家目录、单星搜索与轨道设置仍可使用。</p></details>`;
    const modal=document.createElement('dialog');modal.className='sx-dialog';modal.setAttribute('aria-labelledby','sxDialogTitle');modal.innerHTML='<header><div><h2 id="sxDialogTitle">卫星群导航</h2><p>国家、用途和轨道交叉筛选 · 勾选后统一显示</p></div><button type="button" aria-label="关闭卫星库">关闭 ×</button></header><div class="sx-dialog-body"></div>';document.body.appendChild(modal);
    host.querySelector('.sx-more').append(host.querySelector('.sx-presets'),host.querySelector('.sx-recent'));
    host.querySelector('.sx-more summary').textContent='更多筛选 / 最近使用';
    const home=document.createComment('Satellite explorer home');host.before(home);
    modal.querySelector('header button').addEventListener('click',()=>modal.close());
    modal.addEventListener('close',()=>{home.after(host);host.classList.remove('sx-wide');host.querySelector('[data-action="expand"]').focus();});
    const el=id=>host.querySelector('#'+id), action=(name)=>host.querySelector(`[data-action="${name}"]`);
    const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify({favorites:[...favorites],recent:preferences.recent}));}catch{el('sxActionStatus').textContent='当前浏览器无法保存收藏；本次仍可使用。';}};
    function syncInputs(){for(const [id,key]of [['sxQuery','query'],['sxCountry','country'],['sxPurpose','purpose'],['sxOrbit','orbit'],['sxObject','objectClass'],['sxSort','sort']])el(id).value=filters[key];}
    function currentGroup(key){return result.groups.find(g=>g.key===key);}
    function renderBasket(){
      host.dataset.basketEmpty=String(!basket.groups.size);
      const ids=basket.ids();el('sxBasketCount').textContent=`待显示：${format(ids.length)} 个对象 · ${basket.groups.size} 组`;
      el('sxMapCount').textContent=`地图已选 ${format(selection.size)}`;
      el('sxBasketChips').innerHTML=[...basket.groups.values()].map(g=>`<button type="button" data-unpick="${escape(g.key)}" title="移出待选：${escape(g.label)}">${escape(g.label)} <b>${format(g.ids.size)}</b> ×</button>`).join('');
      host.querySelectorAll('[data-apply]').forEach(b=>b.disabled=!ids.length);
      action('clearBasket').disabled=!ids.length;
    }
    function renderCards(){
      const scrollTop = el('sxResults').scrollTop;
      const pages=Math.max(1,Math.ceil(result.groups.length/12));page=Math.max(0,Math.min(page,pages-1));
      el('sxPage').textContent=`${page+1} / ${pages}`;action('prev').disabled=page===0;action('next').disabled=page===pages-1;
      el('sxResults').innerHTML=result.groups.slice(page*12,(page+1)*12).map(g=>{
        const picked=basket.groups.get(g.key),n=g.ids.reduce((sum,id)=>sum+Number(picked?.ids.has(id)),0),onMap=g.ids.reduce((sum,id)=>sum+Number(selection.has(id)),0);
        return `<article class="sx-card${n?' sx-picked':''}"><div class="sx-card-main"><label><input type="checkbox" data-pick="${escape(g.key)}" ${n===g.ids.length?'checked':''} aria-label="勾选 ${escape(g.country+' '+g.label)}"><span><strong>${escape(g.label)}</strong><small>${escape(g.country)} · ${g.purposes.map(t=>LABELS[t]).map(escape).join(' / ')}</small></span></label><button type="button" class="sx-star" data-favorite="${escape(g.key)}" aria-pressed="${favorites.has(g.key)}" aria-label="${favorites.has(g.key)?'取消收藏':'收藏'} ${escape(g.country+' '+g.label)}">${favorites.has(g.key)?'★':'☆'}</button></div><div class="sx-card-foot"><span>${format(g.ids.length)}${g.ids.length===g.total?' 个对象':` / ${format(g.total)} 个匹配`}<small data-map-key="${escape(g.key)}"> · 地图已选 ${format(onMap)}</small></span><button type="button" data-members="${escape(g.key)}">成员</button><button type="button" data-network="${escape(g.key)}" ${['UNCLASSIFIED','ROCKET_BODY','DEBRIS','COMPONENT'].includes(g.seriesKey)?'disabled title="组网历程仅统计可归类的卫星载荷"':''}>历程</button><button type="button" data-analyze="${escape(g.key)}">参数图</button><button type="button" data-show="${escape(g.key)}">单独显示</button></div></article>`;
      }).join('') || `<p class="sx-empty">${!index?.records.size?'正在等待目录。':filters.scope==='favorites'&&!favorites.size?'还没有收藏。点击系列旁的 ☆，下次从这里直接找到。':'没有符合这些条件的卫星群。可重置筛选，或尝试编号、别名。'}</p>`;
      host.querySelectorAll('[data-pick]').forEach(b=>{const g=currentGroup(b.dataset.pick),entry=basket.groups.get(g.key);const n=g.ids.filter(id=>entry?.ids.has(id)).length;b.indeterminate=n>0&&n<g.ids.length;});
      el('sxResults').scrollTop=scrollTop;
      renderBasket();
    }
    function render(reset=true){
      if(reset)page=0;
      result=index?queryIndex(index,filters,favorites,selection):{groups:[],ids:[]};
      el('sxCount').textContent=index?.records.size?`${format(result.groups.length)} 个系列 · ${format(result.ids.length)} 个对象（去重）`:'等待卫星目录…';
      action('pickAll').disabled=!result.ids.length;
      host.querySelectorAll('[data-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===filters.scope)));
      el('sxRecent').innerHTML=preferences.recent.filter(key=>index?.groups.has(key)).map(key=>`<button type="button" data-recent="${escape(key)}" title="查找最近显示的系列">${escape(index.groups.get(key).label)}</button>`).join('');
      if(el('sxRecent').innerHTML)el('sxRecent').insertAdjacentHTML('afterbegin','<span>最近使用</span>');
      renderCards();
    }
    function apply(ids,mode,groups){
      if(!ids.length)return;
      const outcome=options.apply(ids,mode);
      preferences.recent=[...new Set([...groups,...preferences.recent])].slice(0,5);save();
      const label={replace:'已单独显示',add:'已加入地图',remove:'已从地图移除'}[mode];
      el('sxActionStatus').textContent=`${label} ${format(outcome?.matched ?? ids.length)} 个对象；地图共选中 ${format(outcome?.total ?? selection.size)} 个。${outcome?.limited?'已达到可选数量上限。':''}`;
      render(false);
    }
    host.addEventListener('input',event=>{if(event.target.id==='sxQuery'){filters.query=event.target.value;clearTimeout(timer);timer=setTimeout(()=>{timer=0;render();},130);}});
    host.addEventListener('change',event=>{
      const fields={sxCountry:'country',sxPurpose:'purpose',sxOrbit:'orbit',sxObject:'objectClass',sxSort:'sort'};
      if(fields[event.target.id]){filters[fields[event.target.id]]=event.target.value;clearTimeout(timer);render();}
      if(event.target.dataset.pick){const g=currentGroup(event.target.dataset.pick);if(g){basket.toggle(g);renderCards();}}
    });
    host.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||!host.contains(b))return;
      if(timer){clearTimeout(timer);timer=0;render();}
      if(b.dataset.action==='expand'){modal.querySelector('.sx-dialog-body').appendChild(host);host.classList.add('sx-wide');modal.showModal();el('sxQuery').focus();}
      if(b.dataset.action==='analyze'||b.dataset.analyze){const g=b.dataset.analyze?currentGroup(b.dataset.analyze):null;const config=g?{ids:[...index.groups.get(g.key).ids],label:g.country+' · '+g.label+'（完整系列）'}:filters.query||filters.country||filters.purpose||filters.orbit||filters.objectClass||filters.scope!=='all'?{ids:result.ids,label:'卫星库当前筛选快照'}:{};if(modal.open)modal.close();options.analyze?.(config);}
      if(b.dataset.favorite){const key=b.dataset.favorite;if(favorites.has(key))favorites.delete(key);else favorites.add(key);save();render(false);}
      if(b.dataset.scope){filters.scope=b.dataset.scope;render();}
      if(b.dataset.members){const g=currentGroup(b.dataset.members);if(g){if(modal.open)modal.close();options.members?.(g.ids,g.country+' · '+g.label+'（'+format(g.ids.length)+' 颗）');}}
      if(b.dataset.network)options.network?.({series:b.dataset.network});
      if(b.dataset.show){const g=currentGroup(b.dataset.show);if(g)apply(g.ids,'replace',[g.key]);}
      if(b.dataset.unpick){basket.groups.delete(b.dataset.unpick);renderCards();}
      if(b.dataset.apply)apply(basket.ids(),b.dataset.apply,[...basket.groups.keys()]);
      if(b.dataset.recent){const g=index.groups.get(b.dataset.recent);Object.assign(filters,{query:g.label,country:g.countryCode,purpose:'',orbit:'',objectClass:'',scope:'all'});syncInputs();render();}
      if(b.dataset.preset){Object.assign(filters,{query:'',country:'',purpose:'',orbit:'',objectClass:'',scope:'all'});if(b.dataset.preset==='china'){filters.country='PRC';filters.purpose='earth';}if(b.dataset.preset==='us'){filters.country='US';filters.purpose='communication';}if(b.dataset.preset==='navigation')filters.purpose='navigation';if(b.dataset.preset==='weather')filters.purpose='weather';syncInputs();render();}
      if(b.dataset.action==='reset'){Object.assign(filters,{query:'',country:'',purpose:'',orbit:'',objectClass:'',scope:'all'});syncInputs();render();}
      if(b.dataset.action==='pickAll'){for(const g of result.groups)basket.add(g);renderCards();}
      if(b.dataset.action==='clearBasket'){basket.groups.clear();renderCards();}
      if(b.dataset.action==='prev'){page--;renderCards();el('sxResults').scrollTop=0;el('sxResults').scrollIntoView?.({block:'start'});}
      if(b.dataset.action==='next'){page++;renderCards();el('sxResults').scrollTop=0;el('sxResults').scrollIntoView?.({block:'start'});}
    });
    render();
    return {
      setIndex(next){index=next;basket.prune(index);el('sxCountry').innerHTML='<option value="">全部国家 / 机构</option>'+index.countries.map(c=>`<option value="${escape(c.code)}">${escape(c.label)} (${format(c.ids.size)})</option>`).join('');if(filters.country&&!index.countries.some(c=>c.code===filters.country))filters.country='';syncInputs();render();},
      syncSelection(next,revision=0){if(selectionRef===next&&selectionRevision===revision)return;selectionRef=next;selectionRevision=revision;selection=next;el('sxMapCount').textContent=`地图已选 ${format(next.size)}`;if(filters.scope==='selected'){render();return;}host.querySelectorAll('[data-map-key]').forEach(node=>{const g=currentGroup(node.dataset.mapKey);node.textContent=` · 地图已选 ${format(g.ids.filter(id=>next.has(id)).length)}`;});},
    };
  }
  const api={PURPOSES,purposesFor,buildIndex,queryIndex,Basket,selectionOperation,mount};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.NotamSatelliteExplorer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
