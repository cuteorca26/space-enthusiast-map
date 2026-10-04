import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeGpEpochUtc, parseGpEpochUtc } from "./orbital-time.mjs";

const SPACE_TRACK_LOGIN_URL = "https://www.space-track.org/ajaxauth/login";
const SPACE_TRACK_QUERY_ROOT = "https://www.space-track.org/basicspacedata/query";
const CACHE_SCHEMA_VERSION = 2;
const QUERY_WINDOW_DAYS = 2;
const QUERY_BATCH_SIZE = 250;
const QUERY_CONCURRENCY = 3;
const MAX_REQUESTED_IDS = 5000;

export class SatelliteHistoryService {
  constructor(root, dataDirectory = join(root, "data")) {
    this.cacheDirectory = join(dataDirectory, "satellite_history_cache");
  }

  status() {
    return {
      source: "Space-Track GP_HISTORY",
      configured: Boolean(process.env.SPACE_TRACK_IDENTITY && process.env.SPACE_TRACK_PASSWORD),
      cacheDirectory: this.cacheDirectory,
      maximumObjectsPerRequest: MAX_REQUESTED_IDS,
      message: "历史轨道使用 Space-Track GP_HISTORY；已下载根数按 UTC 日期保存在本地，避免重复请求。",
    };
  }

  async getElements({ targetTimeMs, ids, identity = "", password = "" } = {}) {
    const targetMs = Number(targetTimeMs);
    if (!Number.isFinite(targetMs)) throw requestError("invalid_history_time", "历史轨道日期无效", 400);
    if (targetMs > Date.now() + 5 * 60 * 1000) {
      throw requestError("future_elements_unavailable", "未来日期尚不存在可下载的准确历史根数；可继续使用当前根数外推。", 422);
    }
    const requestedIds = [...new Set((ids || []).map((value) => String(value || "").trim()).filter((value) => /^\d{1,9}$/.test(value)))];
    if (!requestedIds.length) throw requestError("history_selection_empty", "请先选择需要回放的卫星", 400);
    if (requestedIds.length > MAX_REQUESTED_IDS) {
      throw requestError(
        "history_selection_too_large",
        `一次历史根数下载最多 ${MAX_REQUESTED_IDS.toLocaleString("zh-CN")} 颗；请先用星座或搜索缩小选择范围。`,
        413,
      );
    }

    const dateKey = utcDateKey(targetMs);
    const cached = this.readCache(dateKey);
    const recordsById = new Map(Object.entries(cached?.recordsById || {}).map(([id, records]) => [id, Array.isArray(records) ? records : []]));
    const missingBeforeFetch = requestedIds.filter((id) => !recordsById.has(id));
    let fetchedIds = [];
    let fromNetwork = false;

    if (missingBeforeFetch.length) {
      const account = String(identity || process.env.SPACE_TRACK_IDENTITY || "").trim();
      const secret = String(password || process.env.SPACE_TRACK_PASSWORD || "");
      if (!account || !secret) {
        throw requestError(
          "space_track_credentials_required",
          `本地缓存缺少 ${missingBeforeFetch.length.toLocaleString("zh-CN")} 颗卫星的 ${dateKey} 历史根数，请填写 Space-Track 账号后重试。`,
          401,
        );
      }
      const cookie = await loginSpaceTrack(account, secret);
      const { startDate, endDate } = queryWindow(targetMs);
      const batches = chunk(missingBeforeFetch, QUERY_BATCH_SIZE);
      const batchResults = await mapConcurrent(batches, QUERY_CONCURRENCY, (batch) => (
        fetchHistoryBatch(cookie, batch, startDate, endDate)
      ));
      for (const rows of batchResults) {
        for (const row of rows) {
          const normalized = normalizeHistoryRecord(row);
          if (!normalized) continue;
          if (!recordsById.has(normalized.id)) recordsById.set(normalized.id, []);
          recordsById.get(normalized.id).push(normalized);
        }
      }
      fetchedIds = missingBeforeFetch.filter((id) => recordsById.has(id));
      fromNetwork = true;
      const savedAt = new Date().toISOString();
      const serializable = {};
      for (const [id, records] of recordsById) {
        serializable[id] = deduplicateRecords(records).sort((a, b) => Date.parse(a.epoch) - Date.parse(b.epoch));
      }
      this.writeCache(dateKey, {
        schemaVersion: CACHE_SCHEMA_VERSION,
        dateKey,
        savedAt,
        queryWindow: { startDate, endDate },
        recordsById: serializable,
      });
    }

    const elements = [];
    const missingIds = [];
    for (const id of requestedIds) {
      const closest = closestRecord(recordsById.get(id), targetMs);
      if (closest) elements.push({
        ...closest,
        targetOffsetSeconds: (Date.parse(closest.epoch) - targetMs) / 1000,
      });
      else missingIds.push(id);
    }
    const epochOffsets = elements.map((item) => Math.abs(Number(item.targetOffsetSeconds) || 0));
    const maximumEpochOffsetSeconds = epochOffsets.length ? Math.max(...epochOffsets) : NaN;
    const exactDayCount = elements.filter((item) => utcDateKey(Date.parse(item.epoch)) === dateKey).length;
    return {
      source: {
        id: "space-track-gp-history",
        name: "Space-Track GP_HISTORY",
        url: "https://www.space-track.org/documentation",
        targetTime: new Date(targetMs).toISOString(),
        dateKey,
        fetchedAt: fromNetwork ? new Date().toISOString() : "",
        cacheHit: !fromNetwork,
        fetchedIds: fetchedIds.length,
        exactDayCount,
        fallbackNearbyCount: elements.length - exactDayCount,
        maximumEpochOffsetSeconds,
        message: `已为 ${elements.length.toLocaleString("zh-CN")} 颗卫星选取最接近目标时刻的历史根数${fromNetwork ? "并写入本地缓存" : "（本地缓存）"}${Number.isFinite(maximumEpochOffsetSeconds) ? `；最大历元差 ${formatOffset(maximumEpochOffsetSeconds)}` : ""}。`,
      },
      targetTimeMs: targetMs,
      requestedCount: requestedIds.length,
      elements,
      missingIds,
    };
  }

  readCache(dateKey) {
    const path = this.cachePath(dateKey);
    if (!existsSync(path)) return null;
    try {
      const value = JSON.parse(readFileSync(path, "utf8"));
      return value?.schemaVersion === CACHE_SCHEMA_VERSION ? value : null;
    } catch {
      return null;
    }
  }

  writeCache(dateKey, value) {
    writeJsonAtomic(this.cachePath(dateKey), value);
  }

  cachePath(dateKey) {
    return join(this.cacheDirectory, `${dateKey}.json`);
  }
}

async function loginSpaceTrack(identity, password) {
  const response = await fetch(SPACE_TRACK_LOGIN_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      "user-agent": "NOTAM-MAP/1.0 historical-orbit-cache",
    },
    body: new URLSearchParams({ identity, password }),
  });
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = cookies.map((value) => String(value).split(";", 1)[0]).filter(Boolean).join("; ");
  const body = await response.text();
  if (response.status >= 400 || !cookie || /invalid|failed|incorrect/i.test(body)) {
    throw requestError("space_track_login_failed", "Space-Track 登录失败，请检查账号、密码及账号状态。", 401);
  }
  return cookie;
}

async function fetchHistoryBatch(cookie, ids, startDate, endDate) {
  const idList = ids.join(",");
  const url = `${SPACE_TRACK_QUERY_ROOT}/class/gp_history/NORAD_CAT_ID/${idList}/EPOCH/${startDate}--${endDate}/orderby/NORAD_CAT_ID%20asc,EPOCH%20asc/format/json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        cookie,
        "user-agent": "NOTAM-MAP/1.0 historical-orbit-cache",
      },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw requestError("space_track_query_failed", `Space-Track 历史根数请求失败（HTTP ${response.status}）`, 502);
    let rows;
    try {
      rows = JSON.parse(body || "[]");
    } catch {
      throw requestError("space_track_invalid_response", "Space-Track 返回了无法解析的数据", 502);
    }
    if (!Array.isArray(rows)) throw requestError("space_track_invalid_response", "Space-Track 历史根数格式不正确", 502);
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHistoryRecord(row) {
  const id = String(row?.NORAD_CAT_ID ?? "").trim();
  const epoch = normalizeGpEpochUtc(row?.EPOCH);
  const epochMs = parseGpEpochUtc(epoch);
  const meanMotion = finiteNumber(row?.MEAN_MOTION);
  const eccentricity = finiteNumber(row?.ECCENTRICITY);
  const inclination = finiteNumber(row?.INCLINATION);
  if (!/^\d{1,9}$/.test(id) || !Number.isFinite(epochMs) || !(meanMotion > 0)
    || !(eccentricity >= 0 && eccentricity < 1) || !Number.isFinite(inclination)) return null;
  const periodMinutes = 1440 / meanMotion;
  const angularRate = meanMotion * Math.PI * 2 / 86400;
  const semiMajorKm = Math.cbrt(398600.4418 / (angularRate * angularRate));
  const perigeeKm = semiMajorKm * (1 - eccentricity) - 6378.137;
  const apogeeKm = semiMajorKm * (1 + eccentricity) - 6378.137;
  return {
    id,
    epoch,
    periodMinutes,
    orbitClass: classifyOrbit(periodMinutes, perigeeKm, apogeeKm, eccentricity),
    omm: {
      OBJECT_NAME: String(row.OBJECT_NAME || `NORAD ${id}`),
      OBJECT_ID: String(row.OBJECT_ID || ""),
      EPOCH: epoch,
      MEAN_MOTION: meanMotion,
      ECCENTRICITY: eccentricity,
      INCLINATION: inclination,
      RA_OF_ASC_NODE: finiteNumber(row.RA_OF_ASC_NODE, 0),
      ARG_OF_PERICENTER: finiteNumber(row.ARG_OF_PERICENTER, 0),
      MEAN_ANOMALY: finiteNumber(row.MEAN_ANOMALY, 0),
      EPHEMERIS_TYPE: finiteNumber(row.EPHEMERIS_TYPE, 0),
      CLASSIFICATION_TYPE: String(row.CLASSIFICATION_TYPE || "U"),
      NORAD_CAT_ID: id,
      ELEMENT_SET_NO: finiteNumber(row.ELEMENT_SET_NO, 0),
      REV_AT_EPOCH: finiteNumber(row.REV_AT_EPOCH, 0),
      BSTAR: finiteNumber(row.BSTAR, 0),
      MEAN_MOTION_DOT: finiteNumber(row.MEAN_MOTION_DOT, 0),
      MEAN_MOTION_DDOT: finiteNumber(row.MEAN_MOTION_DDOT, 0),
    },
  };
}

function classifyOrbit(periodMinutes, perigeeKm, apogeeKm, eccentricity) {
  const meanAltitudeKm = (perigeeKm + apogeeKm) / 2;
  if (periodMinutes >= 1200 && periodMinutes <= 1800 && meanAltitudeKm >= 30000 && meanAltitudeKm <= 45000) return "GEO";
  if (eccentricity >= 0.1 || apogeeKm - perigeeKm >= 10000) return "HEO";
  if (apogeeKm <= 2000) return "LEO";
  if (apogeeKm < 30000 && periodMinutes < 1200) return "MEO";
  return "HEO";
}

function closestRecord(records, targetMs) {
  if (!Array.isArray(records) || !records.length) return null;
  return records.reduce((best, item) => {
    const distance = Math.abs(Date.parse(item.epoch) - targetMs);
    return !best || distance < best.distance ? { item, distance } : best;
  }, null)?.item || null;
}

function deduplicateRecords(records) {
  return [...new Map((records || []).map((item) => [`${item.id}:${item.epoch}`, item])).values()];
}

function queryWindow(targetMs) {
  const dayMs = 86400000;
  return {
    startDate: utcDateKey(targetMs - QUERY_WINDOW_DAYS * dayMs),
    endDate: utcDateKey(targetMs + (QUERY_WINDOW_DAYS + 1) * dayMs),
  };
}

function utcDateKey(timeMs) {
  return new Date(timeMs).toISOString().slice(0, 10);
}

function finiteNumber(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatOffset(seconds) {
  const value = Math.abs(Number(seconds) || 0);
  if (value < 60) return `${Math.round(value)} 秒`;
  if (value < 3600) return `${(value / 60).toFixed(1)} 分钟`;
  return `${(value / 3600).toFixed(value < 36000 ? 1 : 0)} 小时`;
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function mapConcurrent(values, concurrency, task) {
  const results = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(values[index], index);
    }
  }));
  return results;
}

function requestError(code, message, status = 500) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), "utf8");
  try {
    renameSync(temporary, filePath);
  } catch (error) {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
      renameSync(temporary, filePath);
    } catch {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
  }
}
