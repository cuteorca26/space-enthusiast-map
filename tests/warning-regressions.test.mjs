import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import geographiclib from 'geographiclib-geodesic';
import { parseNotamText, parseMarineSchedule, parseHydropacCurrentListPage,
  migrateCachedAreaParseResults, NAVAREA_WARNING_REGIONS, retainFailedNavareaRegions } from '../server.mjs';
const fixture = name => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const cases = JSON.parse(fixture('boundary-regressions.json'));
const real = JSON.parse(fixture('real-boundaries.json'));
const count = geometry => geometry ? geometry.type === 'MultiPolygon' ? geometry.coordinates.length : 1 : 0;

for (const c of cases) test(`boundary: ${c.id}`, () => {
  const parsed = parseNotamText(c.text);
  // Corridors remain explicitly unsupported in this release; do not invent a ring.
  if (c.id === 'explicit-corridor') { assert.equal(parsed.geometry, null); return; }
  assert.equal(count(parsed.geometry), c.polygons, parsed.geometryReason);
  if (c.vertices != null) {
    const parts = parsed.geometry.type === 'MultiPolygon' ? parsed.geometry.coordinates : [parsed.geometry.coordinates];
    assert.equal(parts.flat().reduce((n, ring) => n + ring.length - 1, 0), c.vertices);
  }
  if (c.holes != null) assert.equal(parsed.geometry.coordinates.length - 1, c.holes);
});

test('949 radius is 71 nautical miles on WGS84 and its 18 daily windows are preserved', () => {
  const raw = cases.find(c => c.id === 'real-NAVAREA-IV-949-26').text;
  const p = parseNotamText(raw);
  assert.equal(p.radiusNm, 71);
  assert.ok(Math.abs(p.center.lon + 57.35) < 1e-8);
  assert.ok(p.geometry.coordinates[0].length >= 250);
  for (const [lon, lat] of p.geometry.coordinates[0]) {
    const d = geographiclib.Geodesic.WGS84.Inverse(32 + 25 / 60, -57.35, lat, lon).s12;
    assert.ok(Math.abs(d - 71 * 1852) < 0.02, d);
  }
  const time = parseMarineSchedule(raw, { msgYear: 2026 });
  assert.equal(time.intervals.length, 18);
  assert.equal(time.intervals[0].start, '2026-10-04T00:01:00.000Z');
  assert.equal(time.intervals.at(-1).end, '2026-10-21T11:00:00.000Z');
  assert.match(time.beijingTimeLabel, /08:01-19:00/);
});

test('a failed NAVAREA retains previous records, including text-only records, without duplicates', () => {
  const previous = { generatedAt: '2026-10-01T00:00:00Z', restrictions: [
    { id: 'iv', notamId: 'NAVAREA IV 1/26', hasGeometry: true },
    { id: 'ii', notamId: 'NAVAREA II 1/26', hasGeometry: true },
  ], skipped: [{ id: 'iv-text', warningId: 'NAVAREA IV 2/26', rawText: 'text', reason: 'no boundary' }] };
  const rows = retainFailedNavareaRegions([{ id: 'iv', notamId: 'NAVAREA IV 1/26', title: 'fresh' }], previous, new Set(['NAVAREA IV']));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'fresh');
  assert.equal(rows[1].notamId, 'NAVAREA IV 2/26');
  assert.equal(rows[1].retainedFromPreviousRefresh, true);
});

test('circle exclusions form an actual hole and radius sectors do not become full discs', () => {
  const p = parseNotamText('AREA BOUNDED BY 100000N0200000E-100000N0220000E-120000N0220000E-120000N0200000E EXCLUDING AREA CIRCLE CENTERED ON 110000N0210000E RADIUS 5 NM.');
  assert.equal(p.geometry?.coordinates.length, 2);
  const unsupported = parseNotamText('SECTOR OF CIRCLE RADIUS 5-10KM CENTRE 110000N0210000E BTN AZM 020-112 DEG.');
  assert.equal(unsupported.geometry, null);
});

test('reference volcano coordinates and route footnotes do not enter ash cloud rings', () => {
  for (const id of ['R1728/26', 'A2405/26', 'A2404/26']) {
    const p = parseNotamText(real.find(c => c.id === id).text);
    assert.ok(p.geometryComplete, `${id}: ${p.geometryReason}`);
    assert.equal(p.geometry.coordinates[0].length, 5);
  }
});
test('mixed real polygon/circle notices retain all independent areas', () => {
  for (const [id, expected] of [['Z1069/26', 6], ['J9707/26', 2]]) {
    const p = parseNotamText(real.find(c => c.id === id).text);
    assert.equal(count(p.geometry), expected);
    assert.ok(p.geometryComplete, p.geometryReason);
  }
});
test('unresolved arcs and multi-point corridors remain clearly identified', () => {
  for (const id of ['A5539/26', 'U3618/26']) {
    const p = parseNotamText(real.find(c => c.id === id).text);
    assert.equal(p.geometry, null);
    assert.ok(p.geometryReason);
  }
  assert.match(parseNotamText(real.find(c => c.id === 'A5539/26').text).timeLabel, /MON-FRI 0900-2359/);
});
test('HYDROPAC each page keeps its own ID, body, date and authority link', () => {
  for (const [page, id, location] of [[1, 2903, 'TIMOR SEA'], [2, 2801, 'BAY OF BENGAL'], [3, 1903, 'PERSIAN GULF']]) {
    const rows = parseHydropacCurrentListPage(fixture(`hydropac-${page}.html`));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].msgNumber, id);
    assert.match(rows[0].text, new RegExp(location));
    assert.match(rows[0].authority, new RegExp(`/${id}-26-`));
    assert.ok(rows[0].issueDate);
  }
});
test('all 21 NAVAREA regions are configured exactly once', () => {
  assert.deepEqual(NAVAREA_WARNING_REGIONS.map(r => Number(r.id)), Array.from({ length: 21 }, (_, i) => i + 1));
});
test('SAT/SUN exclusions and invalid activity dates do not become continuous activity', () => {
  const warning = { msgYear: 2026, issueDate: '301017Z SEP 2026' };
  const time = parseMarineSchedule('OPERATIONS 1000Z TO 1100Z DAILY 09 THRU 12 OCT 26 EXCEPT SAT AND SUN.', warning);
  assert.deepEqual(time.intervals.map(i => i.start), ['2026-10-09T10:00:00.000Z', '2026-10-12T10:00:00.000Z']);
  const invalid = parseMarineSchedule('OPERATIONS 301200Z TO 301800Z FEB 26.', warning);
  assert.equal(invalid.longTerm, false);
  assert.equal(invalid.intervals.length, 0);
  assert.match(invalid.timeLabel, /无法可靠解析/);
});
test('previous skipped 949 cache is promoted without a network refresh', () => {
  const rawText = cases.find(c => c.id === 'real-NAVAREA-IV-949-26').text;
  const original = { restrictions: [], skipped: [{ id: '949', warningId: 'NAVAREA IV 949/26', rawText }], source: {} };
  const result = migrateCachedAreaParseResults('navarea', original);
  assert.ok(result.changed);
  assert.equal(result.data.restrictions.length, 1);
  assert.equal(result.data.skipped.length, 0);
  assert.equal(migrateCachedAreaParseResults('navarea', result.data).changed, false);
});
test('unmapped marine records remain searchable with original text and reason', () => {
  const context = {};
  runInNewContext(readFileSync(new URL('../frontend/marine-records.js', import.meta.url), 'utf8'), context);
  const rows = context.marineDisplayRecords({ restrictions: [{ id: 'a' }], skipped: [{ id: 'b', warningId: 'NAVAREA IX 1/26', rawText: 'source', reason: 'missing boundary' }] }, 'navarea');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].notamId, 'NAVAREA IX 1/26');
  assert.equal(rows[1].rawText, 'source');
  assert.equal(rows[1].geometry, null);
  assert.equal(rows[1].geometryReason, 'missing boundary');
});
