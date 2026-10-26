import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNotamText,validateParsedGeometry,closePerformanceWorkers} from '../server.mjs';
after(closePerformanceWorkers);
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oct26-marine.json',import.meta.url)));
const parts=p=>p.geometry?.type==='MultiPolygon'?p.geometry.coordinates:p.geometry?[p.geometry.coordinates]:[];
const range=rows.find(r=>r.id==='NAVAREA VIII 1077/26').rawText;
const ice=rows.find(r=>r.id==='NAVAREA VI 2026/56').rawText;
test('NAVAREA III34/24: two waiting-area rings are isolated from the routes and variable-width channels',()=>{
  const p=parseNotamText(rows.find(r=>r.id==='NAVAREA III 34/24').rawText);
  assert.equal(parts(p).length,2,p.geometryReason);
  assert.deepEqual(parts(p).map(p=>p[0].length),[5,5]);
  assert.equal(p.geometryComplete,false,'Unresolved routes/channels must remain visible in completeness status');
  assert.ok(p.rejectedPolygonGroupCount>=3);
  assert.equal(validateParsedGeometry(p.geometry),null);
  assert.ok(parts(p)[0][0].every(([lon,lat])=>lon>=30+10/60-1e-7&&lon<=30+25/60+1e-7&&lat>=44+50/60-1e-7&&lat<=45+1e-7));
  assert.ok(parts(p)[1][0].every(([lon,lat])=>lat>46.4&&lat<46.6&&lon>30.8&&lon<31));
});
test('variable-width navigation channel is never filled as a polygon',()=>{
  const p=parseNotamText('NAVAREA III 1/26\n2.2.4. FROM PORT TO WAITING AREA. CHANNEL WIDTH UP TO 200 METERS:\n46-25.38N 030-52.60E\n46-22.00N 030-47.70E\n46-21.55N 030-46.29E\n46-20.00N 030-42.70E');
  assert.equal(p.geometry,null);
});
test('NAVAREA IX343/26: A/B/C/D following firing areas remain four separate quadrilaterals',()=>{
  const p=parseNotamText(rows.find(r=>r.id==='NAVAREA IX 343/26').rawText);
  assert.equal(parts(p).length,4,p.geometryReason);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.deepEqual(parts(p).map(p=>p[0].length),[5,5,5,5]);
  assert.equal(validateParsedGeometry(p.geometry),null);
});
test('NAVAREA VIII 1077/26: two independent rectangles, wrapped endpoints retained',()=>{
  const p=parseNotamText(range), polygons=parts(p);
  assert.equal(polygons.length,2,p.geometryReason);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.equal(validateParsedGeometry(p.geometry),null);
  const expected=[[4+32.42/60,5+3.51/60,84+47.59/60,85+22.36/60],[4+29.39/60,5+3.07/60,82+4.14/60,82+39.27/60]];
  for(const [i,polygon]of polygons.entries()){
    assert.equal(polygon[0].length,5);
    const xs=polygon[0].map(p=>p[0]),ys=polygon[0].map(p=>p[1]);
    const got=[Math.min(...ys),Math.max(...ys),Math.min(...xs),Math.max(...xs)];
    got.forEach((n,j)=>assert.ok(Math.abs(n-expected[i][j])<1e-6));
  }
});
test('an invalid range does not consume the next group or hide the valid range',()=>{
  const p=parseNotamText(range.replace('04-32.42N TO 05-\n03.51N','04-32.42N TO 05-\n93.51N'));
  assert.equal(parts(p).length,1,p.geometryReason);
  assert.equal(p.geometryComplete,false);
  assert.ok(p.rejectedPolygonGroupCount>=1);
  assert.ok(parts(p)[0][0].every(([lon])=>lon<83));
});
test('range endpoints never pair across an explicit group label',()=>{
  const text='NAVAREA VIII 1/26\nAREAS BOUNDED WITHIN (A) 04-30N TO (B) 05-00N AND 084-00E TO 085-00E';
  assert.equal(parseNotamText(text).geometry,null);
});
for(const row of rows.filter(r=>/SEA ICE AND ICEBERGS REPORT/.test(r.rawText)))test(`${row.id}: only the two explicitly listed iceberg areas are filled`,()=>{
  const p=parseNotamText(row.rawText);
  assert.equal(parts(p).length,2,p.geometryReason);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.deepEqual(parts(p).map(p=>p[0].length),[5,5]);
  assert.equal(validateParsedGeometry(p.geometry),null);
});
test('ice-edge line and iceberg position/size table never become a polygon',()=>{
  const prefix=ice.split(/4\.ICEBERGS AREA/)[0];
  assert.equal(parseNotamText(prefix).geometry,null);
});
test('incomplete labelled iceberg area is reported without joining the neighbour',()=>{
  const text=ice.replace(/B-60-50\.00S[\s\S]*?(?=REPORT POSITION)/,'B-60-50.00S 045-00.00W 53-45.00S 045-00.00W\n');
  const p=parseNotamText(text);
  assert.equal(parts(p).length,1,p.geometryReason);
  assert.equal(p.geometryComplete,false);
  assert.ok(p.rejectedPolygonGroupCount>=1);
});
test('malformed iceberg coordinate never silently vanishes from a boundary',()=>{
  const p=parseNotamText(ice.replace('A-55-12.00S','A-55-92.00S'));
  assert.equal(parts(p).length,1,p.geometryReason);
  assert.equal(p.geometryComplete,false);
});
