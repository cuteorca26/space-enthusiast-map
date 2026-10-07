// Keep source text searchable even when a safe boundary cannot be constructed.
function marineDisplayRecords(payload, source) {
  const type = source === 'hydropac' ? 'HYDROPAC' : 'NAVAREA';
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
