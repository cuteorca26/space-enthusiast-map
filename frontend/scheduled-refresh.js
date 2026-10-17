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
      const labels = { notam: 'NOTAM', hydropac: 'HYDROPAC', navarea: 'NAVAREA' };
      const missing = status.lastRunAt ? status.sources.filter(source => !status.lastSources.includes(source)) : [];
      const reasons = (status.lastResults || []).filter(row => row.status === 'failed').map(row => {
        if (/403|拒绝访问/.test(row.message || '')) return `${labels[row.source]} 来源拒绝自动访问。`;
        if (row.coverageWarnings?.length) return `${labels[row.source]} 未完整获取：${row.coverageWarnings.map(item => item.region).join('、')}。`;
        return '';
      }).join('');
      if (text) text.textContent = status.enabled
        ? `${status.schedule}自动全量刷新 NOTAM、NAVAREA、HYDROPAC。${status.active ? '正在同步新历史。' : status.error ? '本次同步未成功，稍后自动重试。' : status.lastRunAt ? `最近同步批次：${new Date(status.lastRunAt).toLocaleString()}。` : '等待首次刷新完成。'}${missing.length ? `${missing.map(source => labels[source]).join('、')} 本批次未完成，保留此前的数据。` : ''}左侧“刷新历史”可调阅；删除需管理员登录。`
        : '自动刷新尚未启用。';
      if (text && reasons) text.textContent += reasons;
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
