import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fetchHydropacCurrentTextWarnings,parseHydropacFullTextPage,parseNotamText} from '../server.mjs';
import {parseNotamSchedule} from '../notam-schedule.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/oct26-hydropac-full.json',import.meta.url)));
const full=(body=fixture.body,count=fixture.count)=>`<div>${count}</div><div>active</div><div class="message-content">${body}</div>`;
test('real full-content snapshot parses all 137 unique complete warnings',()=>{
 const rows=parseHydropacFullTextPage(full());assert.equal(rows.length,137);assert.equal(new Set(rows.map(x=>x.msgYear+':'+x.msgNumber)).size,137);
 assert.equal(rows[0].msgNumber,3099);assert.equal(rows.at(-1).msgNumber,311);assert.equal(rows.at(-1).msgYear,2024);
 assert.ok(rows.every(x=>x.text.startsWith(x.issueDate)));assert.match(rows[0].sourcePageUrl,/HYDROPAC\/HYDROPAC/);
});
test('full-content rejects missing/mismatched count, truncation and duplicate IDs',()=>{
 assert.throws(()=>parseHydropacFullTextPage(full(fixture.body,138)),/mismatch/);
 assert.throws(()=>parseHydropacFullTextPage(full(fixture.body.slice(2000))),/mismatch/);
 assert.throws(()=>parseHydropacFullTextPage(full(fixture.body.replace('HYDROPAC 3099/26','HYDROPAC 3098/26'))),/duplicate/);
 assert.throws(()=>parseHydropacFullTextPage('<div class="message-content">hello</div>'),/Missing/);
});
test('inconsistent paginated pages use validated single-document fallback',async()=>{
 const urls=[];const rows=await fetchHydropacCurrentTextWarnings(async url=>{urls.push(url);return url.includes('/HYDROPAC/HYDROPAC/')?full():'<p>Could not load messages</p>';});
 assert.equal(rows.length,137);assert.equal(urls.length,2);
});
test('incomplete pagination plus incomplete full text remains a hard failure',async()=>{
 await assert.rejects(fetchHydropacCurrentTextWarnings(async url=>url.includes('/HYDROPAC/HYDROPAC/')?full(fixture.body,140):'<p>Could not load messages</p>'),/fallback incomplete.*mismatch/);
});
test('references to another HYDROPAC message do not split the bulletin',()=>{
 const rows=parseHydropacFullTextPage(full());assert.ok(rows.some(x=>/CANCEL HYDROPAC/.test(x.text)));assert.equal(rows.length,137);
});
test('conditional E activation cannot be reported as exact daily D schedule',()=>{
 const body='ZRT CAN BE ACT WITH 15MIN NOTICE: MON-THU 0800-1500 EXC ON 2026\nNOV 11';
 const p=parseNotamText(`R2989/26 NOTAMN\nQ) LFRR/QRTCA/IV/BO /W /000/015/4817N00438W001\nA) LFRR B) 2610260800 C) 2703251500\nD) 0800-1500\nE) ${body}\n1-LATERAL LIMITS: 0.5NM RADIUS CENTRED ON 481647N0043730W.`);
 assert.equal(p.scheduleStatus,'unresolved');assert.equal(p.scheduleParsed,false);assert.deepEqual(p.timeIntervals,[]);assert.match(p.scheduleReason,/NOTICE/);
 assert.ok(p.geometry,p.geometryReason);
 const precise=parseNotamSchedule('MON-THU 0800-1500','2026-10-26T08:00:00Z','2026-11-01T15:00:00Z');assert.equal(precise.scheduleStatus,'parsed');assert.equal(precise.timeIntervals.length,4);
});
test('a temporal exception never removes a following geographic exclusion',()=>{
 const p=parseNotamText('AREA 1NM RADIUS CENTRED ON 3000N12000E. EXC ON 2026 NOV 11. EXCLUDING AIRSPACE NORTH OF HIGHWAY X.');assert.equal(p.geometry,null);
 const p2=parseNotamText('A1234/26 NOTAMN\nB) 2610260800 C) 2611301500\nD) 0800-1500\nE) AREA 1NM RADIUS CENTRED ON 3000N12000E. EXC ON 2026 NOV 11.');assert.ok(p2.geometry);assert.equal(p2.scheduleStatus,'unresolved');
});
