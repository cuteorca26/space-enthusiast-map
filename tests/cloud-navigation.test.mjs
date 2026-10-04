import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import h5wasm from 'h5wasm/node';
import { readCloudNavigation } from '../cloud-navigation.mjs';

test('partial cloud navigation reads match the original full-grid axes exactly', async () => {
  await h5wasm.ready;
  const directory = await mkdtemp(join(tmpdir(), 'space-nav-test-'));
  const file = new h5wasm.File(join(directory, 'navigation.h5'), 'w');
  try {
    const lat = Float32Array.from([60, 61, 62, 63, 30, 31, 32, 33, 0, 1, 2, 3]);
    const lon = Float32Array.from([-180, -90, 0, 90, -180, -90, 0, 90, -180, -90, 0, 90]);
    file.create_dataset({ name: 'lat', data: lat, shape: [3, 4] });
    file.create_dataset({ name: 'lon', data: lon, shape: [3, 4] });
    const axes = readCloudNavigation(file, 4, 3);
    assert.deepEqual([...axes.latRows], [lat[2], lat[6], lat[10]]);
    assert.deepEqual([...axes.lonColumns], [...lon.slice(0, 4)]);
    assert.throws(() => readCloudNavigation(file, 5, 3));
  } finally {
    file.close();
    await rm(directory, { recursive: true, force: true });
  }
});
