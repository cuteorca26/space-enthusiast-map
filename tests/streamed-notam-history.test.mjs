import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStreamedNotamResponse, migrateCachedNotamParseResults, filterPayloadToReferenceTime, prepareAggregateCacheMetadata } from '../server.mjs';
const fixtures = JSON.parse(readFileSync(new URL('fixtures/boundary-regressions.json', import.meta.url)));
const referenceTime = '2026-10-05T00:00:00.000Z';
function normalize(value) {
  value = JSON.parse(JSON.stringify(value));
  const data = value.data || value;
  if (data.faaNotamParseMigration) delete data.faaNotamParseMigration.appliedAt;
  return value;
}
for (const migrated of [false, true]) for (const skipped of [false, true]) {
  test(`streamed NOTAM keeps every geometry, field and filter (current parser=${migrated}, skipped=${skipped})`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'space-stream-test-'));
    try {
      let data = { generatedAt: referenceTime, sources: { faaNotamSearch: { status: 'ok', message: '12 notices; 3 have parsed boundary geometry; complete' } },
        restrictions: fixtures.map((row, i) => ({ id: row.id, rawText: row.text, source: 'FAA NOTAM Search live', region: 'KZMA', category: `category-${i % 3}`, hasGeometry: false })),
      };
      const extra = [ { id: 'expired', endsAt: '2026-01-01' }, { id: 'future', beginsAt: '2027-01-01', custom: 'preserve me' }, { id: 'empty-schedule', scheduleParsed: true, timeIntervals: [] } ];
      if (skipped) data.skipped = extra; else data.restrictions.push(...extra);
      if (migrated) data = migrateCachedNotamParseResults(data).data;
      const path = join(root, 'snapshot.json'), wrapped = { savedAt: referenceTime, cacheKey: 'old-cache-key', data };
      writeFileSync(path, JSON.stringify(wrapped));
      const response = await readStreamedNotamResponse({ path, id: 'test.json' });
      const actual = JSON.parse(readFileSync(response.filePath));
      const expected = { source: 'notam', id: 'test.json', savedAt: referenceTime, referenceTime,
        data: filterPayloadToReferenceTime('notam', migrateCachedNotamParseResults(data).data, referenceTime, 'history') };
      assert.deepEqual(normalize(actual), normalize(expected));
      assert.equal(response.summary.total, actual.data.restrictions.length + (actual.data.skipped?.length || 0));
      assert.equal(response.summary.drawable, actual.data.restrictions.filter(item => item.hasGeometry && item.geometry).length);
      assert.equal((await readStreamedNotamResponse({ path, id: 'test.json' })).filePath, response.filePath);
      const current = await readStreamedNotamResponse({ path, current: true, cacheKey: 'new-cache-key' });
      const expectedCurrent = filterPayloadToReferenceTime('notam', migrateCachedNotamParseResults(prepareAggregateCacheMetadata(structuredClone(wrapped), 'new-cache-key')).data, referenceTime, 'disk-cache');
      assert.deepEqual(normalize(JSON.parse(readFileSync(current.filePath))), normalize(expectedCurrent));
      // A replaced source file must invalidate even an already built response.
      wrapped.data.generatedAt = '2026-10-06T00:00:00Z'; writeFileSync(path, JSON.stringify(wrapped));
      assert.notEqual((await readStreamedNotamResponse({ path, id: 'test.json' })).filePath, response.filePath);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
