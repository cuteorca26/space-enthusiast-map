import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function requiresAdministrator(method, url) {
  return url.pathname.startsWith('/api/') && (
    url.searchParams.get('refresh') === '1' ||
    (url.pathname.startsWith('/api/refresh-history') && !['GET', 'HEAD'].includes(method))
  );
}

export function createAdminAccess({ enabled = false, secretHash = '', now = Date.now } = {}) {
  const expected = /^[a-f0-9]{64}$/i.test(secretHash) ? Buffer.from(secretHash, 'hex') : null;
  const sessions = new Map();
  const attempts = new Map();
  const sessionMs = 8 * 60 * 60 * 1000;
  function token(req) { return /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1] || ''; }
  function authenticated(req) {
    if (!enabled) return true;
    const value = token(req);
    const expires = sessions.get(value) || 0;
    if (expires <= now()) { sessions.delete(value); return false; }
    return true;
  }
  function state(req) { return { required: enabled, configured: Boolean(expected), administrator: authenticated(req) }; }
  function reject(req, res, sendJson) {
    if (authenticated(req)) return false;
    res.setHeader('cache-control', 'no-store');
    sendJson(res, 401, { error: 'administrator_required', message: '此操作仅限管理员，请先在“数据更新”中登录。' });
    return true;
  }
  async function handle(req, res, url, { sendJson, storageStatus = () => ({}) }) {
    if (!url.pathname.startsWith('/api/admin/')) return false;
    res.setHeader('cache-control', 'no-store');
    if (req.method === 'GET' && url.pathname === '/api/admin/status') {
      sendJson(res, 200, { ...state(req), storage: storageStatus() }); return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      sessions.delete(token(req)); sendJson(res, 200, { administrator: false }); return true;
    }
    if (req.method !== 'POST' || url.pathname !== '/api/admin/login') {
      sendJson(res, 404, { error: 'not_found' }); return true;
    }
    if (!enabled || !expected) {
      sendJson(res, 503, { error: 'administrator_unconfigured', message: '管理员登录尚未配置，公共刷新已锁定。' }); return true;
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
      sendJson(res, 415, { error: 'json_required' }); return true;
    }
    // Render provides the connecting client in the first forwarded address.
    const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    for (const [key, value] of attempts) if (value.until <= now()) attempts.delete(key);
    const entry = attempts.get(address) || { count: 0, until: now() + 15 * 60 * 1000 };
    if (entry.count >= 8 || (!attempts.has(address) && attempts.size >= 1000)) {
      res.setHeader('retry-after', '900'); sendJson(res, 429, { error: 'login_rate_limited', message: '登录尝试过多，请稍后再试。' }); return true;
    }
    entry.count++; attempts.set(address, entry);
    let text = '';
    for await (const chunk of req) {
      text += chunk.toString('utf8');
      if (Buffer.byteLength(text) > 4096) { sendJson(res, 413, { error: 'login_request_too_large' }); return true; }
    }
    let input;
    try { input = JSON.parse(text); } catch { sendJson(res, 400, { error: 'invalid_json' }); return true; }
    const secret = typeof input?.secret === 'string' ? input.secret : '';
    const actual = createHash('sha256').update(secret).digest();
    if (!secret || !timingSafeEqual(expected, actual)) {
      sendJson(res, 401, { error: 'invalid_admin_secret', message: '管理员口令不正确。' }); return true;
    }
    attempts.delete(address);
    for (const [key, expires] of sessions) if (expires <= now()) sessions.delete(key);
    if (sessions.size >= 64) sessions.delete(sessions.keys().next().value);
    const value = randomBytes(32).toString('hex');
    const expiresAt = now() + sessionMs;
    sessions.set(value, expiresAt);
    sendJson(res, 200, { administrator: true, token: value, expiresAt }); return true;
  }
  return { enabled, state, authenticated, reject, handle };
}
