// Keep source text searchable even when a safe boundary cannot be constructed.
function navareaCoverageSummary(source) {
  if (!source?.partialRefresh) return null;
  const failed = [...new Set((source.coverageWarnings || []).map(row => row.region))];
  const total = source.requestedRegions?.length || source.regions?.length || 21;
  return {
    short: `部分加载（${Math.max(0, total - failed.length)}/${total} 区）`,
    detail: `已请求 ${total} 个海区，${failed.join('、') || '部分海区'} 获取不完整；其他海区已更新。失败海区有旧记录时会保留，并标明来自上次刷新。`,
  };
}
function marineDisplayRecords(payload, source) {
  const type = source === 'hydropac' ? 'HYDROPAC' : source === 'msa' ? '中国航警' : 'NAVAREA';
  const seen = new Set();
  return [...(payload?.restrictions || []), ...(payload?.skipped || []).map(item => ({
    ...item, type, sourceKind: source, category: type,
    notamId: item.notamId || item.warningId,
    notamKey: item.notamKey || item.warningId,
    geometry: null, hasGeometry: false,
    geometryReason: item.geometryReason || item.reason || '原文未提供可可靠绘制的边界',
  }))].filter(item => {
    const key = item.id || `${item.notamId}:${item.rawText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
