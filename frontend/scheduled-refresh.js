(() => {
  if (!window.APP_DEPLOYMENT?.online) return;
  let imported = '', pending = false;
  async function update() {
    if (pending || document.hidden) return;
    pending = true;
    try {
      const response = await fetch('/api/scheduled-refresh', { cache: 'no-store' });
      if (!response.ok) throw new Error('status unavailable');
      const status = await response.json();
      const text = document.getElementById('scheduledRefreshStatus');
      if (text) text.textContent = status.enabled
        ? `${status.schedule}自动全量刷新 NOTAM、NAVAREA、HYDROPAC。${status.active ? '正在同步新历史。' : status.error ? '本次同步未成功，稍后自动重试。' : status.lastRunAt ? `最近同步批次：${new Date(status.lastRunAt).toLocaleString()}。` : '等待首次刷新完成。'}左侧“刷新历史”可调阅；删除需管理员登录。`
        : '自动刷新尚未启用。';
      if (status.lastImportedAt && status.lastImportedAt !== imported) {
        imported = status.lastImportedAt;
        window.dispatchEvent(new Event('scheduled-data-change'));
      }
    } catch { /* The last saved map and history remain usable during a cold start. */ }
    finally { pending = false; }
  }
  window.addEventListener('DOMContentLoaded', update);
  document.addEventListener('visibilitychange', update);
  setInterval(update, 60000);
})();
