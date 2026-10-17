import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
import {parseNotamText, parseMarineSchedule, validateParsedGeometry} from '../server.mjs';
import {parseNotamSchedule, validIcaoDate} from '../notam-schedule.mjs';
const complex = JSON.parse(readFileSync(new URL('fixtures/independent-complex.json',import.meta.url)));
const geometries=[];
const postscript=JSON.parse(readFileSync(new URL('fixtures/postscript-and-multipart.json',import.meta.url)));
test('postscript minor arc replaces the correct polygon edge; chart ARC references are ignored',()=>{
  const p=parseNotamText(postscript['P4778/26']);assert.ok(p.geometryComplete,p.geometryReason);assert.ok(p.geometry.coordinates[0].length>6);assert.match(p.geometrySource,/圆弧/);
  const chart=parseNotamText(postscript['I0802/26']);assert.ok(chart.geometryComplete,chart.geometryReason);assert.equal(chart.geometry.coordinates[0].length,7);
});
test('multipart NOTAM keeps all six routes and five separate areas',()=>{
  const p=parseNotamText(postscript['A4185/26']);assert.ok(p.geometryComplete,p.geometryReason);assert.equal(p.geometry.coordinates.length,11);
});
for(const c of complex) test(c.id,()=>{
  const p=parseNotamText(c.text);
  assert.ok(p.geometryComplete,p.geometryReason);
  assert.equal(validateParsedGeometry(p.geometry),null);
  geometries.push({id:c.id,text:c.text,geometry:p.geometry,reason:p.geometryReason});
  if(c.id==='corridor-hole') assert.equal(p.geometry.coordinates.length,2);
});
test('all independent complex fixtures produced valid geometry',()=>assert.equal(geometries.length,complex.length));

test('arc missing direction/radius/centre is never replaced by straight polygon',()=>{
  const c=complex[0].text;
  for(const text of [c.replace('CLOCKWISE ',''),c.replace('RADIUS 10 KM','RADIUS UNKNOWN'),c.replace('CENTER AT','REFERENCE AT'),c.replace('RADIUS 10 KM','RADIUS 20 KM')]) assert.equal(parseNotamText(text).geometry,null,text);
});
test('annular sector and full annulus keep the excluded centre unfilled',()=>{
  for(const text of ['SECTOR RADIUS 5-10KM CENTRE 110000N0210000E BTN AZM 020-112 DEG','AREA RADII 5-10KM CENTRE 110000N0210000E']){
    const p=parseNotamText(text);assert.ok(p.geometryComplete,p.geometryReason);
    assert.equal(validateParsedGeometry(p.geometry),null);
    for(const ring of p.geometry.coordinates) for(const [lon,lat] of ring) assert.ok(Math.hypot(lon-21,lat-11)>0.03,'centre must be empty');
    if(text.startsWith('AREA'))assert.equal(p.geometry.coordinates.length,2);
  }
});
test('polar caps are identified as unsupported instead of filling the wrong hemisphere',()=>{
  const p=parseNotamText('AREA WITHIN 500 KM OF 890000N0200000E');
  assert.equal(p.geometry,null);assert.match(p.geometryReason,/极点/);
});

const iso=s=>new Date(s).toISOString();
const schedule=(text,b='2026-10-07T00:00Z',e='2026-10-12T23:59Z')=>parseNotamSchedule(text,iso(b),iso(e));
test('NOTAM weekday windows skip weekends and retain multiple windows',()=>{
  const s=schedule('MON-FRI 0900-1000 1300-1400');
  assert.equal(s.scheduleStatus,'parsed');assert.equal(s.timeIntervals.length,8);
  assert.ok(s.timeIntervals.every(i=>![0,6].includes(new Date(i.start).getUTCDay())));
});
test('NOTAM dates, month rollover, daily exceptions, overnight and B/C clipping',()=>{
  assert.equal(schedule('07 09 11 1000-1100').timeIntervals.length,3);
  assert.equal(schedule('DAILY 1000-1100 EXC SAT AND SUN').timeIntervals.length,4);
  const rollover=schedule('OCT 31 2300-0200, NOV 01 0400-0500','2026-10-31T23:30Z','2026-11-01T04:30Z');
  assert.deepEqual(rollover.timeIntervals,[{start:iso('2026-10-31T23:30Z'),end:iso('2026-11-01T02:00Z')},{start:iso('2026-11-01T04:00Z'),end:iso('2026-11-01T04:30Z')}]);
  assert.equal(schedule('FRI-MON 1000-1100').timeIntervals.length,4);
  assert.equal(schedule('2100/1500').scheduleStatus,'parsed');
  assert.equal(schedule('H24').timeIntervals.length,1);
  assert.equal(schedule('DAILY 2300-0200','2026-10-07T01:00Z','2026-10-07T01:30Z').timeIntervals.length,1);
  assert.equal(schedule('DAILY 2300-2400','2026-10-07T00:00Z','2026-10-08T00:00Z').timeIntervals[0].end,iso('2026-10-08T00:00Z'));
});
test('unresolved and impossible times never silently become continuous activity',()=>{
  for(const raw of ['DAILY SR-SS','MON-FRI 0900-1700 EXC HOL','07 1260-1300','DAILY 0900-0900','FEB 30 0900-1000']) assert.equal(schedule(raw).scheduleStatus,'unresolved',raw);
  assert.equal(schedule('07 0900-1000','2026-10-01T00:00Z','2026-11-30T00:00Z').scheduleStatus,'unresolved');
  for(const raw of ['2602301200','2610072460','2613000000','2610000000'])assert.equal(validIcaoDate(raw),null,raw);
  const p=parseMarineSchedule('OPERATIONS 301200Z TO 301800Z FEB 26. CANCEL THIS MSG 010100Z MAR 26. ISSUED 201000Z FEB 26.',{msgYear:2026});
  assert.equal(p.longTerm,false); assert.equal(p.intervals.length,0);assert.match(p.timeLabel,/无法可靠解析/);
});
test('NOTAM parsed schedule survives real import/migration interface',()=>{
  const p=parseNotamText('A1234/26 NOTAMN A) TEST B)2610070000 C)2610122359 D) MON-FRI 0900-1700 E) AREA BOUNDED BY 1000N02000E 1100N02000E 1100N02100E');
  assert.equal(p.timeIntervals.length,4);assert.equal(p.scheduleParsed,true);assert.match(p.beijingTimeLabel,/17:00/);
});
test('same-period map selection compares actual intervals rather than outer validity',()=>{
  const source=readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function sameRestrictionTimeWindow('),source.indexOf('function hasConcreteTimeWindow('));
  const ctx={TIME_WINDOW_TOLERANCE_MS:60000};runInNewContext(fn,ctx);
  const a={id:'a',...schedule('DAILY 0900-1000')},b={id:'b',...schedule('DAILY 1300-1400')};
  assert.equal(ctx.sameRestrictionTimeWindow(a,b),false);
  assert.equal(ctx.sameRestrictionTimeWindow(a,{...a,id:'c'}),true);
  assert.equal(ctx.sameRestrictionTimeWindow(a,{...a,id:'d',scheduleStatus:'unresolved'}),false);
});

test('Windows FAA transport rejects overlapping and incomplete pages', {skip:process.platform!=='win32'},()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const batch=source.slice(source.indexOf('async function runFaaNotamPowerShellBatch('));
  const body=batch.slice(batch.indexOf('const script = `')+16,batch.indexOf('\n`;')).replace('${FAA_NOTAM_SEARCH_ENDPOINT}','http://offline.test/');
  for(const scenario of ['normal','overlap','short','changing-total']) {
    const mock=`function Invoke-WebRequest { param($UseBasicParsing,$WebSession,$Method,$Uri,$Headers,$Body,$ContentType,$TimeoutSec)\n$offset=[int]$Body.offset; $count=30; $start=$offset; $total=60\nif ('${scenario}' -eq 'overlap' -and $offset -gt 0) {$start=20}\nif ('${scenario}' -eq 'short' -and $offset -gt 0) {$count=10}\nif ('${scenario}' -eq 'changing-total' -and $offset -gt 0) {$total=61}\n$rows=@(for ($i=0;$i -lt $count;$i++) { @{transactionID=('t'+($start+$i));text='test'} })\nreturn @{Content=(@{totalNotamCount=$total;notamList=$rows}|ConvertTo-Json -Depth 10 -Compress)}\n}\n`;
    const script="$ProgressPreference='SilentlyContinue'\n"+mock+body.replace('-UseBasicParsing -WebSession','-UseBasicParsing $true -WebSession');
    const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,env:{...process.env,FAA_NOTAM_FIRS_B64:Buffer.from('[{"code":"TEST"}]').toString('base64'),FAA_NOTAM_MAX_PER_FIR:'0',FAA_NOTAM_PAGE_DELAY_MS:'0'}});
    const r=JSON.parse(output.replace(/^\uFEFF/,''));
    assert.equal(Boolean(r.error),scenario!=='normal',`${scenario}: ${r.error}`);
    if(scenario==='overlap')assert.match(r.error,/overlaps/);
  }
});
