export const FAA_ACCESS_HELP_URL = 'https://www.faa.gov/about/initiatives/notam';

export function isFaaAccessDenied(error) {
  return error?.code === 'FAA_ACCESS_DENIED' || /\b403\b|Access\s+Denied/i.test(error instanceof Error ? error.message : String(error || ''));
}

export function faaResponseError(response, body = '', now = Date.now()) {
  const denied = response.status === 403 || /^\s*</.test(body) && /Access\s+Denied/i.test(body);
  if (response.ok && !denied) return null;
  const limited = response.status === 429;
  const error = new Error(denied
    ? 'FAA 当前拒绝访问（HTTP 403 / Access Denied），本次采集停止并保留上次完整缓存。持续被拒绝时需申请 FAA 正式 NOTAM API 访问权限。'
    : limited ? 'FAA 请求限流（HTTP 429），本次采集暂缓。'
      : `FAA NOTAM Search HTTP ${response.status}`);
  error.code = denied ? 'FAA_ACCESS_DENIED' : limited ? 'FAA_RATE_LIMITED' : 'FAA_HTTP_ERROR';
  error.httpStatus = response.status;
  // Keep only a support reference, never the response page or request headers.
  const reference = body.match(/Reference\s*(?:#|&#35;)\s*([a-zA-Z0-9._-]{1,180})/i)?.[1];
  if (reference) error.reference = reference;
  const after = response.headers?.get('retry-after');
  const retryAt = after && (/^\d+$/.test(after) ? now + Number(after) * 1000 : Date.parse(after));
  if (Number.isFinite(retryAt) && retryAt > now) error.retryAfterAt = new Date(retryAt).toISOString();
  return error;
}

export function faaFailureDetails(error) {
  const denied = isFaaAccessDenied(error);
  return { code: error?.code || (denied ? 'FAA_ACCESS_DENIED' : 'FAA_COLLECTION_FAILED'),
    httpStatus: error?.httpStatus || (denied ? 403 : null),
    reference: error?.reference || null, retryAfterAt: error?.retryAfterAt || null,
    accessHelpUrl: denied ? FAA_ACCESS_HELP_URL : null };
}
