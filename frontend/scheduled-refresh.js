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
      const labels = { notam: 'NOTAM', hydropac: 'HYDROPAC', navarea: 'NAVAREA', msa: '中国航警' };
      const lines = (status.sources || []).map(source => {
        const row = (status.lastResults || []).find(item => item.source === source);
        const label = labels[source] || source;
        if (!row) return `${label}：等待本轮结果。`;
        if (row.status === 'success') return `${label}：已保存${Number.isFinite(row.total) ? ` ${row.total} 条` : ''}${Number.isFinite(row.drawable) ? `，可绘制 ${row.drawable} 条` : ''}。`;
        let line = `${label}：${row.attempt ? `第 ${row.attempt}/3 次采集失败` : '本轮采集未完成'}，保留以前的数据。`;
        if (row.retryExhausted) line += '两次重试均失败，本轮已停止，等待下一次每日更新。';
        else if (row.nextRetryAt) line += Date.parse(row.nextRetryAt) > Date.now()
          ? `下次重试：${new Date(row.nextRetryAt).toLocaleString()}。`
          : '已到重试时间，等待新的采集结果。';
        if (row.code === 'FAA_ACCESS_DENIED' || /403|拒绝访问/.test(row.message || '')) line += '来源拒绝访问；持续出现时需取得正式接口授权。';
        else if (row.coverageWarnings?.length) line += `未完整获取：${row.coverageWarnings.map(item => item.region || item.bureau || '部分区域').join('、')}。`;
        return line;
      });
      if (text) {
        text.style.whiteSpace = 'pre-line';
        text.textContent = status.enabled
          ? `${status.schedule}全量更新 NOTAM、NAVAREA、HYDROPAC、中国航警。失败后每隔 1 小时重试，最多再试 2 次。\n${status.active ? '正在同步新历史。\n' : status.error ? '网站同步暂未成功，已保存的数据仍可调阅。\n' : ''}${status.cycleStartedAt ? `本轮开始：${new Date(status.cycleStartedAt).toLocaleString()}。\n` : ''}${lines.join('\n')}\n左侧“刷新历史”可调阅；删除需管理员登录。`
          : '自动刷新尚未启用。';
      }
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
