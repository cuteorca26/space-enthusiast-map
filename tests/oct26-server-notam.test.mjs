import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNotamText,validateParsedGeometry,closePerformanceWorkers} from '../server.mjs';
after(closePerformanceWorkers);
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oct26-server-notam.json',import.meta.url)));
const get=id=>rows.find(r=>r.id===id).rawText;
test('explicit AREA BOUNDED BY exclusion never replaces the outer activity circle',()=>{
  const p=parseNotamText('WI 15NM RADIUS OF 300000N1200000E EXCLUDING AREA BOUNDED BY 295500N1195500E-295500N1200500E-300500N1200500E-300500N1195500E');
  assert.equal(p.geometry?.type,'Polygon',p.geometryReason);
  assert.equal(p.geometry.coordinates.length,2,'The excluded polygon must remain an unfilled hole');
  assert.ok(p.geometry.coordinates[0].length>30,'The outer boundary must be the circle');
  assert.equal(p.geometry.coordinates[1].length,5);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.equal(validateParsedGeometry(p.geometry),null);
});
test('F3362/26: quoted CORRIDOR name does not invalidate an explicit closed area',()=>{
  const p=parseNotamText(get('F3362/26'));
  assert.equal(p.geometry?.type,'Polygon',p.geometryReason);
  assert.equal(p.geometry.coordinates[0].length,5);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.equal(validateParsedGeometry(p.geometry),null);
});
test('a segregated area with a named corridor but open coordinates is not closed by guessing',()=>{
  const p=parseNotamText(get('F3362/26').replace('510816N 0020000E - 511043N 0020000E','510816N 0020000E'));
  assert.equal(p.geometry,null);
});
test('a quoted corridor name does not hide actual centreline instructions',()=>{
  const p=parseNotamText(get('F3362/26').replace('ESTABLISHED 511043N','ESTABLISHED ALONG THE LINE 511043N'));
  assert.equal(p.geometry,null);
});
test('L5003/26: all five hemisphere-prefix vertices survive orphan-coordinate validation',()=>{
  const p=parseNotamText(get('L5003/26'));
  assert.equal(p.geometry?.type,'Polygon',p.geometryReason);
  assert.equal(p.geometry.coordinates[0].length,6);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.equal(validateParsedGeometry(p.geometry),null);
});
test('L5003/26: malformed prefix coordinate is still rejected',()=>{
  const p=parseNotamText(get('L5003/26').replace('W1284108','W1286108'));
  assert.equal(p.geometry,null);
});
test('a suffix orphan following valid prefix pairs still rejects the polygon',()=>{
  const p=parseNotamText('AREA BOUNDED BY N300000 E1200000\nN300000 E1210000\nN310000 E1210000\nN310000 E1200000\n320000N TO POINT OF ORIGIN');
  assert.equal(p.geometry,null);
});
test('CARF10/291: repeated explicit area declaration, including a name, creates two independent polygons',()=>{
  const p=parseNotamText(get('10/291'));
  assert.equal(p.geometry?.type,'MultiPolygon',p.geometryReason);
  assert.deepEqual(p.geometry.coordinates.map(c=>c[0].length),[11,5]);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.equal(validateParsedGeometry(p.geometry),null);
});
test('A4338/26: adjacent coordinate pairs retain the fourth vertex and closing point',()=>{
  const p=parseNotamText(get('A4338/26'));
  assert.equal(p.geometry?.type,'Polygon',p.geometryReason);
  assert.equal(p.geometry.coordinates[0].length,5);
  assert.equal(p.geometryComplete,true,p.geometryReason);
  assert.ok(p.geometry.coordinates[0].some(([lon,lat])=>Math.abs(lat-(-31-20/60-55/3600))<1e-6&&Math.abs(lon-(-64-21/60-7/3600))<1e-6));
});
test('arbitrary trailing digits do not become a recovered coordinate separator',()=>{
  const p=parseNotamText('AREA BOUNDED BY 300000N1200000E9 300000N1210000E 310000N1210000E 310000N1200000E');
  assert.equal(p.geometry,null);
});
