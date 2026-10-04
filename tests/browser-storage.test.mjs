import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';

const script = await readFile(new URL('../frontend/browser-saved-regions.js', import.meta.url), 'utf8');
function browser(indexedDB = new IDBFactory()) {
  const context = vm.createContext({ indexedDB, crypto: webcrypto, URL, TextEncoder, location: { origin: 'https://map.example' } });
  vm.runInContext(script, context);
  return context.BrowserSavedRegions;
}
const entry = { source: 'notam', refreshedAt: '2026-10-05T00:00:00Z', dataVersion: 'test', item: {
  id: 'example-area', notamId: 'TEST', title: 'Test area', region: 'Example FIR', hasGeometry: true,
  geometry: { type: 'Polygon', coordinates: [[[110, 30], [111, 30], [111, 31], [110, 30]]] },
} };
test('online saved areas survive page reload, deduplicate, restore and stay private to a browser', async () => {
  const storage = new IDBFactory();
  const api = browser(storage);
  const save = () => api.request('/api/saved-regions', { method: 'POST', body: JSON.stringify({ entries: [entry] }) });
  const [first, second] = await Promise.all([save(), save()]);
  assert.equal(first.added + second.added, 1);
  assert.equal(first.savedIds[0], second.savedIds[0]);
  const id = first.savedIds[0];
  const reloaded = browser(storage);
  const list = await reloaded.request('/api/saved-regions');
  assert.equal(list.records.length, 1);
  assert.equal(list.records[0].label, 'TEST');
  assert.equal(list.records[0].vertexCount, 3);
  const restored = await reloaded.request(`/api/saved-regions/item?id=${id}`);
  assert.equal(restored.item.id, entry.item.id);
  assert.equal(restored.item.geometry.type, 'Polygon');
  assert.equal((await browser().request('/api/saved-regions')).records.length, 0);
  await reloaded.request(`/api/saved-regions/item?id=${id}`, { method: 'DELETE' });
  assert.equal((await api.request('/api/saved-regions')).records.length, 0);
});
