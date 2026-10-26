(function(){
  'use strict';
  const key='space-atlas-ui-theme',valid=new Set(['midnight','dusk','graphite']);
  let current='midnight';
  try{const saved=localStorage.getItem(key);if(valid.has(saved))current=saved;}catch{}
  document.documentElement.dataset.uiTheme=current;
  document.addEventListener('DOMContentLoaded',()=>{
    const select=document.getElementById('uiTheme');if(!select)return;
    select.value=current;
    select.addEventListener('change',()=>{
      if(!valid.has(select.value))return;
      current=select.value;document.documentElement.dataset.uiTheme=current;
      try{localStorage.setItem(key,current);}catch{}
    });
    window.addEventListener('storage',event=>{
      if(event.key!==key)return;
      current=valid.has(event.newValue)?event.newValue:'midnight';
      document.documentElement.dataset.uiTheme=current;select.value=current;
    });
  });
})();
