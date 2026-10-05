import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBudgetQueue, dataResourceGroup } from '../memory-budget.mjs';

test('cloud source requests do not overlap and release working caches when switching sources', async () => {
  let active = 0;
  let peak = 0;
  let releases = 0;
  const queue = new MemoryBudgetQueue({ enabled: true, release: () => { releases++; } });
  const read = async value => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return value;
  };
  const result = await Promise.all([
    queue.run('cloud', () => read('tile one')),
    queue.run('cloud', () => read('tile two')),
    queue.run('satellite', () => read('catalog')),
    queue.run('satellite', () => read('refresh'), { fresh: true }),
  ]);
  assert.deepEqual(result, ['tile one', 'tile two', 'catalog', 'refresh']);
  assert.equal(peak, 1);
  assert.equal(releases, 3);
  await assert.rejects(queue.run('msa', () => { throw new Error('source unavailable'); }));
  assert.equal(await queue.run('notam', () => read('complete cache')), 'complete cache');
  assert.equal(dataResourceGroup('/api/health'), null);
  assert.equal(dataResourceGroup('/api/satellites/history'), 'satellite');
  assert.equal(dataResourceGroup('/api/cloud-satellite/tile/0/0/0'), 'cloud');
});

test('health requests stay responsive while a data source is busy', async () => {
  const queue = new MemoryBudgetQueue({ enabled: true });
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const refresh = queue.run('msa', () => waiting);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await queue.run(null, () => 'ok'), 'ok');
  finish('done');
  assert.equal(await refresh, 'done');
});
