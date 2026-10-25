// Shared policy for the public FAA search transports. No credentials or response
// HTML are retained in diagnostics; only status, transport and reference number.
export function isFaaAccessDenied(error) {
  return error?.code === 'FAA_ACCESS_DENIED' || error?.httpStatus===403 || error?.status===403 ||
    /\bAccess\s+Denied\b|\b(?:HTTP(?:\/[\d.]+)?|status(?:\s+code)?)\s*[:=]?\s*403\b|\(403\)\s*Forbidden|^\s*(?:Error:\s*)?403(?:\s|$)/i.test(error?.message || String(error || ''));
}

export function isFaaRateLimited(error) {
  return error?.code === 'FAA_RATE_LIMITED' || error?.httpStatus===429 || error?.status===429 ||
    /\bToo Many Requests\b|\b(?:HTTP(?:\/[\d.]+)?|status(?:\s+code)?)\s*[:=]?\s*429\b|^\s*(?:Error:\s*)?429(?:\s|$)/i.test(error?.message || String(error || ''));
}

export function faaHttpError(status, text = '', retryAfter = '', now = Date.now()) {
  const denied = status === 403 || /^\s*</.test(text) && /Access\s+Denied/i.test(text);
  const code = denied ? 'FAA_ACCESS_DENIED' : status === 429 ? 'FAA_RATE_LIMITED' : 'FAA_HTTP_ERROR';
  const reference = String(text).match(/Reference\s*#\s*([\w.:-]+)/i)?.[1] || '';
  const retryTime = /^\d+$/.test(String(retryAfter)) ? now + Number(retryAfter) * 1000 : Date.parse(retryAfter);
  const retryAfterAt = Number.isFinite(new Date(retryTime).getTime()) ? new Date(retryTime).toISOString() : null;
  return Object.assign(new Error(`FAA NOTAM HTTP ${status}${denied ? ' / Access Denied' : ''}${reference ? `; Reference #${reference}` : ''}${retryAfterAt ? `; 请在 ${retryAfterAt} 之后重试` : ''}`), { code, httpStatus: status, reference, retryAfterAt });
}

export function validateFaaSearchPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('FAA 查询返回无效数据，已拒绝保存。');
  if (Array.isArray(payload) || payload.totalNotamCount == null || String(payload.totalNotamCount).trim() === '') throw new Error('FAA 查询缺少官方通告总数，无法核验全量结果。');
  if (payload.error && payload.error !== 'false') throw new Error('FAA 查询返回业务错误，未获得完整通告。');
  if (!Array.isArray(payload.notamList) && !(payload.notamList == null && Number(payload.totalNotamCount) === 0)) {
    throw new Error('FAA 查询未返回通告列表，不能把登录页、验证页或错误响应当成空结果。');
  }
  if (payload.totalNotamCount != null && (!Number.isInteger(Number(payload.totalNotamCount)) || Number(payload.totalNotamCount) < 0)) {
    throw new Error('FAA 返回无效的通告总数。');
  }
  return payload;
}

export async function readFaaSearchResponse(response) {
  const text = await response.text();
  if (!response.ok || /^\s*</.test(text) && /Access\s+Denied/i.test(text)) throw faaHttpError(response.status, text, response.headers?.get('retry-after'));
  if (/^\s*</.test(text) || text.includes('redirectToDisclaimer')) throw new Error('FAA 返回网页入口或验证页，需要通过正常浏览器会话查询。');
  try { return validateFaaSearchPayload(JSON.parse(text)); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('FAA 返回的 JSON 不完整，已拒绝保存。');
    throw error;
  }
}

export function faaTransportFailure(attempts, cause) {
  const message = `FAA 本次刷新未完成，已保留上次完整缓存。${attempts.map(a => `${a.transport}: ${a.message}`).join('；')}`;
  return Object.assign(new Error(message), {
    code: cause?.code || (isFaaAccessDenied(cause) ? 'FAA_ACCESS_DENIED' : 'FAA_TRANSPORT_FAILED'),
    httpStatus: cause?.httpStatus || null, retryAfterAt: cause?.retryAfterAt || null,
    transportAttempts: attempts,
  });
}

export async function selectFaaTransport({ mode = 'auto', params, direct, openBrowser, windows }) {
  const attempts = [];
  let lastError;
  const failed = (transport, error) => {
    lastError = error;
    attempts.push({ transport, status: 'failed', message: error.message || String(error), httpStatus: error.httpStatus || null });
    // Rate limits are not an invitation to switch clients and send more traffic.
    if (isFaaRateLimited(error)) throw faaTransportFailure(attempts, error);
  };
  if (mode === 'auto' || mode === 'fetch') {
    try {
      validateFaaSearchPayload(await direct(params));
      return { transport: 'fetch', browserSession: null, browserAttempted: false, attempts: [...attempts, { transport: 'fetch', status: 'ok' }] };
    } catch (error) { failed('fetch', error); }
  }
  if (mode === 'auto' || mode === 'browser') {
    let session;
    try {
      session = await openBrowser();
      validateFaaSearchPayload(await session.fetchForm(params));
      return { transport: 'browser', browserSession: session, browserAttempted: true, attempts: [...attempts, { transport: 'browser', status: 'ok' }] };
    } catch (error) {
      await session?.close().catch(() => {});
      failed('browser', error);
      // A normal browser was refused too. Do not launch hundreds of fallback requests.
      if (isFaaAccessDenied(error)) throw faaTransportFailure(attempts, error);
    }
  }
  if (windows && (mode === 'auto' || mode === 'powershell')) {
    try {
      validateFaaSearchPayload(await windows(params));
      return { transport: 'powershell', browserSession: null, browserAttempted: mode === 'auto', attempts: [...attempts, { transport: 'powershell', status: 'ok' }] };
    } catch (error) { failed('powershell', error); }
  }
  throw faaTransportFailure(attempts, lastError);
}
