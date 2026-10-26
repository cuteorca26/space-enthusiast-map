import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNotamText,validateParsedGeometry} from '../server.mjs';
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/oct26-flight-altitude.json',import.meta.url)));
const raw=fixtures[0].rawText;
const expected=[[140+19/60+47/3600,39+30/60+10/3600],[140+39/60+47/3600,39+30/60+10/3600],[140+39/60+47/3600,39+10/60+10/3600],[140+19/60+47/3600,39+10/60+10/3600]];
for(const item of fixtures)test(`${item.id}: closed FLT AREA stays separate from subsequent VOR/latitude altitude zoning`,()=>{
 const p=parseNotamText(item.rawText);assert.equal(p.geometry?.type,'Polygon',p.geometryReason);assert.equal(p.geometryComplete,true);assert.equal(validateParsedGeometry(p.geometry),null);assert.equal(p.altitude,'SFC - 5000FT AMSL');
 const ring=p.geometry.coordinates[0];assert.equal(ring.length,5);assert.deepEqual(ring[0],ring.at(-1));
 expected.forEach((point,i)=>point.forEach((value,j)=>assert.ok(Math.abs(ring[i][j]-value)<1e-7,'every vertex follows the explicit horizontal chapter in source order')));
});
test('an invalid horizontal coordinate is never repaired by altitude chapter isolation',()=>{
 assert.equal(parseNotamText(raw.replace('393010N1401947E','393070N1401947E')).geometry,null);
});
test('an unclosed footprint does not qualify for altitude chapter isolation',()=>{
 assert.equal(parseNotamText(raw.replace('393010N1401947E\r\n(YOKOTE','(YOKOTE')).geometry,null);
});
test('an unknown or prohibitive remaining-area altitude is not discarded',()=>{
 for(const replacement of ['OTHER AREA:NOT SPECIFIED','OTHER AREA:PROHIBITED','OTHER AREA:0FT'])assert.equal(parseNotamText(raw.replace('OTHER AREA:5000FT',replacement)).geometry,null,replacement);
});
test('an unlabeled block cannot be guessed to be altitude-only',()=>{
 assert.equal(parseNotamText(raw.replace('2.FLT ALT :','2.OTHER INFO :')).geometry,null);
});
test('geographical restrictions under FLT ALT remain unresolved',()=>{
 for(const clause of ['EXCLUDING AREA XYZ','LIMITED BY FIR BOUNDARY','LATERAL LIMITS APPLY'])assert.equal(parseNotamText(raw.replace('3.FLT TIME',clause+'\r\n3.FLT TIME')).geometry,null,clause);
});
test('a geographical exclusion after altitude and physical characteristics is preserved',()=>{
 assert.equal(parseNotamText(raw.replace('F)SFC','EXCLUDING AREA XYZ\r\nF)SFC')).geometry,null);
});
test('an additional later boundary is preserved after altitude isolation',()=>{
 const p=parseNotamText(raw.replace('F)SFC','6.AREA BOUNDED BY\r\n392000N1403000E - 392100N1403000E - 392000N1403100E - 392000N1403000E\r\nF)SFC'));
 assert.equal(p.geometry?.type,'MultiPolygon',p.geometryReason);assert.equal(p.geometry.coordinates.length,2);assert.equal(p.geometryComplete,true);assert.equal(validateParsedGeometry(p.geometry),null);
});
