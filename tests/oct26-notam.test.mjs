import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import geo from 'geographiclib-geodesic';
import {parseNotamText,extractCoordinates,validateParsedGeometry} from '../server.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oct26-notam.json',import.meta.url)));
const raw=id=>rows.find(x=>x.id===id).rawText;
const parts=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates;
for(const id of ['R0208/26','R0207/26','R0195/26'])test(`named Chilean sites: ${id} retains all 11 circles and their individual radii`,()=>{
 const p=parseNotamText(raw(id)),centres=extractCoordinates(raw(id)),radii=[1,.5,.5,.25,1,.5,.25,.25,.5,1,1];assert.ok(p.geometry,p.geometryReason);assert.equal(p.geometryComplete,true);assert.equal(parts(p.geometry).length,11);assert.equal(validateParsedGeometry(p.geometry),null);
 parts(p.geometry).forEach((polygon,i)=>{for(const [lon,lat] of polygon[0])assert.ok(Math.abs(geo.Geodesic.WGS84.Inverse(centres[i].lat,centres[i].lon,lat,lon).s12-radii[i]*1852)<.01);});
});
for(const id of ['L4021/26','L3920/26','L3919/26','N2675/26','A0860/26','P5314/26','P4578/26','H4757/26'])test(`operational permission does not erase a complete circle: ${id}`,()=>{
 const p=parseNotamText(raw(id));assert.ok(p.geometry,p.geometryReason);assert.equal(parts(p.geometry).length,1);assert.equal(p.geometryComplete,true);assert.equal(validateParsedGeometry(p.geometry),null);
});
test('three shared-radius centres can have parenthesized place labels',()=>{
 const p=parseNotamText(raw('B0897/26')),centres=extractCoordinates(raw('B0897/26'));assert.ok(p.geometry,p.geometryReason);assert.equal(parts(p.geometry).length,3);assert.equal(p.geometryComplete,true);
 parts(p.geometry).forEach((poly,i)=>{for(const [lon,lat] of poly[0])assert.ok(Math.abs(geo.Geodesic.WGS84.Inverse(centres[i].lat,centres[i].lon,lat,lon).s12-3*1852)<.01);});
});
test('an explicit correction repeating the same centre is one circle',()=>{const p=parseNotamText(raw('J2830/26'));assert.ok(p.geometry,p.geometryReason);assert.equal(p.geometry.type,'Polygon');assert.equal(p.geometryComplete,true);});
test('a different corrected centre is not guessed',()=>{assert.equal(parseNotamText(raw('J2830/26').replace('LOCATION CORRECTED TO 533921N 0030117W','LOCATION CORRECTED TO 534921N 0030117W')).geometry,null);});
for(const id of ['R4536/26','B5652/26'])test(`unresolved real geographical limits remain rejected: ${id}`,()=>assert.equal(parseNotamText(raw(id)).geometry,null));
test('operational permission normalization preserves subsequent geographic exclusions',()=>{
 for(const id of ['L4021/26','N2675/26','H4757/26','A0860/26'])assert.equal(parseNotamText(raw(id).replace(/F\)/,'EXCLUDING AREA XYZ.\nF)')).geometry,null,id);
});
test('site lists do not reinterpret incomplete constraints or extra reference coordinates',()=>{
 assert.equal(parseNotamText(raw('R0207/26').replace('RDO 1NM','RDO 1NM LIMITED BY NATIONAL BOUNDARY')).geometry,null);
 assert.equal(parseNotamText(raw('R0207/26').replace('F)GND','REFERENCE POINT 373000S0720000W\nF)GND')).geometry,null);
 assert.equal(parseNotamText(raw('B0897/26').replace('(SULTAN HILL)','(EXCLUDING SULTAN HILL AREA)')).geometry,null);
});
for(const [id,radius] of [['R1511/26',3*1852],['R0693/26',1852],['A5952/26',2000],['D6490/26',1852],['D6750/26',8*1852],['M2107/26',5*1852],['H5807/26',1.4*1852],['W4134/26',2*1852]])test(`complete circle survives operational or physical-balloon details: ${id}`,()=>{
 const p=parseNotamText(raw(id)),[centre]=extractCoordinates(raw(id));assert.ok(p.geometry,p.geometryReason);assert.equal(p.geometryComplete,true);assert.equal(p.geometry.type,'Polygon');assert.equal(validateParsedGeometry(p.geometry),null);
 for(const [lon,lat] of p.geometry.coordinates[0])assert.ok(Math.abs(geo.Geodesic.WGS84.Inverse(centre.lat,centre.lon,lat,lon).s12-radius)<.01);
 assert.equal(parseNotamText(raw(id).replace(/F\)/,'EXCLUDING AREA XYZ.\nF)')).geometry,null,'a subsequent geographical exclusion still blocks the whole circle');
});
for(const [id,count,radius] of [['A3263/26',5,.13*1852],['A3259/26',4,.10*1852]])test(`explicit shared-radius list with AREA labels: ${id}`,()=>{
 const p=parseNotamText(raw(id)),centres=extractCoordinates(raw(id));assert.ok(p.geometry,p.geometryReason);assert.equal(p.geometryComplete,true);assert.equal(parts(p.geometry).length,count);
 parts(p.geometry).forEach((poly,i)=>{for(const [lon,lat] of poly[0])assert.ok(Math.abs(geo.Geodesic.WGS84.Inverse(centres[i].lat,centres[i].lon,lat,lon).s12-radius)<.01);});
 assert.equal(parseNotamText(raw(id).replace('RMK:','LIMITED BY NATIONAL BOUNDARY. RMK:')).geometry,null);
});
function ringContains(ring,[x,y]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [ax,ay]=ring[i],[bx,by]=ring[j];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;}return inside;}
const contains=(geometry,point)=>parts(geometry).some(p=>ringContains(p[0],point)&&!p.slice(1).some(hole=>ringContains(hole,point)));
test('D5343 explicit overlapped exclusion subtracts the polygon instead of drawing it',()=>{
 const p=parseNotamText(raw('D5343/26'));assert.ok(p.geometry,p.geometryReason);assert.equal(p.geometryComplete,true);assert.equal(validateParsedGeometry(p.geometry),null);
 assert.ok(contains(p.geometry,[-4.148888888888889,40.58916666666667]),'the stated outer circle centre is retained');
 assert.equal(contains(p.geometry,[-3.95,40.45]),false,'a point inside both the circle and excluded polygon is absent');
 assert.ok(contains(p.geometry,[-4.25,40.60]),'the opposite side of the circle remains');
 assert.equal(contains(p.geometry,[-4.8,40.5]),false,'no extent outside the declared circle');
 for(const poly of parts(p.geometry))for(const ring of poly)for(const [lon,lat] of ring)assert.ok(geo.Geodesic.WGS84.Inverse(40.58916666666667,-4.148888888888889,lat,lon).s12<=15*1852+.01,'clipped output stays inside the 15NM outer circle');
 assert.equal(parseNotamText(raw('D5343/26').replace('403213N 0035413W','403269N 0035413W')).geometry,null,'invalid exclusion vertices may not be dropped');
});
