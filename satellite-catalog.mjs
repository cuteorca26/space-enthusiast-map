import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  BULK_TLE_ZIP_URL,
  MCCANTS_CLASSIFIED_TLE_ZIP_URL,
  fetchAllSatelliteTles,
  fetchClassifiedSatelliteTles,
  parseSatcatCsv,
  tleRecordToOmm,
} from "./satellite-inactive-catalog.mjs";
import { normalizeGpEpochUtc, parseGpEpochUtc } from "./orbital-time.mjs";
import satelliteIdentities from "./frontend/satellite-identities.js";

const CELESTRAK_ACTIVE_OMM_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON";
const CELESTRAK_RECENT_OMM_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=LAST-30-DAYS&FORMAT=JSON";
const CELESTRAK_SATCAT_CSV_URL = "https://celestrak.org/pub/satcat.csv";
const EARTH_MU_KM3_S2 = 398600.4418;
const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
const MIN_ACCEPTED_RECORDS = 1000;
const MIN_BULK_ACCEPTED_RECORDS = 20000;
const CACHE_SCHEMA_VERSION = 7;
const CLASSIFIED_ACTIVE_MAX_AGE_MS = 120 * 86400000;
const PUBLIC_CLASSIFIED_NAME_ALIASES = new Map([
  ["39232", "USA 245 · CRYSTAL/KH-11（公开归属）"],
  ["43941", "USA 290 · CRYSTAL 5F1?（公开归属）"],
  ["48247", "USA 314 · CRYSTAL Block 5 F2（公开归属）"],
  ["48846", "USA 316 · NROL-111 A（任务未知）"],
  ["48847", "USA 317 · NROL-111 B（任务未知）"],
  ["48848", "USA 318 · NROL-111 C（任务未知）"],
  ["51445", "USA 326 · CRYSTAL Block 5?（公开归属）"],
  ["52259", "USA 327 · INTRUDER?（公开归属）"],
  ["53883", "USA 338 · Improved CRYSTAL?（公开归属）"],
  ["63350", "USA 498 · INTRUDER 18?（公开归属）"],
  ["66992", "USA 570 · INTRUDER 19?（公开归属）"],
]);
const PUBLIC_NRO_NORAD_IDS = new Set([
  "23893", "25019", "26575", "27691", "27875",
  ...PUBLIC_CLASSIFIED_NAME_ALIASES.keys(),
]);
const execFileAsync = promisify(execFile);

function isPublicNroAttribution(id, name) {
  if (PUBLIC_NRO_NORAD_IDS.has(String(id || ""))) return true;
  return /(?:\bNOSS\b|\bFIA RADAR\b|\bMENTOR\b|ADVANCED ORION|\bORION\b|KH-11|\bCRYSTAL\b|\bTRUMPET\b|\bINTRUDER\b|\bSTARSH(?:IELD)?\b)/i.test(String(name || ""));
}

export class SatelliteCatalogService {
  constructor(root, dataDirectory = join(root, "data")) {
    this.cacheFile = join(dataDirectory, "satellite_catalog_cache.json");
    this.inFlight = null;
    this.memory = null;
  }

  async getCatalog({ refresh = false } = {}) {
    const cached = this.memory || this.readCache();
    if (!refresh) {
      if (cached) {
        const savedAt = cached.cacheSavedAt || cached.source?.fetchedAt || "";
        return {
          ...cached,
          source: {
            ...cached.source,
            cacheOnly: true,
            refreshSkipped: false,
            message: `已加载最近一次卫星轨道本地缓存（${savedAt || "保存时间未知"}）；仅在点击“刷新卫星轨道”后联网。`,
          },
        };
      }
      return emptyCatalog("尚无卫星轨道目录缓存，请点击“刷新卫星轨道”从 CelesTrak 获取。", true);
    }

    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchAndPersist(cached).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  readCache() {
    if (!existsSync(this.cacheFile)) return null;
    try {
      const wrapped = JSON.parse(readFileSync(this.cacheFile, "utf8"));
      const payload = normalizeCachedCatalogEpochs(wrapped?.data || wrapped);
      if (!Array.isArray(payload?.satellites) || !payload.satellites.length) return null;
      this.memory = payload;
      return payload;
    } catch {
      return null;
    }
  }

  async fetchAndPersist(stale) {
    try {
      const [activeResult, recentResult, satcatResult, bulkResult, classifiedResult] = await Promise.allSettled([
        fetchSource(CELESTRAK_ACTIVE_OMM_URL, { accept: "application/json", responseType: "json", timeoutMs: 600000 }),
        fetchSource(CELESTRAK_RECENT_OMM_URL, { accept: "application/json", responseType: "json", timeoutMs: 90000 }),
        fetchSource(CELESTRAK_SATCAT_CSV_URL, { accept: "text/plain, */*", responseType: "text", timeoutMs: 600000 }),
        fetchAllSatelliteTles(),
        fetchClassifiedSatelliteTles(),
      ]);

      const satcatRecords = satcatResult.status === "fulfilled" ? parseSatcatCsv(satcatResult.value) : [];
      if (satcatResult.status === "fulfilled" && satcatRecords.length < 10000) {
        throw new Error(`全量 SATCAT 返回不完整（${satcatRecords.length} 条）`);
      }
      const satcatById = new Map(satcatRecords.map((record) => [String(record.NORAD_CAT_ID || ""), record]));
      for (const item of stale?.satellites || []) {
        const id = String(item?.id || item?.noradId || "");
        if (id && !satcatById.has(id)) satcatById.set(id, cachedSatelliteToSatcat(item));
      }

      const bulkCatalog = bulkResult.status === "fulfilled" ? bulkResult.value : null;
      const hasCompleteBulk = Number(bulkCatalog?.sourceTotal || 0) >= MIN_BULK_ACCEPTED_RECORDS;
      if (!hasCompleteBulk && !(stale?.satellites?.length >= MIN_ACCEPTED_RECORDS)) {
        if (bulkResult.status === "rejected") throw bulkResult.reason;
        throw new Error(`全量轨道根数返回不完整（${Number(bulkCatalog?.sourceTotal || 0)} 条）`);
      }

      const elementById = new Map();
      const activeIds = new Set();
      const analystNamesById = new Map();
      const addElement = (omm, elementSource, sourcePriority = 0) => {
        const id = String(omm?.NORAD_CAT_ID ?? "").trim();
        const epochMs = parseGpEpochUtc(omm?.EPOCH);
        if (!id || !Number.isFinite(epochMs)) return;
        const existing = elementById.get(id);
        const existingEpochMs = parseGpEpochUtc(existing?.omm?.EPOCH);
        if (!existing || epochMs > existingEpochMs || (epochMs === existingEpochMs && sourcePriority > existing.sourcePriority)) {
          elementById.set(id, { omm, elementSource, sourcePriority });
        }
      };

      for (const item of stale?.satellites || []) {
        if (item?.omm) addElement(item.omm, item.elementSource || "本地完整目录缓存", 0);
      }
      if (hasCompleteBulk) {
        for (const [id, tle] of bulkCatalog.records.entries()) {
          const satcat = satcatById.get(id);
          if (!isCurrentEarthOrbit(satcat)) continue;
          const omm = tleRecordToOmm(tle, satcat);
          if (omm) addElement(omm, String(tle?.tle_source || "TLE.info / IDB ALL_TLE mirror"), 1);
        }
      }

      const classifiedCatalog = classifiedResult.status === "fulfilled" ? classifiedResult.value : null;
      for (const [id, tle] of classifiedCatalog?.records || []) {
        const omm = tleRecordToOmm(tle, satcatById.get(id));
        if (!omm) continue;
        const analystName = PUBLIC_CLASSIFIED_NAME_ALIASES.get(id) || String(tle?.name || "").trim();
        if (analystName) analystNamesById.set(id, analystName);
        addElement(omm, String(tle?.tle_source || "Satobs / McCants public-observer classified TLE"), 2.5);
        const ageMs = Date.now() - parseGpEpochUtc(omm.EPOCH);
        if (Number.isFinite(ageMs) && ageMs >= -86400000 && ageMs <= CLASSIFIED_ACTIVE_MAX_AGE_MS
          && !/\b(?:DEB|DEBRIS|R\/B)\b|(?:^|\s)R$/i.test(analystName)) {
          activeIds.add(id);
        }
      }

      const recentOmm = recentResult.status === "fulfilled" && Array.isArray(recentResult.value) ? recentResult.value : [];
      for (const omm of recentOmm) addElement(omm, "CelesTrak GP / LAST-30-DAYS OMM", 2);
      const activeOmm = activeResult.status === "fulfilled" && Array.isArray(activeResult.value) ? activeResult.value : [];
      for (const omm of activeOmm) {
        const id = String(omm?.NORAD_CAT_ID ?? "").trim();
        if (id) activeIds.add(id);
        addElement(omm, "CelesTrak GP / ACTIVE OMM", 3);
      }

      const satellites = [];
      for (const [id, element] of elementById.entries()) {
        const satcat = satcatById.get(id);
        if (!isCurrentEarthOrbit(satcat)) continue;
        const preferredName = analystNamesById.get(id);
        const publicAttribution = isPublicNroAttribution(id, preferredName);
      const normalized = normalizeSatellite(element.omm, {
          satcat,
          forceActive: activeIds.has(id),
          elementSource: element.elementSource,
          preferredName,
          owner: publicAttribution ? "US" : "",
          publicAttribution,
        });
        if (normalized) satellites.push(normalized);
      }
      satellites.sort(compareSatellites);
      const counts = countOrbitClasses(satellites, {
        bulkSourceTotal: Number(bulkCatalog?.sourceTotal || 0),
        satcatSourceTotal: satcatRecords.length,
        activeSourceTotal: activeOmm.length,
        recentSourceTotal: recentOmm.length,
        classifiedSourceTotal: Number(classifiedCatalog?.sourceTotal || 0),
      });
      const minimumExpected = stale?.satellites?.length
        ? Math.max(MIN_ACCEPTED_RECORDS, Math.floor(stale.satellites.length * 0.9))
        : MIN_ACCEPTED_RECORDS;
      if (satellites.length < minimumExpected) {
        throw new Error(`全在轨目录归并后记录不足（${satellites.length}/${minimumExpected}）`);
      }

      const savedAt = new Date().toISOString();
      const newestEpoch = satellites.reduce((latest, item) => item.epoch > latest ? item.epoch : latest, "");
      const optionalErrors = [
        sourceError("ACTIVE OMM", activeResult),
        sourceError("LAST-30-DAYS OMM", recentResult),
        sourceError("SATCAT", satcatResult),
        sourceError("ALL_TLE", bulkResult),
        sourceError("CLASSFD", classifiedResult),
      ].filter(Boolean);
      const payload = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        dataVersion: `public-on-orbit-catalog:${savedAt}:${satellites.length}`,
        generatedAt: savedAt,
        cacheSavedAt: savedAt,
        counts,
        satellites,
        source: {
          id: "celestrak-satcat-all-on-orbit",
          name: "CelesTrak OMM + SATCAT + 全量公开/公开观测在轨根数",
          url: CELESTRAK_ACTIVE_OMM_URL,
          recentUrl: CELESTRAK_RECENT_OMM_URL,
          satcatUrl: CELESTRAK_SATCAT_CSV_URL,
          elementsUrl: BULK_TLE_ZIP_URL,
          classifiedElementsUrl: MCCANTS_CLASSIFIED_TLE_ZIP_URL,
          format: "CCSDS OMM JSON + TLE",
          propagator: "SGP4/SDP4",
          fetchedAt: savedAt,
          newestElementEpoch: newestEpoch,
          refreshCompleted: true,
          refreshSkipped: false,
          cacheFallback: !hasCompleteBulk,
          fetchConcurrency: 5,
          optionalErrors,
          catalogScope: "公开可获得当前 GP/OMM/TLE 的地球在轨对象；保密目标采用公开天文观测轨道并与官方目录分层标注",
          message: `已保存全在轨目录 ${counts.included.toLocaleString("zh-CN")} 个对象：在役载荷 ${counts.ACTIVE_PAYLOAD.toLocaleString("zh-CN")}、退役载荷 ${counts.RETIRED_PAYLOAD.toLocaleString("zh-CN")}、火箭体 ${counts.ROCKET_BODY.toLocaleString("zh-CN")}、残骸 ${counts.DEBRIS.toLocaleString("zh-CN")}。全量 SATCAT ${counts.satcatSourceTotal.toLocaleString("zh-CN")} 条。${optionalErrors.length ? ` ${optionalErrors.join("；")}，其余并行数据源与完整缓存已完成补齐。` : ""}`,
        },
      };
      writeJsonAtomic(this.cacheFile, { savedAt, data: payload });
      this.memory = payload;
      return payload;
    } catch (error) {
      if (!stale) throw error;
      return {
        ...stale,
        source: {
          ...stale.source,
          cacheFallback: true,
          refreshCompleted: false,
          refreshSkipped: false,
          message: `卫星目录刷新失败，继续使用完整本地缓存：${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }
}

export function normalizeSatellite(omm, metadata = {}) {
  const noradId = String(omm?.NORAD_CAT_ID ?? "").trim();
  const satcat = metadata.satcat || {};
  const name = String(metadata.preferredName || satcat.OBJECT_NAME || omm?.OBJECT_NAME || `NORAD ${noradId}`).trim();
  const epoch = normalizeIsoTime(omm?.EPOCH);
  const meanMotion = finiteNumber(omm?.MEAN_MOTION);
  const eccentricity = finiteNumber(omm?.ECCENTRICITY);
  const inclinationDeg = finiteNumber(omm?.INCLINATION);
  if (!noradId || !epoch || !(meanMotion > 0) || !(eccentricity >= 0 && eccentricity < 1) || !Number.isFinite(inclinationDeg)) {
    return null;
  }

  const periodMinutes = 1440 / meanMotion;
  const angularRate = meanMotion * Math.PI * 2 / 86400;
  const semiMajorKm = Math.cbrt(EARTH_MU_KM3_S2 / (angularRate * angularRate));
  const perigeeKm = semiMajorKm * (1 - eccentricity) - EARTH_EQUATORIAL_RADIUS_KM;
  const apogeeKm = semiMajorKm * (1 + eccentricity) - EARTH_EQUATORIAL_RADIUS_KM;
  const orbitClass = classifyOrbit({ periodMinutes, perigeeKm, apogeeKm, eccentricity });
  if (!orbitClass) return null;
  const objectType = normalizeObjectType(satcat.OBJECT_TYPE, name);
  const rawStatus = String(satcat.OPS_STATUS_CODE || "").trim().toUpperCase();
  const operationalStatusCode = metadata.forceInactive ? "-" : (metadata.forceActive ? "+" : (rawStatus || "?"));
  const objectClass = classifyCatalogObject(objectType, operationalStatusCode);
  const inactive = objectClass === "RETIRED_PAYLOAD";

  return satelliteIdentities.enrich({
    id: noradId,
    noradId,
    name,
    internationalDesignator: String(omm?.OBJECT_ID || satcat.OBJECT_ID || "").trim(),
    epoch,
    orbitClass,
    objectType,
    objectTypeLabel: objectTypeLabel(objectType),
    objectClass,
    catalogClass: objectClass,
    operationalState: objectClass === "ACTIVE_PAYLOAD"
      ? "active"
      : inactive ? "inactive" : objectType === "PAYLOAD" ? "unknown" : "non-payload",
    operationalStatusCode,
    operationalStatusLabel: operationalStatusLabel(operationalStatusCode),
    owner: String(satcat.OWNER || metadata.owner || "").trim(),
    launchDate: String(satcat.LAUNCH_DATE || "").trim(),
    elementSource: String(metadata.elementSource || "CelesTrak GP / ACTIVE OMM"),
    publicAttribution: Boolean(metadata.publicAttribution),
    periodMinutes: round(periodMinutes, 4),
    semiMajorKm: round(semiMajorKm, 3),
    perigeeKm: round(perigeeKm, 3),
    apogeeKm: round(apogeeKm, 3),
    inclinationDeg: round(inclinationDeg, 5),
    eccentricity,
    omm: compactOmm(omm, { noradId, name, epoch }),
  });
}

export function classifyOrbit({ periodMinutes, perigeeKm, apogeeKm, eccentricity }) {
  if (![periodMinutes, perigeeKm, apogeeKm, eccentricity].every(Number.isFinite)) return "";
  const meanAltitudeKm = (perigeeKm + apogeeKm) / 2;
  if (periodMinutes >= 1200 && periodMinutes <= 1800 && meanAltitudeKm >= 30000 && meanAltitudeKm <= 45000) return "GEO";
  if (eccentricity >= 0.1 || apogeeKm - perigeeKm >= 10000) return "HEO";
  if (apogeeKm <= 2000) return "LEO";
  if (apogeeKm < 30000 && periodMinutes < 1200) return "MEO";
  return "HEO";
}

function compactOmm(omm, fallback) {
  return {
    OBJECT_NAME: String(omm.OBJECT_NAME || fallback.name),
    OBJECT_ID: String(omm.OBJECT_ID || ""),
    EPOCH: fallback.epoch,
    MEAN_MOTION: Number(omm.MEAN_MOTION),
    ECCENTRICITY: Number(omm.ECCENTRICITY),
    INCLINATION: Number(omm.INCLINATION),
    RA_OF_ASC_NODE: Number(omm.RA_OF_ASC_NODE),
    ARG_OF_PERICENTER: Number(omm.ARG_OF_PERICENTER),
    MEAN_ANOMALY: Number(omm.MEAN_ANOMALY),
    EPHEMERIS_TYPE: Number(omm.EPHEMERIS_TYPE || 0),
    CLASSIFICATION_TYPE: String(omm.CLASSIFICATION_TYPE || "U"),
    NORAD_CAT_ID: fallback.noradId,
    ELEMENT_SET_NO: Number(omm.ELEMENT_SET_NO || 0),
    REV_AT_EPOCH: Number(omm.REV_AT_EPOCH || 0),
    BSTAR: Number(omm.BSTAR || 0),
    MEAN_MOTION_DOT: Number(omm.MEAN_MOTION_DOT || 0),
    MEAN_MOTION_DDOT: Number(omm.MEAN_MOTION_DDOT || 0),
  };
}

function countOrbitClasses(satellites, sourceStats = {}) {
  const counts = {
    sourceTotal: Math.max(Number(sourceStats.bulkSourceTotal || 0), satellites.length),
    bulkSourceTotal: Number(sourceStats.bulkSourceTotal || 0),
    satcatSourceTotal: Number(sourceStats.satcatSourceTotal || 0),
    activeSourceTotal: Number(sourceStats.activeSourceTotal || 0),
    recentSourceTotal: Number(sourceStats.recentSourceTotal || 0),
    classifiedSourceTotal: Number(sourceStats.classifiedSourceTotal || 0),
    included: satellites.length,
    active: 0,
    LEO: 0,
    MEO: 0,
    GEO: 0,
    HEO: 0,
    INACTIVE: 0,
    ACTIVE_PAYLOAD: 0,
    RETIRED_PAYLOAD: 0,
    ROCKET_BODY: 0,
    DEBRIS: 0,
    UNKNOWN: 0,
    inactiveLEO: 0,
    inactiveMEO: 0,
    inactiveGEO: 0,
    inactiveHEO: 0,
    excluded: 0,
  };
  for (const item of satellites) {
    counts[item.orbitClass] += 1;
    counts[item.objectClass] = (counts[item.objectClass] || 0) + 1;
    if (isInactiveSatellite(item)) {
      counts.INACTIVE += 1;
      counts[`inactive${item.orbitClass}`] += 1;
    } else if (item.objectClass === "ACTIVE_PAYLOAD") {
      counts.active += 1;
    }
  }
  counts.excluded = Math.max(0, counts.sourceTotal - counts.included);
  return counts;
}

function compareSatellites(a, b) {
  const order = { LEO: 0, MEO: 1, GEO: 2, HEO: 3 };
  const objectOrder = { ACTIVE_PAYLOAD: 0, RETIRED_PAYLOAD: 1, ROCKET_BODY: 2, DEBRIS: 3, UNKNOWN: 4 };
  return ((objectOrder[a.objectClass] ?? 5) - (objectOrder[b.objectClass] ?? 5))
    || (order[a.orbitClass] - order[b.orbitClass])
    || a.name.localeCompare(b.name, "en")
    || Number(a.noradId) - Number(b.noradId);
}

function emptyCatalog(message, cacheOnly = false) {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    dataVersion: "public-on-orbit-catalog:empty",
    generatedAt: new Date().toISOString(),
    cacheSavedAt: "",
    counts: {
      sourceTotal: 0,
      activeSourceTotal: 0,
      inactiveCandidates: 0,
      included: 0,
      active: 0,
      LEO: 0,
      MEO: 0,
      GEO: 0,
      HEO: 0,
      INACTIVE: 0,
      ACTIVE_PAYLOAD: 0,
      RETIRED_PAYLOAD: 0,
      ROCKET_BODY: 0,
      DEBRIS: 0,
      UNKNOWN: 0,
      inactiveLEO: 0,
      inactiveMEO: 0,
      inactiveGEO: 0,
      inactiveHEO: 0,
      excluded: 0,
    },
    satellites: [],
    source: {
      id: "celestrak-satcat-all-on-orbit",
      name: "CelesTrak OMM + SATCAT + 全量公开在轨根数",
      url: CELESTRAK_ACTIVE_OMM_URL,
      format: "CCSDS OMM JSON",
      propagator: "SGP4/SDP4",
      cacheOnly,
      message,
    },
  };
}

export function isInactiveSatellite(item) {
  return item?.objectClass === "RETIRED_PAYLOAD" || item?.catalogClass === "INACTIVE" || item?.operationalState === "inactive";
}

function normalizeObjectType(value, name = "") {
  const type = String(value || "").trim().toUpperCase();
  if (type === "PAY") return "PAYLOAD";
  if (type === "R/B") return "ROCKET_BODY";
  if (type === "DEB") return "DEBRIS";
  if (/\bDEB\b|DEBRIS/i.test(name)) return "DEBRIS";
  if (/\bR\/B\b|ROCKET BODY/i.test(name)) return "ROCKET_BODY";
  return type === "UNK" ? "UNKNOWN" : "PAYLOAD";
}

function classifyCatalogObject(objectType, statusCode) {
  if (objectType === "ROCKET_BODY") return "ROCKET_BODY";
  if (objectType === "DEBRIS") return "DEBRIS";
  if (objectType === "UNKNOWN") return "UNKNOWN";
  const status = String(statusCode || "?").toUpperCase();
  if (["+", "P", "B", "S", "X"].includes(status)) return "ACTIVE_PAYLOAD";
  if (status === "-") return "RETIRED_PAYLOAD";
  return "UNKNOWN";
}

function objectTypeLabel(type) {
  return ({ PAYLOAD: "卫星载荷", ROCKET_BODY: "火箭体", DEBRIS: "空间残骸", UNKNOWN: "未知对象" })[type] || "未知对象";
}

function isCurrentEarthOrbit(satcat) {
  if (!satcat || !Object.keys(satcat).length) return true;
  if (String(satcat.DECAY_DATE || "").trim()) return false;
  if (String(satcat.ORBIT_CENTER || "EA").trim().toUpperCase() !== "EA") return false;
  return String(satcat.ORBIT_TYPE || "ORB").trim().toUpperCase() === "ORB";
}

function cachedSatelliteToSatcat(item) {
  const objectType = String(item?.objectType || "").toUpperCase();
  return {
    NORAD_CAT_ID: String(item?.id || item?.noradId || ""),
    OBJECT_NAME: String(item?.name || ""),
    OBJECT_ID: String(item?.internationalDesignator || ""),
    OBJECT_TYPE: objectType === "ROCKET_BODY" ? "R/B" : objectType === "DEBRIS" ? "DEB" : objectType === "UNKNOWN" ? "UNK" : "PAY",
    OPS_STATUS_CODE: String(item?.operationalStatusCode || (isInactiveSatellite(item) ? "-" : "+")),
    OWNER: String(item?.owner || ""),
    LAUNCH_DATE: String(item?.launchDate || ""),
    DECAY_DATE: "",
    ORBIT_CENTER: "EA",
    ORBIT_TYPE: "ORB",
  };
}

function sourceError(label, result) {
  if (result?.status !== "rejected") return "";
  const rawDetail = result.reason instanceof Error ? result.reason.message : String(result.reason || "unknown error");
  const lines = rawDetail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const detail = [...lines].reverse().find((line) => /^curl:\s*\(\d+\)/i.test(line))
    || lines.at(-1)
    || rawDetail;
  return `${label} 未更新：${detail}`;
}

function operationalStatusLabel(code) {
  return ({
    "+": "运行中",
    P: "部分运行",
    B: "备用/待命",
    S: "在轨备份",
    X: "延寿任务",
    "-": "失效/非运行",
    "?": "状态未知",
  })[String(code || "?").toUpperCase()] || "状态未知";
}

async function fetchSource(url, options = {}) {
  const controller = process.platform === "win32" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), Number(options.timeoutMs) || 120000) : null;
  try {
    if (process.platform === "win32") {
      const timeoutSeconds = Math.max(10, Math.ceil((Number(options.timeoutMs) || 120000) / 1000));
      const { stdout } = await execFileAsync("curl.exe", [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--compressed",
        "--retry", "3",
        "--retry-delay", "2",
        "--retry-all-errors",
        "--connect-timeout", "15",
        "--max-time", String(timeoutSeconds),
        "--header", `Accept: ${options.accept || "*/*"}`,
        "--user-agent", "NOTAM-MAP/1.0 satellite-catalog-cache",
        url,
      ], {
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        timeout: (timeoutSeconds + 30) * 1000,
        windowsHide: true,
      });
      if (options.responseType !== "json") return stdout;
      try {
        return JSON.parse(stdout);
      } catch (error) {
        const retryCount = Number(options.jsonParseRetry || 0);
        if (retryCount >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1500 * (retryCount + 1)));
        return fetchSource(url, { ...options, jsonParseRetry: retryCount + 1 });
      }
    }
    const response = await fetch(url, {
      headers: {
        accept: options.accept || "*/*",
        "user-agent": "NOTAM-MAP/1.0 satellite-catalog-cache",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return options.responseType === "json" ? response.json() : response.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, JSON.stringify(value), "utf8");
  try {
    renameSync(temp, filePath);
  } catch (error) {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
      renameSync(temp, filePath);
    } catch {
      try { unlinkSync(temp); } catch {}
      throw error;
    }
  }
}

function normalizeIsoTime(value) {
  return normalizeGpEpochUtc(value);
}

function normalizeCachedCatalogEpochs(payload) {
  if (!Array.isArray(payload?.satellites)) return payload;
  let changed = Number(payload.schemaVersion) < CACHE_SCHEMA_VERSION;
  const satellites = payload.satellites.map((item) => {
    const epoch = normalizeGpEpochUtc(item?.omm?.EPOCH || item?.epoch);
    const normalized = !epoch || (item.epoch === epoch && item?.omm?.EPOCH === epoch) ? item : {
      ...item,
      epoch,
      omm: item?.omm ? { ...item.omm, EPOCH: epoch } : item?.omm,
    };
    if (normalized !== item) changed = true;
    const correctedClass = classifyCatalogObject(normalized.objectType, normalized.operationalStatusCode);
    const classified = correctedClass === normalized.objectClass && correctedClass === normalized.catalogClass
      ? normalized
      : {
          ...normalized,
          objectClass: correctedClass,
          catalogClass: correctedClass,
          operationalState: correctedClass === "ACTIVE_PAYLOAD"
            ? "active"
            : correctedClass === "RETIRED_PAYLOAD" ? "inactive" : "unknown",
        };
    if (classified !== normalized) changed = true;
    const enriched = satelliteIdentities.enrich(classified);
    if (enriched !== normalized) changed = true;
    return enriched;
  });
  if (!changed) return payload;
  satellites.sort(compareSatellites);
  return {
    ...payload,
    schemaVersion: CACHE_SCHEMA_VERSION,
    counts: countOrbitClasses(satellites, payload.counts || {}),
    satellites,
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
