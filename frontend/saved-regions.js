(function attachSavedRegions(root) {
  "use strict";

  function sourceOf(item) {
    if (item?.sourceKind === "msa" || item?.category === "中国航警" || item?.type === "中国航警") return "msa";
    for (const source of ["hydropac", "navarea"]) {
      if (item?.sourceKind === source || String(item?.type).toLowerCase() === source || String(item?.category).toLowerCase() === source) return source;
    }
    return "notam";
  }

  function isoDate(...values) {
    const value = values.find((value) => value && Number.isFinite(Date.parse(value)));
    return value ? new Date(value).toISOString() : null;
  }

  function provenance(item, payload = {}) {
    const source = sourceOf(item);
    const meta = source === "notam" ? payload.sources?.faaNotamSearch || payload.source || {} : payload.source || {};
    return { source,
      refreshedAt: isoDate(payload.refreshCompletedAt, payload.cacheSavedAt, meta.cacheSavedAt, meta.fetchedAt, payload.faaNotamFetchedAt, payload.generatedAt),
      referenceTime: isoDate(payload.temporalReferenceTime, payload.temporalFilter?.referenceTime, meta.temporalReferenceTime),
      dataVersion: String(payload.dataVersion || ""), historyDate: String(payload.historyDate || "") };
  }

  function snapshot(item) {
    // Derived render caches are rebuilt on restore; source text, rings and times are immutable.
    const { archiveProvenance, savedRegion, searchText, bounds, renderKey, hitArea, timeWindow, timeWindowKey,
      timeTextKey, countryFilterKey, countryFilterLabel, countryFilterSection, color, rawCategory, ...original } = item;
    return JSON.parse(JSON.stringify({ ...(archiveProvenance || provenance(item)), item: original }));
  }

  function toggleSelection(previous, id, additive) {
    const next = additive ? new Set(previous) : new Set();
    if (additive ? previous.has(id) : previous.size === 1 && previous.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function createController({ getHighlighted, onRestore, enrich, escapeHtml }) {
    const list = document.getElementById("savedRegionList");
    const count = document.getElementById("savedRegionCount");
    const status = document.getElementById("savedRegionStatus");
    const saveButton = document.getElementById("saveHighlightedRegionsButton");
    const saveCount = document.getElementById("saveHighlightedRegionsCount");
    const clearButton = document.getElementById("clearSavedRegionSelectionButton");
    let records = [];
    let selected = new Set();
    let applied = new Set();
    let generation = 0;
    let saving = false;
    let statusMessage = { value: "", error: false, detail: "" };
    const cache = new Map();
    const pending = new Map();
    const tr = (value) => root.AppI18n?.t(value) || value;
    const text = (value) => escapeHtml(tr(value));
    const date = (value) => value ? new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false }) : tr("刷新时间未知");
    const sourceLabel = (value) => value === "msa" ? tr("中国航警") : String(value).toUpperCase();
    const highlighted = () => getHighlighted().filter((item) => !item.savedRegion && item.hasGeometry && ["Polygon", "MultiPolygon"].includes(item.geometry?.type));
    const renderStatus = () => {
      status.textContent = tr(statusMessage.value) + (statusMessage.detail ? `: ${statusMessage.detail}` : "");
      status.classList.toggle("error", statusMessage.error);
    };
    const message = (value, error = false, detail = "") => { statusMessage = { value, error, detail }; renderStatus(); };
    const request = async (url, options) => {
      if (root.APP_DEPLOYMENT?.online) return root.BrowserSavedRegions.request(url, options);
      const response = await fetch(url, { cache: "no-store", ...options });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      return payload;
    };

    function updateSaveButton() {
      const size = highlighted().length;
      saveButton.disabled = saving || !size;
      saveButton.setAttribute("aria-busy", String(saving));
      saveCount.textContent = String(size);
    }

    function render() {
      renderStatus();
      count.textContent = `${selected.size} / ${records.length}`;
      clearButton.disabled = !selected.size;
      list.innerHTML = records.length ? records.map((record) => `
        <div class="saved-region-entry" data-saved-region-row="${escapeHtml(record.id)}">
          <button type="button" class="saved-region-select ${selected.has(record.id) ? "active" : ""}" data-saved-region-id="${escapeHtml(record.id)}" aria-pressed="${selected.has(record.id)}" title="${text("单击单选；Shift 单击多选或取消")}">
            <strong><span>${escapeHtml(sourceLabel(record.source))}</span> <span data-i18n-static>${escapeHtml(record.label)}</span></strong>
            <span><span>${text("数据刷新（北京时间）")}</span><time data-i18n-static>${escapeHtml(date(record.refreshedAt))}</time></span>
            <span><span>${text("保存时间（北京时间）")}</span><time data-i18n-static>${escapeHtml(date(record.savedAt))}</time></span>
          </button>
          <button class="saved-region-delete" type="button" data-saved-region-delete="${escapeHtml(record.id)}" title="${text("删除这条已保存区域")}" aria-label="${text("删除这条已保存区域")}">×</button>
          <details class="saved-region-details"><summary>${text("区域详情")}</summary>
            <span data-i18n-static>${escapeHtml(record.title)}</span>
            <span data-i18n-static>${escapeHtml(record.region)}</span>
            <span>${text("多边形 / 顶点")} <span data-i18n-static>${record.polygonCount} / ${record.vertexCount}</span></span>
            <span>${text("数据版本")} <span data-i18n-static>${escapeHtml(record.dataVersion || "--")}</span></span>
            ${record.referenceTime ? `<span>${text("回放基准（北京时间）")} <time data-i18n-static>${escapeHtml(date(record.referenceTime))}</time></span>` : ""}
            ${record.historyDate ? `<span>${text("历史日期")} <span data-i18n-static>${escapeHtml(record.historyDate)}</span></span>` : ""}
          </details>
        </div>`).join("") : `<p class="empty-text">${text("尚未保存区域")}</p>`;
      updateSaveButton();
    }

    function getRecord(id) {
      if (cache.has(id)) return Promise.resolve(cache.get(id));
      if (!pending.has(id)) pending.set(id, request(`/api/saved-regions/item?id=${encodeURIComponent(id)}`).then((record) => {
        const item = enrich({ ...record.item, id: `saved-region:${record.id}`, hasGeometry: true,
          archiveProvenance: { source: record.source, refreshedAt: record.refreshedAt, referenceTime: record.referenceTime, dataVersion: record.dataVersion, historyDate: record.historyDate },
          savedRegion: { ...record, item: undefined } });
        if (!item.hasGeometry) throw new Error(tr("保存的区域未通过绘制校验"));
        cache.set(id, item);
        return item;
      }).finally(() => pending.delete(id)));
      return pending.get(id);
    }

    async function restore(focus = true) {
      const version = ++generation;
      const ids = [...selected];
      render();
      if (ids.length) message("正在恢复保存的区域");
      try {
        const items = await Promise.all(ids.map(getRecord));
        if (version !== generation) return;
        applied = new Set(ids);
        onRestore(items, focus);
        message(ids.length ? "已恢复保存的区域" : "已取消保存区域的显示");
      } catch (error) {
        if (version !== generation) return;
        selected = new Set(applied);
        message("恢复失败", true, error.message);
      }
      if (version === generation) render();
    }

    async function load() {
      try {
        const payload = await request("/api/saved-regions");
        records = payload.records;
        selected = new Set([...selected].filter((id) => records.some((record) => record.id === id)));
        message("");
        if (applied.size || selected.size) await restore(false);
        else render();
      } catch (error) { message("读取失败", true, error.message); }
    }

    saveButton.addEventListener("click", async () => {
      if (saving) return;
      const entries = highlighted().map(snapshot);
      if (!entries.length) return;
      saving = true;
      updateSaveButton();
      message("正在保存高亮区域");
      try {
        const result = await request("/api/saved-regions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries }) });
        records = result.records;
        message(result.added ? "高亮区域已保存到本地" : "这些区域的当前版本已经保存");
        render();
      } catch (error) { message("保存失败", true, error.message); }
      finally { saving = false; updateSaveButton(); }
    });

    list.addEventListener("click", async (event) => {
      const remove = event.target.closest("[data-saved-region-delete]");
      if (remove) {
        event.stopPropagation();
        const id = remove.dataset.savedRegionDelete;
        if (remove.dataset.confirm !== "1") {
          remove.dataset.confirm = "1";
          remove.textContent = tr("确认");
          remove.classList.add("armed");
          setTimeout(() => { if (remove.isConnected && !remove.disabled) { remove.dataset.confirm = ""; remove.textContent = "×"; remove.classList.remove("armed"); } }, 3500);
          return;
        }
        remove.disabled = true;
        try {
          const result = await request(`/api/saved-regions/item?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          records = result.records;
          cache.delete(id);
          const wasSelected = selected.delete(id);
          applied.delete(id);
          if (wasSelected) await restore(false);
          render();
          message("已删除指定保存区域");
        } catch (error) { remove.disabled = false; message("删除失败", true, error.message); }
        return;
      }
      const button = event.target.closest("[data-saved-region-id]");
      if (!button) return;
      selected = toggleSelection(selected, button.dataset.savedRegionId, event.shiftKey);
      await restore();
    });
    clearButton.addEventListener("click", () => { selected = new Set(); restore(false); });
    document.getElementById("reloadSavedRegionsButton").addEventListener("click", load);
    root.addEventListener("app-language-change", render);
    render();
    return { load, updateSaveButton };
  }

  const api = { sourceOf, provenance, snapshot, toggleSelection, createController };
  root.SavedRegions = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
