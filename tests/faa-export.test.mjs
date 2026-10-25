import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {firstNotamText,canonicalNotamText,parseFaaExport,verifyFaaExport,collectFaaExportBatch,buildFaaExportUrl} from '../faa-notam-export.mjs';
import {faaHttpError} from '../faa-notam-access.mjs';
const require=createRequire(import.meta.url),X=require('../vendor/sheetjs-0.20.3/xlsx.js');
const bytes=fs.readFileSync(new URL('./fixtures/faa-20261025/export-PHZH.bin',import.meta.url));
const original=X.utils.sheet_to_json(X.read(bytes,{type:'buffer'}).Sheets['All NOTAMs'],{header:1,defval:''});
const metadata=JSON.parse(fs.readFileSync(new URL('./fixtures/faa-20261025/json-first-PHZH.json',import.meta.url),'utf8'));
function altered(mutate){const rows=structuredClone(original);mutate(rows);const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'All NOTAMs');return X.write(wb,{type:'buffer',bookType:'xlsx'});}
test('whitespace ICAO field falls through to full traditional text',()=>{
 assert.equal(firstNotamText({icaoMessage:' ',traditionalMessage:'  FULL TEXT\nHERE  '}),'FULL TEXT\nHERE');
 assert.equal(firstNotamText({text:'\n',rawText:'\t',icaoMessage:'ABC',traditionalMessage:'DEF'}),'ABC');
});
test('real official export matches all 13 Hawaii records, including domestic NOTAMs',()=>{
 const rows=parseFaaExport(bytes,'PHZH');assert.equal(rows.length,13);verifyFaaExport(rows,metadata);
 for(const item of metadata.notamList){const other=rows.find(r=>r.notamNumber===item.notamNumber);assert.equal(canonicalNotamText(firstNotamText(other)),canonicalNotamText(firstNotamText(item)));assert.equal(other.transactionID,item.transactionID);}
});
test('real multi-FIR export has all 1719 records and all 30 JSON sample bodies',()=>{
 const query='RKRR,RJJJ,ZKKP,ZMUB,UAAA,UCFM,UTSD,UTAA,UTDD,VNSM,VQPR,VECF';
 const b=fs.readFileSync(new URL(`./fixtures/faa-20261025/export-${query}.bin`,import.meta.url));
 const m=JSON.parse(fs.readFileSync(new URL(`./fixtures/faa-20261025/json-first-${query}.json`,import.meta.url),'utf8'));
 const rows=parseFaaExport(b,query);assert.equal(rows.length,1719);verifyFaaExport(rows,m);assert.equal(new Set(rows.map(r=>r.transactionID)).size,rows.length);
});
test('export IDs are stable and unique without original transaction IDs',()=>{
 const a=parseFaaExport(bytes,'PHZH'),b=parseFaaExport(bytes,'PHZH');assert.deepEqual(a.map(r=>r.transactionID),b.map(r=>r.transactionID));assert.equal(new Set(a.map(r=>r.transactionID)).size,13);
});
test('wrong location or filtered export is rejected',()=>{
 assert.throws(()=>parseFaaExport(bytes,'KZNY'),/different location/);
 assert.throws(()=>parseFaaExport(altered(r=>r[1][0]='Filter(s) used: Airspace'),'PHZH'),/active filter/);
});
test('changed headings, empty bodies and duplicate rows are rejected',()=>{
 assert.throws(()=>parseFaaExport(altered(r=>r[4][6]='Summary only'),'PHZH'),/columns/);
 assert.throws(()=>parseFaaExport(altered(r=>r[5][6]=''),'PHZH'),/full text/);
 assert.throws(()=>parseFaaExport(altered(r=>r.push([...r[5]])),'PHZH'),/repeats/);
});
test('possible Excel cell truncation and non-workbooks are rejected',()=>{
 assert.throws(()=>parseFaaExport(altered(r=>r[5][6]='A'.repeat(32767)),'PHZH'),/truncated/);
 assert.throws(()=>parseFaaExport(Buffer.from('<html>Maintenance</html>'),'PHZH'),/not an Excel/);
});
test('missing row and altered sample body cannot be published',()=>{
 const rows=parseFaaExport(bytes,'PHZH');assert.throws(()=>verifyFaaExport(rows.slice(1),metadata),/incomplete/);
 rows[0].icaoMessage='WRONG';assert.throws(()=>verifyFaaExport(rows,metadata),/differs/);
});
test('complete export requires before and after metadata checks',async()=>{
 let checks=0,downloads=0;
 const r=await collectFaaExportBatch({query:{code:'PHZH'},getMetadata:async()=>{checks++;return metadata;},download:async()=>{downloads++;return bytes;}});
 assert.equal(checks,2);assert.equal(downloads,1);assert.equal(r.loadedCount,13);assert.equal(r.exportCount,1);
});
test('changing totals fail after a bounded retry',async()=>{
 let checks=0,downloads=0;
 await assert.rejects(collectFaaExportBatch({query:{code:'PHZH'},getMetadata:async()=>++checks%2?metadata:{...metadata,totalNotamCount:14},download:async()=>{downloads++;return bytes;}}),/total changed/);assert.equal(downloads,2);
});
test('export HTTP 403 is not blindly retried',async()=>{
 let downloads=0;await assert.rejects(collectFaaExportBatch({query:{code:'PHZH'},getMetadata:async()=>metadata,download:async()=>{downloads++;throw faaHttpError(403);}}),e=>e.code==='FAA_ACCESS_DENIED');assert.equal(downloads,1);
});
test('an export total of 429 is retried as a completeness failure, not treated as an HTTP rate limit',async()=>{
 let downloads=0;
 await assert.rejects(collectFaaExportBatch({query:{code:'PHZH'},getMetadata:async()=>({...metadata,totalNotamCount:429}),
  download:async()=>{downloads++;return bytes;}}),/13\/429/);
 assert.equal(downloads,2);
});
test('genuinely empty FIR still needs two matching official metadata checks',async()=>{
 let checks=0;const r=await collectFaaExportBatch({query:{code:'EMPTY'},getMetadata:async()=>{checks++;return{notamList:[],totalNotamCount:0};},download:async()=>{throw Error('must not download');}});assert.equal(checks,2);assert.equal(r.loadedCount,0);
});
test('official export URL mirrors UI quoting without tokens or SQL fields',()=>{
 const u=new URL(buildFaaExportUrl({searchType:'0',designatorsForLocation:'PHZH,KZNY',recaptchaToken:'secret',predefinedDabra:'unused'}));assert.equal(u.searchParams.get('designatorsForLocation'),"'PHZH,KZNY'");assert.equal(u.searchParams.get('notamsOnly'),"'true'");assert.equal(u.searchParams.get('searchType'),'0');assert(!u.searchParams.has('recaptchaToken'));assert(!u.searchParams.has('predefinedDabra'));
});
