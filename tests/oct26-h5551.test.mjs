import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNotamText,validateParsedGeometry} from '../server.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/oct26-h5551.json',import.meta.url))).rawText;
const area='TEMPORARY RESTRICTED AREA BOUNDED BY\n300000N1200000E BASE 1500\n300000N1210000E N OF CITY 1501\n310000N1210000E E OF TOWN 1502\n310000N1200000E W OF PORT 1503\n300000N1200000E BASE 1504';
test('H5551/26 returning formation route is not a filled polygon and reports the actual reason',()=>{
 const p=parseNotamText(raw);assert.equal(p.geometry,null);assert.match(p.geometryReason,/编队飞行路线/);assert.doesNotMatch(p.geometryReason,/Invalid coordinate/);
});
test('removing H5551 clock times cannot turn the same formation route into an area',()=>{
 const p=parseNotamText(raw.replace(/\b(?:1548|1549|1553|1555|1558|1559|1600|1621|1623|1625|1629|1630|1631)\b/g,''));assert.equal(p.geometry,null);assert.match(p.geometryReason,/编队飞行路线/);
});
test('masking complete coordinates does not join a previous time and the next N/E/W place-name direction',()=>{
 const p=parseNotamText(area);assert.equal(p.geometry?.type,'Polygon',p.geometryReason);assert.equal(p.geometryComplete,true);assert.equal(validateParsedGeometry(p.geometry),null);assert.deepEqual(p.geometry.coordinates[0],[[120,30],[121,30],[121,31],[120,31],[120,30]]);
});
test('a real malformed half-coordinate following timed positions still blocks a polygon',()=>{
 const p=parseNotamText(area.replace('310000N1200000E W OF PORT','310000N1200069E W OF PORT'));assert.equal(p.geometry,null);assert.match(p.geometryReason,/Invalid coordinate/);
});
test('a formation context with a separately explicit area boundary retains the polygon',()=>{
 const p=parseNotamText('FORMATION TRANSIT BY ACFT ROUTING:\n'+area);assert.equal(p.geometry?.type,'Polygon',p.geometryReason);assert.equal(p.geometryComplete,true);
});
