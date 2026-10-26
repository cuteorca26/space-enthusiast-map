(function(root){
  'use strict';
  function mount(options){
    const host=document.createElement('aside');host.id='satelliteWorkspace';host.hidden=true;host.setAttribute('aria-label','卫星轨道工作区');
    host.innerHTML=`<header class="sw-heading"><div><span class="sw-eyebrow">ORBIT ATLAS</span><h2>卫星轨道</h2></div><span class="sw-live">3D 工作区</span></header><div id="swSelection" class="sw-selection"></div><nav class="sw-tabs" role="tablist" aria-label="卫星工作区菜单">${[['discover','星群'],['members','成员'],['display','显示'],['time','时间'],['data','数据']].map(([key,label],i)=>`<button id="swTab-${key}" type="button" role="tab" data-sw-tab="${key}" aria-controls="swPanel-${key}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${label}</button>`).join('')}</nav><div class="sw-content">${['discover','members','display','time','data'].map((key,i)=>`<section id="swPanel-${key}" class="sw-panel" role="tabpanel" aria-labelledby="swTab-${key}" ${i?'hidden':''}></section>`).join('')}</div><footer class="sw-footer"><button type="button" data-sw-action="analysis">轨道参数图 ↗</button><button type="button" data-sw-action="network">组网历程 ↗</button></footer>`;
    document.querySelector('.workspace').prepend(host);const el=id=>document.getElementById(id),panel=key=>el('swPanel-'+key);
    const controls=el('satelliteControls');el('swSelection').append(controls);
    const sections=[...controls.querySelectorAll(':scope > details')];
    const targets=['discover','display','display','members','data','discover','time'];
    sections.forEach((section,i)=>{
      section.classList.add('sw-settings-section');
      if(i===0){panel('discover').append(el('satelliteExplorer'));section.remove();}
      else if(i===5){section.classList.add('sw-catalog-archive');section.querySelector('summary span').textContent='完整分类索引';section.querySelector('summary small').textContent='核对覆盖范围 · 国家和系列';panel('data').append(section);}
      else{panel(targets[i]).append(section);section.open=[1,6].includes(i);}
    });
    const membersHead=document.createElement('div');membersHead.className='sw-members-head';membersHead.innerHTML='<h3 id="swMembersTitle">已选卫星</h3><button type="button" data-sw-action="selected">查看已选</button><button type="button" data-sw-action="catalog">搜索全目录</button>';panel('members').prepend(membersHead);
    const searchHome=document.createComment('Map search home'),listHome=document.createComment('Map list home'),resultHome=document.createComment('Map search results home');
    const search=el('notamIdSearchInput').closest('label'),list=el('restrictionList'),results=el('notamIdSearchResults');search.before(searchHome);list.before(listHome);results.before(resultHome);
    const listSlot=document.createElement('div');listSlot.className='sw-list-slot';panel('members').append(listSlot);
    const sceneSettings=document.createElement('div');sceneSettings.className='sw-data-card sw-scene-settings';sceneSettings.innerHTML='<h3>地球画面</h3><div class="sw-scene-toggles"></div>';panel('display').prepend(sceneSettings);
    const sceneControls=['cloudOverlayToggle','sunlightToggle','placeLabelsToggle'].map(id=>{const control=el(id).closest('label'),home=document.createComment(id+' home');control.before(home);return {control,home};});
    const dataTop=document.createElement('div');dataTop.className='sw-data-card';dataTop.innerHTML='<h3>轨道与发射档案</h3><p>轨道根数用于计算位置；发射档案提供发射时间、场址、火箭和历史在轨统计。</p><div id="swRefreshControls"></div><button type="button" data-admin-action data-sw-action="refreshLaunch">更新发射档案</button><p id="swLaunchStatus" role="status">首次打开时读取本地发射档案。</p>';panel('data').prepend(dataTop);window.MapAdministrator?.render();
    for(const id of ['satelliteFetchButton','satelliteProgress'])if(el(id))el('swRefreshControls').append(el(id));
    const mapHead=document.createElement('div');mapHead.className='sw-map-head';mapHead.hidden=true;mapHead.innerHTML='<div><span class="sw-eyebrow">EARTH & ORBITS</span><strong>三维轨道视图</strong><small id="swSceneStatus">从左侧选择卫星群开始</small></div><button type="button" data-sw-action="fit">适合全部轨道</button>';document.querySelector('.map-stage').append(mapHead);
    const mapHint=document.createElement('div');mapHint.className='sw-map-hint';mapHint.hidden=true;mapHint.textContent='拖动旋转 · 滚轮缩放 · Shift 点选 / 多选卫星 · 在「显示」中筛选点选图层';document.querySelector('.map-stage').append(mapHint);
    let active=false,tab='discover',lastStatus='';
    function select(next,focus=false){
      if(!panel(next))return;tab=next;
      host.querySelectorAll('[data-sw-tab]').forEach(b=>{const on=b.dataset.swTab===next;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();});
      host.querySelectorAll('.sw-panel').forEach(p=>p.hidden=p.id!=='swPanel-'+next);
    }
    host.querySelector('.sw-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const keys=['discover','members','display','time','data'];select(e.key==='Home'?keys[0]:e.key==='End'?keys.at(-1):keys[(keys.indexOf(tab)+(e.key==='ArrowRight'?1:4))%5],true);});
    async function launchStatus(refresh=false){const status=el('swLaunchStatus');status.textContent=refresh?'正在更新公开发射与再入档案…':'正在读取发射档案…';const b=host.querySelector('[data-sw-action="refreshLaunch"]');b.disabled=true;try{const data=await options.launchData(refresh);status.textContent=`${data.coverage.launches.toLocaleString('zh-CN')} 次发射 · ${data.coverage.objects.toLocaleString('zh-CN')} 个历史载荷 · 获取 ${new Date(data.fetchedAt).toLocaleString('zh-CN')}${data.refreshError?'；本次更新失败，继续使用完整缓存：'+data.refreshError:''}`;}catch(error){status.textContent='发射档案暂不可用：'+error.message;}finally{b.disabled=false;}}
    host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.swTab){select(b.dataset.swTab);return;}const a=b.dataset.swAction;if(a==='analysis')options.analyze();if(a==='network')options.network();if(a==='selected'){options.members(null);el('swMembersTitle').textContent='已选卫星';}if(a==='catalog'){options.members('all');el('swMembersTitle').textContent='全部卫星目录';search.querySelector('input').focus();}if(a==='refreshLaunch')launchStatus(true);});
    mapHead.addEventListener('click',e=>{if(e.target.closest('[data-sw-action="fit"]'))options.fit();});
    return {
      get active(){return active;},
      enter(){active=true;host.hidden=false;document.body.classList.add('satellite-workspace-active');mapHead.hidden=false;mapHint.hidden=false;membersHead.after(search,results);listSlot.append(list);sceneControls.forEach(({control})=>sceneSettings.querySelector('.sw-scene-toggles').append(control));controls.hidden=false;select(tab);launchStatus();},
      leave(){active=false;host.hidden=true;document.body.classList.remove('satellite-workspace-active');mapHead.hidden=true;mapHint.hidden=true;searchHome.after(search);resultHome.after(results);listHome.after(list);sceneControls.forEach(({control,home})=>home.after(control));},
      members(label){el('swMembersTitle').textContent=label||'已选卫星';select('members');},
      sync(status){if(status===lastStatus)return;lastStatus=status;el('swSceneStatus').textContent=status;},
    };
  }
  root.NotamSatelliteWorkspace={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
