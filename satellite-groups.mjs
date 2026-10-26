import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

// A NORAD join is needed for temporarily unnamed / renamed payloads. These
// are operator/series groups, plus independent purpose groups used as fallbacks.
export const SATELLITE_GROUPS = ['starlink','oneweb','kuiper','qianfan','hulianwang','planet','spire','intelsat','ses','eutelsat','telesat','iridium-NEXT','orbcomm','globalstar','gps-ops','glo-ops','galileo','beidou','stations','weather','resource','sar','science','geodetic','engineering','education','amateur','x-comm','other-comm','military','sarsat','radar'];
export function validateGroup(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('分组为空或不是 JSON 数组');
  if (records.some(r => !/^\d{1,9}$/.test(String(r?.NORAD_CAT_ID)) || !Number.isFinite(Date.parse(r.EPOCH)) || !(Number(r.MEAN_MOTION)>0))) throw new Error('分组存在无效编号或轨道根数');
  return records;
}
export async function fetchSatelliteGroups(cacheFile, fetchSource, { now = Date.now() } = {}) {
  let cache = { groups: {} };
  try { if (existsSync(cacheFile)) cache = JSON.parse(readFileSync(cacheFile,'utf8')); } catch {}
  cache.groups ||= {};
  let cursor = 0, halted = false; const errors = [];
  await Promise.all([0,1].map(async () => {
    while (!halted && cursor < SATELLITE_GROUPS.length) {
      const group = SATELLITE_GROUPS[cursor++], previous = cache.groups[group];
      const age = now - Date.parse(previous?.fetchedAt);
      if (age >= 0 && age < 2*3600000 && previous?.records?.length) continue;
      const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=JSON`;
      try {
        const records = validateGroup(await fetchSource(url,{responseType:'json',timeoutMs:90000,retries:0,jsonParseRetry:2}));
        cache.groups[group] = { fetchedAt: new Date(now).toISOString(), url, records };
      } catch (e) {
        errors.push(`${group}: ${e.message}`);
        // Stop the batch after an upstream refusal/server error. Keep prior
        // memberships; do not turn 32 categories into repeated denied requests.
        if (/HTTP\s*[345]\d\d|returned error:\s*[345]\d\d/i.test(e.message)) halted = true;
      }
    }
  }));
  mkdirSync(dirname(cacheFile),{recursive:true});
  const temp = `${cacheFile}.${process.pid}.tmp`;
  writeFileSync(temp,JSON.stringify(cache));renameSync(temp,cacheFile);
  const byId = new Map(), elements = [], statuses=[];
  for (const group of SATELLITE_GROUPS) {
    const entry = cache.groups[group];
    statuses.push({ group, count: entry?.records?.length || 0, fetchedAt: entry?.fetchedAt || '', stale: !entry || now-Date.parse(entry.fetchedAt)>=2*3600000 });
    for (const omm of entry?.records || []) {
      const id=String(omm.NORAD_CAT_ID);
      if(!byId.has(id))byId.set(id,[]);
      byId.get(id).push(group.toLowerCase());
      elements.push(omm);
    }
  }
  return { byId, elements, statuses, errors };
}
