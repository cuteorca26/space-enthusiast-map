import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNotamText,parseMsaWarningGeometry,parseMsaWarningSchedule,parseMsaWarningDetail,fetchMsaWarningListItems,discoverMsaWarningColumns,validateParsedGeometry} from '../server.mjs';
const parts=p=>p.geometry?.type==='MultiPolygon'?p.geometry.coordinates.length:p.geometry?1:0;
for(const f of JSON.parse(readFileSync(new URL('./fixtures/oct11-warning-cases.json',import.meta.url))))test(`real ${f.source} ${f.id}: ${f.expected} areas`,()=>{
 const p=f.source==='msa'?parseMsaWarningGeometry(f.rawText):parseNotamText(f.rawText);assert.equal(parts(p),f.expected,p.geometryReason);if(p.geometry)assert.equal(validateParsedGeometry(p.geometry),null);
});
for(const [description,radius]of [['RADIUS OF 1NM',1852],['WITHIN TWO MILES OF',3704],['WITHIN 5.4 SEA MILES RADIUS OF',10000.8],['RADIUS 49FT',14.9352],['RADIUS 0,2NM',370.4]])test(`explicit distance grammar ${description}`,()=>{
 const p=parseNotamText(`ACTIVITY IN AREA ${description} 300000N1200000E`);assert.equal(parts(p),1);assert.ok(Math.abs(p.geometry.boundaryRadiusMeters-radius)<1e-6);
});
test('multiple radii are not replaced by a polygon through their centres',()=>{
 const p=parseNotamText('ACTIVITY IN AREAS WITHIN:\nA. 2 MILES OF 30-00N 120-00E\nB. 3 MILES OF 31-00N 121-00E');assert.equal(parts(p),2);assert.ok(p.geometry.coordinates.every(g=>g[0].length>60));
});
test('Chinese polygon plus circles preserves all three areas',()=>{
 const p=parseMsaWarningGeometry('在30-00N 120-00E、30-00N 121-00E、31-00N 121-00E、31-00N 120-00E四点连线范围内作业，及以32-00N 120-00E、33-00N 120-00E为圆心，半径1海里水域作业。');assert.equal(parts(p),3);assert.equal(p.geometryComplete,true);
});
test('moving vessel radius is not assigned to a polygon vertex',()=>{
 const p=parseMsaWarningGeometry('30-00N 120-00E、30-00N 121-00E、31-00N 121-00E、31-00N 120-00E四点连线范围内施工，以作业船为圆心，半径500米的安全区。');assert.equal(parts(p),1);assert.equal(p.geometry.coordinates[0].length,5);
});
test('single buoy has no invented circle',()=>assert.equal(parts(parseMsaWarningGeometry('灯浮位于30-00N 120-00E，请保持安全距离。')),0));
test('a declared missing circle centre is reported rather than silently omitted',()=>{
 const p=parseMsaWarningGeometry('以30-00N120-00E、31-00N120-00E三个点为圆心，半径1海里');assert.equal(parts(p),0);assert.match(p.geometryReason,/数量/);
});
test('a circle arc description with no angular limits forms the full closed area',()=>assert.equal(parts(parseNotamText('AREA BOUNDED BY ARC OF RADIUS 3000 METERS CENTRED ON 30-00N 120-00E')),1));
test('explicit southern limiting line clips rather than fills the entire circle',()=>{
 const p=parseNotamText('AREA CIRCLE RADIUS 50KM AROUND 300000N1200000E LIMITED TO THE SOUTH BY LINE JOINING POINTS 300000N1190000E AND 300000N1210000E');
 assert.equal(parts(p),1);assert.ok(p.geometry.coordinates[0].every(c=>c[1]>=30-1e-10));assert.ok(p.geometry.coordinates[0].some(c=>c[1]>30.4));
});
test('north limiting edge retains the southern side across the date line',()=>{
 const p=parseNotamText('AREA CIRCLE RADIUS 50KM AROUND 300000N1795900E LIMITED TO THE NORTH BY LINE JOINING POINTS 300000N1790000E AND 300000N1790000W');
 assert.equal(parts(p),1);assert.ok(p.geometry.coordinates[0].every(c=>c[1]<=30+1e-10));assert.ok(p.geometry.coordinates[0].some(c=>c[0]<0));
});
test('Q line alone is not the operation boundary',()=>assert.equal(parts(parseNotamText('Q) RJJJ/QWALW/IV/M/W/000/100/3000N12000E025\nE) ACTIVITY WITHIN CTR.')),0));
test('circle limited by unknown national border is not drawn whole',()=>assert.equal(parts(parseNotamText('AREA CIRCLE RADIUS 5NM CENTRED ON 300000N1200000E LIMITED BY NATIONAL BOUNDARY')),0));
test('activity limited to a stated circle is drawable',()=>assert.equal(parts(parseNotamText('MIL EXER ACT IS LIMITED TO A 5NM RADIUS OF 300000N1200000E ONLY.')),1));
test('invalid minute or radius is not silently repaired',()=>{
 for(const text of ['以30-60N 120-00E为圆心，半径1海里','以30-00N 120-00E为圆心，半径0米'])assert.equal(parts(parseMsaWarningGeometry(text)),0);
});
test('two sectors share launcher and keep annular inner gap',()=>{
 const p=parseNotamText('ROCKET LAUNCHER POSITION 08-31.98N 076-52.05E DANGER SECTOR FROM LAUNCHER (A) RADIUS OF 05 NM BETWEEN AZIMUTH 190 AND 300 (B) BETWEEN RADII OF 05 NM AND 75 NM AND AZIMUTH 220 AND 260');assert.equal(parts(p),2);const radii=p.geometry.coordinates[1][0].map(([lon,lat])=>Math.hypot((lon-(76+52.05/60))*Math.cos(8.533*Math.PI/180),lat-(8+31.98/60)));assert.ok(Math.min(...radii)>0.07);assert.ok(Math.max(...radii)>1);
});
test('Chinese daily windows are separate, including overnight New Year',()=>{
 const p=parseMsaWarningSchedule('2026年12月31日至2027年1月2日每天2300时至0200时','2026-12-01T00:00:00Z');assert.equal(p.intervals.length,3);assert.equal(p.intervals[0].start,'2026-12-31T15:00:00.000Z');assert.equal(p.intervals[0].end,'2026-12-31T18:00:00.000Z');assert.equal(p.intervals.at(-1).end,'2027-01-02T18:00:00.000Z');
});
test('one-off plus daily Chinese windows both retained',()=>assert.equal(parseMsaWarningSchedule('9月28日1500时至1800时和9月29日至10月8日每日0600时至1800时','2026-09-01T00:00:00Z').intervals.length,11));
test('Chinese invalid Gregorian dates and 2460 rejected',()=>{
 for(const t of ['2月30日至3月1日每天0800时至0900时','10月1日至2日每天0800时至2460时']){const p=parseMsaWarningSchedule(t,'2026-01-01T00:00:00Z');assert.equal(p.intervals.length,0);assert.equal(p.scheduleStatus,'unresolved');}
});
const listing=(ids,count=4)=>`<script>pageParam.count=${count};pageParam.limit=2;</script>`+ids.map(i=>`<a href="/html/${i}.html"><span class="name">航警${i}</span><span class="time">2026-10-10</span></a>`).join('');
const column={bureau:'测试海事局',url:'https://www.msa.gov.cn/test/index.jhtml',paged:true};
test('MSA complete pagination returns every unique item',async()=>{const errors=[];const d=await fetchMsaWarningListItems([column],errors,{cutoffMs:Date.parse('2026-01-01'),fetchPage:async url=>listing(url.includes('_2')?[3,4]:[1,2])});assert.equal(d.items.length,4);assert.deepEqual(errors,[]);});
for(const [name,second]of [['empty advertised page',listing([])],['repeated first page',listing([1,2])],['HTML error page','<html>access failed</html>']])test('MSA rejects '+name,async()=>{const errors=[];await fetchMsaWarningListItems([column],errors,{cutoffMs:Date.parse('2026-01-01'),fetchPage:async url=>url.includes('_2')?second:listing([1,2])});assert.ok(errors.length);});
test('MSA missing bureau navigation cannot masquerade as national coverage',()=>assert.throws(()=>discoverMsaWarningColumns('<html>error</html>')));
test('MSA retains table coordinates outside p tags and excludes sharing footer',()=>{
 const html='<meta name="ArticleTitle" content="航警1/26"><meta name="PubDate" content="2026-10-10"><div id="ch_p"><p>在以下四点连线范围内：</p><table><tr><td>30-00N</td><td>120-00E</td></tr><tr><td>30-00N</td><td>121-00E</td></tr><tr><td>31-00N</td><td>121-00E</td></tr><tr><td>31-00N</td><td>120-00E</td></tr></table><div class="foot_but">收藏</div></div><p>打开微信</p>';
 const d=parseMsaWarningDetail(html,{title:'航警1/26',url:'https://www.msa.gov.cn/test.html'});assert.ok(!d.rawText.includes('微信'));assert.equal(parts(parseMsaWarningGeometry(d.rawText)),1);
});
test('MSA successful HTTP error body is rejected as invalid detail',()=>assert.throws(()=>parseMsaWarningDetail('<p>Access denied</p>',{title:'航警',url:'https://www.msa.gov.cn/test.html'})));
test('MSA restarts a shifted bureau and discards every row from its inconsistent pass',async()=>{
 let pass=0;const errors=[];const d=await fetchMsaWarningListItems([column],errors,{cutoffMs:Date.parse('2026-01-01'),fetchPage:async url=>{
  if(!url.includes('_2')){pass++;return listing(pass===1?[1,2]:[0,1]);}
  return listing(pass===1?[2,3]:[2,3]);
 }});
 assert.equal(pass,2);assert.deepEqual(errors,[]);assert.equal(d.items.length,4);
 assert.deepEqual(d.items.map(i=>i.title),['航警0','航警1','航警2','航警3']);
 assert.equal(d.coverage[0].paginationAttempts,2);assert.equal(d.coverage[0].recoveredPaginationErrors.length,1);
});
test('MSA persistently shifted pagination is still incomplete after three bounded scans',async()=>{
 let pass=0;const errors=[];const d=await fetchMsaWarningListItems([column],errors,{cutoffMs:Date.parse('2026-01-01'),fetchPage:async url=>{
  if(!url.includes('_2'))pass++;return listing(url.includes('_2')?[2,3]:[1,2]);
 }});
 assert.equal(pass,3);assert.equal(errors.length,1);assert.equal(d.coverage[0].stopReason,'invalid-pagination');assert.equal(d.items.length,2);
});
