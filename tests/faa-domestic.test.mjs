import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNotamText,extractNotamGeometryText,validateParsedGeometry,closePerformanceWorkers} from '../server.mjs';
import {firstNotamText} from '../faa-notam-export.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/faa-20261025/json-first-PHZH.json',import.meta.url),'utf8'));
after(closePerformanceWorkers);
test('domestic ADS-B parenthesis never consumes GPS boundary coordinates',()=>{
 for(const id of ['10/099','10/098']){
  const body=firstNotamText(fixture.notamList.find(n=>n.notamNumber===id));
  assert.equal(extractNotamGeometryText(body),body);
  const p=parseNotamText(body);
  assert.equal(p.geometry?.type,'Polygon');assert.equal(p.geometry.boundaryRadiusMeters,326*1852);
  assert.equal(p.geometry.boundaryCenter.lat,21+28/60+46/3600);
  assert.equal(p.geometry.boundaryCenter.lon,-(158+1/60+47/3600));
  assert.equal(validateParsedGeometry(p.geometry),null);
 }
});
test('domestic ADS-B service notice retains its full 232 NM circle',()=>{
 const body=firstNotamText(fixture.notamList.find(n=>n.notamNumber==='6/1268'));
 const p=parseNotamText(body);assert.equal(p.geometry?.type,'Polygon');
 assert.equal(p.geometry.boundaryRadiusMeters,232*1852);assert.equal(validateParsedGeometry(p.geometry),null);
});
test('ICAO E field still isolates the actual polygon and excludes header coordinates',()=>{
 const body=firstNotamText(fixture.notamList.find(n=>n.notamNumber==='A1568/26'));
 const p=parseNotamText(body);assert.equal(p.geometry?.type,'Polygon');assert.equal(p.coordinateCount,4);
 assert.equal(validateParsedGeometry(p.geometry),null);
});
