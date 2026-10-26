import fs from 'node:fs/promises';
import path from 'node:path';

export const SOURCE_URLS = {
  launches: 'https://planet4589.com/space/gcat/tsv/ldes/O.tsv',
  log: 'https://planet4589.com/space/gcat/tsv/derived/launchlog.tsv',
  current: 'https://planet4589.com/space/gcat/tsv/derived/currentcat.tsv',
  sites: 'https://planet4589.com/space/gcat/tsv/tables/sites.tsv',
  stages: 'https://planet4589.com/space/gcat/tsv/tables/lvs.tsv',
  satcat: 'https://celestrak.org/pub/satcat.csv',
};
export function parseTsv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.find(line => line.startsWith('#') && line.includes('\t'));
  if (!header) throw Error('GCAT 表头缺失');
  const keys = header.slice(1).split('\t').map(x => x.trim());
  return lines.filter(line => line && !line.startsWith('#')).map(line => {
    const values = line.split('\t');
    return Object.fromEntries(keys.map((key, i) => [key, (values[i] || '').trim()]));
  });
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell.replace(/\r$/, '')); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else cell += c;
  }
  if (quoted) throw Error('SATCAT CSV 引号不完整');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const keys = rows.shift()?.map(x => x.replace(/^\uFEFF/, '')) || [];
  if (!keys.includes('NORAD_CAT_ID')) throw Error('SATCAT 表头缺失');
  return rows.filter(row => row.length === keys.length).map(row => Object.fromEntries(keys.map((key, i) => [key, row[i].trim()])));
}
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const clean = x => !x || ['-', '?'].includes(x) ? '' : x;
export function gcatDate(raw) {
  const m = String(raw || '').trim().match(/^(\d{4}) (\w{3})\s+(\d{1,2})(?: (\d{2})(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(\?)?$/);
  if (!m) return {raw: clean(raw), iso: '', day: '', precision: 'unknown', uncertain: Boolean(raw?.includes('?'))};
  const month = months.indexOf(m[2]), year = +m[1], day = +m[3], hour = +(m[4] || 0), minute = +(m[5] || 0), second = +(m[6] || 0);
  const date = new Date(Date.UTC(year, month, day, hour, minute, Math.min(second, 59)));
  if (month < 0 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 60) return {raw, iso: '', day: '', precision: 'unknown', uncertain: true};
  const iso = m[7] ? date.toISOString().slice(0,19)+'.'+m[7]+'Z' : date.toISOString();
  return {raw, iso: m[4] && !m[8] && second < 60 ? iso : '', day: iso.slice(0,10), precision: m[7] ? 'fraction' : m[6] ? 'second' : m[4] ? 'minute' : 'day', uncertain: Boolean(m[8])};
}
const siteChinese = {JQ:'酒泉卫星发射中心',JJSLC:'酒泉卫星发射中心',XSLC:'西昌卫星发射中心',TSLC:'太原卫星发射中心',TYSC:'太原卫星发射中心',WSC:'文昌航天发射场',WCSLC:'文昌航天发射场',CC:'卡纳维拉尔角',CCSFS:'卡纳维拉尔角太空军基地',KSC:'肯尼迪航天中心',V:'范登堡',VAFB:'范登堡',VSFBS:'范登堡太空军基地','GIK-5':'拜科努尔航天发射场','NIIP-5':'拜科努尔航天发射场','GIK-1':'普列谢茨克','NIIP-53':'普列谢茨克',KOU:'库鲁圭亚那航天中心',SHAR:'萨蒂什·达万航天中心',TNSC:'种子岛宇宙中心',MAHIA:'马希亚发射场',WLP:'瓦勒普斯岛'};
function launchMetadata(row, sites, stages) {
  const variant = row.Variant === '?' ? '?' : clean(row.Variant), vehicle = clean(row.LV_Type);
  const exact = stages.filter(s => s.LV_Name === vehicle && clean(s.LV_Variant) === variant);
  // A question mark is source uncertainty, not a different hardware variant.
  // Keep that uncertainty visible even when its candidate stage table exists.
  const configUncertain = /\?$/.test(variant);
  const config = exact.length ? exact : configUncertain ? stages.filter(s => s.LV_Name === vehicle && clean(s.LV_Variant) === variant.replace(/\?$/, '')) : [];
  const upper = config.filter(s => /^\d+$/.test(s.Stage_No) && +s.Stage_No >= 2 && s.Dummy !== 'Y').sort((a,b) => +a.Stage_No - +b.Stage_No);
  const uncertainStage = s => Boolean(s.Qualifier && s.Qualifier !== '-');
  const stageUncertain = upper.some(uncertainStage);
  const noUpper = !configUncertain && !/UNK|\?/i.test(vehicle) && config.some(s => s.Stage_No === '1' && s.Dummy !== 'Y') && !upper.length;
  const siteCode = clean(row.Ascent_Site) || clean(row.Launch_Site), site = sites.get(siteCode);
  const siteName = clean(site?.EName) || clean(site?.Name) || siteCode;
  const translatedSite = siteChinese[siteCode] || [/Wenchang|文昌/i.test(siteName)&&'文昌航天发射场',/Jiuquan|酒泉/i.test(siteName)&&'酒泉卫星发射中心',/Taiyuan|太原/i.test(siteName)&&'太原卫星发射中心',/Xichang|西昌/i.test(siteName)&&'西昌卫星发射中心',/Kennedy/i.test(siteName)&&'肯尼迪航天中心'].find(Boolean);
  return {key: row.Launch_Tag, time: gcatDate(row.Launch_Date), vehicle, variant,
    upperStage: upper.map(s => `${s.Stage_Name}${configUncertain || uncertainStage(s) ? '（待核实）' : ''}`).join(' / ') || (noUpper ? '构型表未列二级及以上级段' : ''),
    upperStageEvidence: configUncertain ? 'GCAT 构型带问号；以下为候选构型的级段，尚未确认' : stageUncertain ? 'GCAT 上面级表含不确定标记；标注的级段仍待核实' : upper.length ? 'GCAT 对应火箭型号与构型的上面级表' : noUpper ? 'GCAT 对应构型仅列芯级及助推器' : '未找到可核实的对应构型',
    upperStageStatus: configUncertain || stageUncertain ? 'uncertain' : upper.length ? 'matched' : noUpper ? 'none' : 'unknown',
    stages: upper.map(s => ({number:+s.Stage_No,name:s.Stage_Name,uncertain:configUncertain || uncertainStage(s)})),
    flightId: clean(row.Flight_ID), flight: clean(row.Flight),
    siteCode, site: [translatedSite, siteName].filter(Boolean).join(' · '),
    pad: clean(row.Ascent_Pad) || clean(row.Launch_Pad), platform: clean(row.Platform),
    carrierSite: clean(row.Ascent_Site) ? clean(row.Launch_Site) : '',
    mission: clean(row.Mission) || clean(row.Flight), reference: clean(row.LTCite),
  };
}
export function buildLaunchHistory(raw, fetchedAt = new Date().toISOString()) {
  const launchRows = parseTsv(raw.launches), log = parseTsv(raw.log), current = parseTsv(raw.current), siteRows = parseTsv(raw.sites), stages = parseTsv(raw.stages), satcat = parseCsv(raw.satcat);
  if (launchRows.length < 5000 || log.length < 15000 || current.length < 40000 || satcat.length < 40000 || siteRows.length < 100 || stages.length < 100) throw Error('发射档案源不完整，保留已有档案');
  const launches = {}, sites = new Map(siteRows.map(s => [s.Site, s]));
  for (const row of launchRows) launches[row.Launch_Tag] = launchMetadata(row, sites, stages);
  const objectLaunches = {}, byPiece = {}, currentById = new Map(), gcatToNorad = new Map();
  for (const r of current) if (/^S\d+$/.test(r.JCAT) && /^\d+$/.test(r.Satcat)){currentById.set(String(+r.Satcat), r);gcatToNorad.set(r.JCAT,String(+r.Satcat));}
  for (const r of log) {
    if (!launches[r.Launch_Tag]) continue;
    if (/^S\d+$/.test(r.JCAT)) objectLaunches[gcatToNorad.get(r.JCAT)||String(+r.JCAT.slice(1))] = r.Launch_Tag;
    if (/^\d{4}-\d{3}[A-Z]+$/.test(r.Piece)) byPiece[r.Piece] = r.Launch_Tag;
  }
  const objects = [], seen = new Set();
  for (const r of satcat) {
    const id = String(+r.NORAD_CAT_ID);
    if (!/^\d+$/.test(r.NORAD_CAT_ID) || seen.has(id)) continue;
    seen.add(id);
    const g = currentById.get(id);
    // Before 1963 GCAT retains Greek launch designations (e.g. 1961 A KAP 3).
    // Resolve the exact catalog designation, guarded by the known launch day.
    const oldBatch=g?.Piece?.match(/^(\d{4} [A-Z ]+) \d+$/)?.[1],oldLaunch=launches[oldBatch];
    const historicalBatch=oldLaunch&&oldLaunch.time.day===r.LAUNCH_DATE?oldBatch:'';
    const directBatch = objectLaunches[id] || byPiece[r.OBJECT_ID] || historicalBatch;
    const fallbackBatch=r.OBJECT_ID.match(/^\d{4}-\d{3}/)?.[0], fallback=launches[fallbackBatch];
    const batch = directBatch || (fallback&&(!r.LAUNCH_DATE||!fallback.time.day||r.LAUNCH_DATE===fallback.time.day)?fallbackBatch:'');
    // A launch batch is only a fallback. Direct GCAT object joins take priority
    // for objects deployed from another spacecraft or assigned an old designator.
    if (launches[batch]) objectLaunches[id] = batch;
    if (r.OBJECT_TYPE !== 'PAY' || !['EA',''].includes(r.ORBIT_CENTER) || ['SS','HEL','LUN','SOL'].includes(r.ORBIT_TYPE)) continue;
    const launchTime=directBatch?launches[directBatch]?.time:null;
    const launchDate=launchTime?.day&&!launchTime.uncertain?launchTime.day:r.LAUNCH_DATE;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) continue;
    const decay = /^\d{4}-\d{2}-\d{2}$/.test(r.DECAY_DATE) ? r.DECAY_DATE : '';
    if (decay && decay < launchDate) continue;
    // Orbital launch failures and deep-space escape objects cannot be counted
    // as members of an Earth-orbit constellation from launch until today.
    const excluded = /suborbital|failed to orbit|heliocentric|orbit of (Moon|Mars|Venus)|escaped|escape from Earth/i.test(g?.ExpandedStatus || '') || (!decay && !['ORB','DOC'].includes(r.ORBIT_TYPE));
    objects.push({id, noradId:+id, name:r.OBJECT_NAME, internationalDesignator:r.OBJECT_ID, owner:r.OWNER,
      objectType:'PAY', objectClass:['+','P','B','S','X'].includes(r.OPS_STATUS_CODE)?'ACTIVE_PAYLOAD':'RETIRED_PAYLOAD',
      launchDate, catalogLaunchDate:r.LAUNCH_DATE, launchDateSource:launchTime?.day&&!launchTime.uncertain?'GCAT 逐星发射记录':'CelesTrak SATCAT', decayDate:decay, launchKey:launches[batch]?batch:'',
      historyExcluded:excluded, historyStatus:clean(g?.ExpandedStatus), decayPrecision:decay?'day':'',
    });
  }
  const sources = Object.entries(SOURCE_URLS).map(([key,url]) => ({key,url,fetchedAt,updatedAt:key === 'satcat' ? '' : raw[key].match(/^# Updated (.+)$/m)?.[1]?.trim() || ''}));
  return {version:1,metadataRevision:2,fetchedAt,historyThrough:fetchedAt.slice(0,10),sources,launches,objectLaunches,objects,
    coverage:{launches:Object.keys(launches).length,objects:objects.length,linkedObjects:Object.keys(objectLaunches).length,dateDifferences:objects.filter(x=>x.catalogLaunchDate&&x.launchDate!==x.catalogLaunchDate).length},
    definition:'按 UTC 日末统计进入地球轨道且尚未再入的载荷，包含退役在轨卫星；不是在役或已完成部署的数量。发射日优先取 GCAT 逐星发射记录，再以 SATCAT 补充；再入日取 SATCAT。保留原目录日期，不精确到轨道注入或在轨释放瞬间。'};
}
export class SatelliteLaunchHistoryService {
  constructor(root, {fetchText, dataDirectory=path.join(root,'data')}={}) { this.root=root; this.file=path.join(dataDirectory,'satellite_launch_history.json'); this.seed=path.join(root,'frontend','data','satellite-launch-history.json'); this.memory=null; this.pending=null; this.fetchText=fetchText || (async url => {const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.text();}); }
  async get({refresh=false}={}) {
    if (!this.memory) { for(const f of [this.file,this.seed]) { try {const d=JSON.parse(await fs.readFile(f,'utf8'));if(d.version===1&&d.objects?.length>10000){this.memory=d;break;}}catch{} } }
    if (!refresh) { if(this.memory)return this.memory;throw Error('尚未保存发射档案，请更新发射档案'); }
    if(this.pending)return this.pending;
    this.pending=this.refresh().finally(()=>{this.pending=null;});return this.pending;
  }
  async refresh() {
    try {
      const raw={};
      // Bound downloads and memory; each source is fetched once, never per star.
      for(const [key,url] of Object.entries(SOURCE_URLS))raw[key]=await this.fetchText(url);
      const data=buildLaunchHistory(raw);
      await fs.mkdir(path.dirname(this.file),{recursive:true});
      const tmp=this.file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data));await fs.rename(tmp,this.file);this.memory=data;return data;
    }catch(error){if(this.memory)return {...this.memory,refreshError:String(error.message),cacheFallback:true};throw error;}
  }
}
