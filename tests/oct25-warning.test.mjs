import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNotamText,validateParsedGeometry,extractCoordinateSections} from '../server.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oct25-warning-cases.json',import.meta.url)));
for(const [id,count] of [['V6577/26',18],['A1396/26',26],['W3774/26',6],['E4707/26',1],['E4708/26',1],['E4706/26',1],['B5135/26',1],['B5136/26',1],['P9482/26',1]]) test(`${id}: every explicit boundary is drawn (${count})`,()=>{
 const p=parseNotamText(rows.find(x=>x.id===id).rawText);assert.ok(p.geometry,p.geometryReason);assert.equal(p.geometryComplete,true,p.geometryReason);assert.equal(p.geometry.type==='MultiPolygon'?p.geometry.coordinates.length:1,count);assert.equal(validateParsedGeometry(p.geometry),null);
});
for(const id of ['W3024/26','R1490/26','G3555/26'])test(`${id}: conflicting radius or unlocated boundary still rejected`,()=>assert.equal(parseNotamText(rows.find(x=>x.id===id).rawText).geometry,null));
test('decimal radius on next line remains part of its arc',()=>{
 const text='AREA: 453243N0113508E THEN ARC OF CIRCLE IN CLOCKWISE DIRECTION\n0.25NM RADIUS CENTRED ON 453233N0113456E TILL POINT\n453240N0113436E';assert.equal(extractCoordinateSections(text).length,1);
});
test('closed route without explicit within-area semantics stays undrawn',()=>assert.equal(parseNotamText('FLIGHT ROUTE CORRIDOR: 3000N12000E-3000N12100E-3100N12100E-3000N12000E').geometry,null));
