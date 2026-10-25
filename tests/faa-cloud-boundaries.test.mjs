import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNotamText,validateParsedGeometry} from '../server.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/faa-20261025/new-cloud-boundaries.json',import.meta.url)));
for(const row of cases)test(`live cloud ${row.notamId}: preserve all verified local boundary parts`,()=>{
 const parsed=parseNotamText(row.text),geometry=parsed.geometry;
 assert.ok(geometry,parsed.geometryReason);
 assert.equal(validateParsedGeometry(geometry),null);
 assert.equal(geometry.type,row.expected.type);
 assert.equal(geometry.type==='MultiPolygon'?geometry.coordinates.length:1,row.expected.regions);
 assert.equal(parsed.geometryComplete,true);
});
