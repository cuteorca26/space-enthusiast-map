(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NotamSatelliteCatalogId=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Space-Track Alpha-5: A=10 ... Z=33, excluding I and O. OMM uses
  // decimal catalog numbers; both representations must join the same object.
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ';
  function normalizeCatalogId(value){
    const text=String(value??'').trim().toUpperCase();
    if(/^\d{1,9}$/.test(text))return String(Number(text));
    if(/^[A-HJ-NP-Z]\d{4}$/.test(text))return String((alphabet.indexOf(text[0])+10)*10000+Number(text.slice(1)));
    return '';
  }
  function identityScore(item){
    const raw=String(item.id||item.noradId||item.omm?.NORAD_CAT_ID||'');
    return (raw===normalizeCatalogId(raw)?4:0)+(item.owner?2:0)+(!/^(?:OBJECT|TBA|NORAD)\b/.test(item.name||'')?1:0);
  }
  function orbitQuality(item){
    const omm=item.omm,epoch=Date.parse(omm?.EPOCH??item.epoch);
    const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
    // Imported TLEs are normalized to OMM before entering the catalog. A newer
    // metadata-only or malformed duplicate must not erase working elements.
    const complete=omm&&Number.isFinite(epoch)&&String(omm.NORAD_CAT_ID??'').trim()!==''
      &&['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'].every(key=>numeric(omm[key]))
      &&Number(omm.MEAN_MOTION)>0&&Number(omm.ECCENTRICITY)>=0&&Number(omm.ECCENTRICITY)<1&&Number(omm.INCLINATION)>=0&&Number(omm.INCLINATION)<=180;
    return [Number(Boolean(complete)),Number(Boolean(omm)),Number.isFinite(epoch)?epoch:-Infinity];
  }
  function newerUsableOrbit(previous,next){
    const a=orbitQuality(previous),b=orbitQuality(next);
    for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]>b[i]?previous:next;
    return previous;
  }
  function canonicalizeCatalog(items){
    const byId=new Map();
    for(const item of items||[]){
      const raw=String(item.id||item.noradId||item.omm?.NORAD_CAT_ID||''),id=normalizeCatalogId(raw)||raw;
      if(!id)continue;
      let next=id===raw&&(!item.omm||String(item.omm.NORAD_CAT_ID)===id)?item:{...item,id,noradId:id,omm:item.omm?{...item.omm,NORAD_CAT_ID:id}:item.omm,catalogIdAliases:[...new Set([...(item.catalogIdAliases||[]),raw])]};
      const previous=byId.get(id);
      if(previous){
        const identity=identityScore(previous)>=identityScore(next)?previous:next;
        const orbit=newerUsableOrbit(previous,next);
        next={...identity};
        for(const key of ['epoch','omm','orbitClass','elementSource','periodMinutes','semiMajorKm','perigeeKm','apogeeKm','inclinationDeg','eccentricity'])if(orbit[key]!==undefined)next[key]=orbit[key];
        next.catalogIdAliases=[...new Set([...(previous.catalogIdAliases||[]),...(item.catalogIdAliases||[]),...(raw!==id?[raw]:[])])];
        next.classificationGroups=[...new Set([...(previous.classificationGroups||[]),...(item.classificationGroups||[])])];
      }
      byId.set(id,next);
    }
    return [...byId.values()];
  }
  return {normalizeCatalogId,canonicalizeCatalog};
});
