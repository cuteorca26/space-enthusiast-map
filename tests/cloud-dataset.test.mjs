import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import h5wasm from 'h5wasm/node';
import { readCloudDataset } from '../cloud-dataset.mjs';

test('cloud decoding transfers intact data, rejects invalid sources, and recovers for the next hour', async t => {
  await h5wasm.ready;
  const directory = await mkdtemp(join(tmpdir(), 'space-cloud-decoder-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'cloud.nc');
  const file = new h5wasm.File(path, 'w');
  const data = Float32Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  const timeUtc = '2026-10-04T22:00:00.000Z';
  try {
    file.create_dataset({ name: 'data', data, shape: [1, 3, 4] });
    file.create_dataset({ name: 'time', data: [Date.parse(timeUtc) / 1000] });
    file.create_dataset({ name: 'lat', data: Float32Array.from([60,60,60,60,30,30,30,30,-20,-20,-20,-20]), shape: [3,4] });
    file.create_dataset({ name: 'lon', data: Float32Array.from([180,-90,0,90,180,-90,0,90,180,-90,0,90]), shape: [3,4] });
  } finally { file.close(); }
  const item = { hourId: '2026100422', timeUtc };
  await assert.rejects(readCloudDataset(item, path), /unexpected data dimensions/);
  const options = { minimumWidth: 4, minimumHeight: 3 };
  const wrongHour = readCloudDataset({ ...item, timeUtc: '2026-10-04T20:00:00.000Z' }, path, options);
  const next = readCloudDataset(item, path, options);
  await assert.rejects(wrongHour, /does not match requested hour/);
  const result = await next;
  assert.deepEqual([...result.data], [...data]);
  assert.deepEqual([...result.latRows], [60, 30, -20]);
  assert.deepEqual([...result.lonColumns], [-180, -90, 0, 90]);
  assert.equal(result.sourceDate, timeUtc);
  assert.equal(result.invalidMask, null);
  assert.equal(result.width, 4);
  assert.equal(result.height, 3);
});
