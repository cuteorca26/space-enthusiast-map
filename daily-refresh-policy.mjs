export const MAX_DAILY_ATTEMPTS = 3;
export const DAILY_RETRY_DELAY_MS = 60 * 60 * 1000;

// Each GitHub matrix job owns one source; Render restarts cannot lose its timer.
export async function runDailySource({ source, collect, publish, now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let result;
  for (let attempt = 1; attempt <= MAX_DAILY_ATTEMPTS; attempt++) {
    const startedAt = new Date(now()).toISOString();
    let detail;
    try { detail = await collect(attempt); }
    catch (error) { detail = { status: 'failed', message: error.message || '本次全量采集未完成。' }; }
    if (!['success', 'failed'].includes(detail?.status)) throw new Error('Invalid collection outcome');
    const finished = now();
    const retry = detail.status === 'failed' && attempt < MAX_DAILY_ATTEMPTS;
    const retryAt = retry ? Math.max(finished + DAILY_RETRY_DELAY_MS, Date.parse(detail.retryAfterAt) || 0) : null;
    result = { ...detail, source, attempt, maxAttempts: MAX_DAILY_ATTEMPTS, startedAt,
      finishedAt: new Date(finished).toISOString(),
      nextRetryAt: retryAt ? new Date(retryAt).toISOString() : null,
      retryExhausted: detail.status === 'failed' && !retry };
    // Publish before advancing; publication errors must not trigger a new scan.
    await publish(result);
    if (!retry) break;
    while (now() < retryAt) await wait(retryAt - now());
  }
  return result;
}

export function assertCompleteScheduledSource(meta) {
  if (!meta || meta.status !== 'ok' || meta.cacheFallback || meta.partialRefresh ||
    meta.failedFirs?.length || meta.capped || meta.coverageWarnings?.length || meta.sourceErrors?.length)
    throw new Error(meta?.message || 'The full source refresh did not succeed');
}
