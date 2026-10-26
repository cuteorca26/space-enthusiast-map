import test from 'node:test';
import assert from 'node:assert/strict';
import { runDailySource, assertCompleteScheduledSource, DAILY_RETRY_DELAY_MS } from '../daily-refresh-policy.mjs';
import { faaResponseError, faaFailureDetails } from '../faa-access.mjs';

async function cycle(statuses, { publishMs = 0, collectMs = 0, retryAfterMs = 0 } = {}) {
  let clock = Date.parse('2026-10-17T07:37:00Z');
  const starts = [], reports = [], sleeps = [];
  const result = await runDailySource({ source: 'notam', now: () => clock,
    collect: async attempt => { starts.push(clock); clock += collectMs; return { status: statuses[attempt - 1],
      message: 'upstream', retryAfterAt: new Date(clock + retryAfterMs).toISOString() }; },
    publish: async row => { reports.push(row); clock += publishMs; },
    wait: async ms => { sleeps.push(ms); clock += ms; },
  });
  return { result, starts, reports, sleeps };
}
test('three failures wait one hour after each failed collection, then stop with no fourth attempt', async () => {
  const c = await cycle(['failed', 'failed', 'failed'], { collectMs: 7000, publishMs: 5000 });
  assert.equal(c.starts.length, 3); assert.equal(c.sleeps.length, 2);
  for (let i = 0; i < 2; i++) assert.equal(c.starts[i + 1] - Date.parse(c.reports[i].finishedAt), DAILY_RETRY_DELAY_MS);
  assert.equal(c.result.nextRetryAt, null); assert.equal(c.result.retryExhausted, true);
  assert.deepEqual(c.reports.map(row => row.attempt), [1, 2, 3]);
});
test('success at any attempt stops immediately without waiting or refreshing again', async () => {
  for (let failures = 0; failures <= 2; failures++) {
    const c = await cycle([...Array(failures).fill('failed'), 'success']);
    assert.equal(c.starts.length, failures + 1); assert.equal(c.sleeps.length, failures);
    assert.equal(c.result.nextRetryAt, null); assert.equal(c.result.retryExhausted, false);
  }
});
test('publication duration does not restart the one-hour clock; explicit Retry-After is respected', async () => {
  const slow = await cycle(['failed', 'success'], { publishMs: DAILY_RETRY_DELAY_MS + 10 });
  assert.equal(slow.sleeps.length, 0);
  const limited = await cycle(['failed', 'success'], { retryAfterMs: 2 * DAILY_RETRY_DELAY_MS });
  assert.equal(limited.sleeps[0], 2 * DAILY_RETRY_DELAY_MS);
});
test('publication errors stop safely without additional source requests', async () => {
  let calls = 0;
  await assert.rejects(runDailySource({ source: 'msa', collect: async () => { calls++; return { status: 'failed' }; },
    publish: async () => { throw Error('upload failed'); }, wait: async () => assert.fail('must not wait') }), /upload failed/);
  assert.equal(calls, 1);
});
test('collection exceptions participate in hourly retries; a new daily cycle resets attempts', async () => {
  for (let day = 0; day < 2; day++) {
    let clock = Date.parse('2026-10-17T07:37:00Z') + day * 86400000;
    const attempts = [];
    const result = await runDailySource({ source: 'msa', now: () => clock, wait: async ms => { clock += ms; },
      collect: async attempt => { attempts.push(attempt); if (attempt < 3) throw Error('timeout'); return { status: 'success' }; },
      publish: async () => {} });
    assert.deepEqual(attempts, [1, 2, 3]); assert.equal(result.status, 'success');
  }
});
test('all sources require complete coverage; MSA truncation/detail errors cannot be published as success', () => {
  assert.doesNotThrow(() => assertCompleteScheduledSource({ status: 'ok', coverageWarnings: [], sourceErrors: [] }));
  for (const field of [{ cacheFallback: true }, { partialRefresh: true }, { refreshIncomplete: true }, { failedFirs: ['KZNY'] }, { capped: true },
    { coverageWarnings: [{ bureau: '天津', truncatedWithinLookback: true }] }, { sourceErrors: ['missing detail page'] }, { status: 'warn' }])
    assert.throws(() => assertCompleteScheduledSource({ status: 'ok', ...field }));
});
test('FAA denial has actionable diagnostics without leaking the response body', () => {
  for (const status of [200, 403]) {
    const error = faaResponseError(new Response('', { status }), '<html>Access Denied Reference #18.abc123.9 secret-cookie-value</html>');
    const details = faaFailureDetails(error);
    assert.equal(details.code, 'FAA_ACCESS_DENIED'); assert.equal(details.httpStatus, status);
    assert.equal(details.reference, '18.abc123.9'); assert.match(details.accessHelpUrl, /^https:\/\/www.faa.gov\//);
    assert.doesNotMatch(JSON.stringify(details) + error.message, /secret-cookie-value/);
  }
  assert.equal(faaResponseError(new Response('{}'), '{}'), null);
});
test('FAA rate limiting preserves numeric and HTTP-date Retry-After', () => {
  const now = Date.parse('2026-10-17T07:37:00Z');
  for (const value of ['7200', 'Sat, 17 Oct 2026 09:37:00 GMT']) {
    const error = faaResponseError(new Response('', { status: 429, headers: { 'retry-after': value } }), '', now);
    assert.equal(error.code, 'FAA_RATE_LIMITED'); assert.equal(error.retryAfterAt, '2026-10-17T09:37:00.000Z');
  }
});
