(() => {
  const online = Boolean(window.APP_DEPLOYMENT?.online);
  const storageKey = 'space-map-admin-session';
  const nativeFetch = window.fetch.bind(window);
  let token = '';
  try { token = sessionStorage.getItem(storageKey) || ''; } catch {}
  let administrator = !online;
  let configured = false;
  function protectedRequest(input, init = {}) {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      const method = String(init.method || input?.method || 'GET').toUpperCase();
      return url.origin === location.origin && url.pathname.startsWith('/api/') &&
        (url.pathname.startsWith('/api/admin/') || url.searchParams.get('refresh') === '1' ||
          (url.pathname.startsWith('/api/refresh-history') && !['GET', 'HEAD'].includes(method)));
    } catch { return false; }
  }
  // Authorization stays confined to this origin and is never placed in a URL.
  window.fetch = async (input, init = {}) => {
    if (!online || !protectedRequest(input, init)) return nativeFetch(input, init);
    const headers = new Headers(init.headers || input?.headers);
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401 && administrator) { setSession(''); render(); }
    return response;
  };
  function setSession(value) {
    token = value; administrator = Boolean(value) || !online;
    try { value ? sessionStorage.setItem(storageKey, value) : sessionStorage.removeItem(storageKey); } catch {}
    window.dispatchEvent(new Event('administrator-change'));
  }
  function render(storage) {
    const panel = document.getElementById('administratorPanel');
    if (!panel) return;
    panel.hidden = !online;
    const status = document.getElementById('administratorStatus');
    status.textContent = administrator ? '管理员已登录' : '访客模式：公共刷新和历史删除仅限管理员';
    document.getElementById('administratorLoginForm').hidden = administrator;
    document.getElementById('administratorLogout').hidden = !administrator;
    const fields = panel.querySelectorAll('input, button[type="submit"]');
    fields.forEach(element => { element.disabled = !configured; });
    document.querySelectorAll('[data-admin-action]').forEach(element => {
      element.hidden = online && !administrator;
    });
    const persistence = document.getElementById('serverStorageStatus');
    if (storage && persistence) persistence.textContent = storage.message || '';
  }
  async function status() {
    try {
      const response = await fetch('/api/admin/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('无法读取管理员状态');
      const value = await response.json();
      configured = value.configured; administrator = value.administrator;
      if (!administrator && token) setSession('');
      render(value.storage);
    } catch { administrator = false; render(); }
  }
  const panel = document.getElementById('administratorPanel');
  panel?.querySelector('form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('administratorSecret');
    const message = document.getElementById('administratorMessage');
    message.textContent = '正在登录…';
    const secret = input.value; input.value = '';
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || '登录失败');
      setSession(value.token); message.textContent = '登录成功。本页登录有效期为八小时，服务器重启后需重新登录。';
      await status();
    } catch (error) { message.textContent = error.message; }
  });
  document.getElementById('administratorLogout')?.addEventListener('click', async () => {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } finally { setSession(''); render(); }
  });
  window.MapAdministrator = { canManage: () => !online || administrator, status, render };
  if (online) { render(); status(); window.setInterval(status, 60000); }
})();
