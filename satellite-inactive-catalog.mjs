import JSZip from "jszip";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const BULK_TLE_ZIP_URL = "https://www.idb.com.au/files/TLE_DATA/ALL_TLE.ZIP";
export const MCCANTS_CLASSIFIED_TLE_ZIP_URL = "https://www.mmccants.org/tles/classfd.zip";
// The complete archive is served slowly at times. Give one transfer enough time
// to finish instead of repeatedly discarding a partial 1.8 MB download.
const MAX_RETRIES = 1;

export function parseSatcatCsv(text) {
  const rows = parseCsvRows(String(text || ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => String(value || "").trim());
  const records = [];
  for (const row of rows.slice(1)) {
    if (!row.some((value) => String(value || "").trim())) continue;
    const record = {};
    headers.forEach((header, index) => {
      record[header] = String(row[index] ?? "").trim();
    });
    records.push(record);
  }
  return records;
}

export function selectInactiveOnOrbitPayloads(records) {
  const byId = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.NORAD_CAT_ID || "").trim();
    if (!id || String(record?.OBJECT_TYPE || "").toUpperCase() !== "PAY") continue;
    const status = String(record?.OPS_STATUS_CODE || "").trim().toUpperCase();
    if (["+", "P", "B", "S", "X"].includes(status)) continue;
    if (String(record?.DECAY_DATE || "").trim()) continue;
    if (String(record?.ORBIT_CENTER || "EA").toUpperCase() !== "EA") continue;
    if (String(record?.ORBIT_TYPE || "ORB").toUpperCase() !== "ORB") continue;
    byId.set(id, record);
  }
  return byId;
}

export async function fetchAllSatelliteTles(options = {}) {
  const archive = await fetchBulkTleArchive(options.fetchImpl, options.signal);
  const zip = await JSZip.loadAsync(archive);
  const textEntry = Object.values(zip.files).find((entry) => !entry.dir && /(?:^|\/)all_tle\.txt$/i.test(entry.name))
    || Object.values(zip.files).find((entry) => !entry.dir && /\.txt$/i.test(entry.name));
  if (!textEntry) throw new Error("ALL_TLE.ZIP 中没有可识别的 TLE 文本文件");
  const text = await textEntry.async("string");
  const allRecords = parseThreeLineCatalog(text);
  const records = new Map();
  for (const member of allRecords) {
    const id = String(member?.satelliteId ?? "").trim();
    if (!id || !member?.line1 || !member?.line2) continue;
    const existing = records.get(id);
    const nextDate = Date.parse(member?.date || member?.updated || "") || 0;
    const existingDate = Date.parse(existing?.date || existing?.updated || "") || 0;
    if (!existing || nextDate >= existingDate) records.set(id, member);
  }
  return {
    records,
    sourceTotal: allRecords.length,
    pages: 1,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchClassifiedSatelliteTles(options = {}) {
  const archive = await fetchZipArchive({
    url: MCCANTS_CLASSIFIED_TLE_ZIP_URL,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    minimumBytes: 10000,
    label: "CLASSFD.ZIP",
  });
  const zip = await JSZip.loadAsync(archive);
  const textEntry = Object.values(zip.files).find((entry) => !entry.dir && /(?:^|\/)classfd\.tle$/i.test(entry.name))
    || Object.values(zip.files).find((entry) => !entry.dir && /\.tle$/i.test(entry.name));
  if (!textEntry) throw new Error("CLASSFD.ZIP 中没有可识别的 TLE 文本文件");
  const text = await textEntry.async("string");
  const allRecords = parseThreeLineCatalog(text, "Satobs / McCants public-observer classified TLE");
  const records = new Map();
  for (const member of allRecords) {
    const id = String(member?.satelliteId ?? "").trim();
    if (!id || !member?.line1 || !member?.line2) continue;
    const existing = records.get(id);
    const nextDate = Date.parse(member?.date || member?.updated || parseTleEpoch(member.line1.slice(18, 32))) || 0;
    const existingDate = Date.parse(existing?.date || existing?.updated || "") || 0;
    if (!existing || nextDate >= existingDate) records.set(id, member);
  }
  return {
    records,
    sourceTotal: allRecords.length,
    pages: 1,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchInactiveSatelliteTles(candidatesById, options = {}) {
  const candidateIds = candidatesById instanceof Map ? new Set(candidatesById.keys()) : new Set();
  if (!candidateIds.size) return { records: new Map(), sourceTotal: 0, pages: 0, fetchedAt: new Date().toISOString() };
  const catalog = await fetchAllSatelliteTles(options);
  const records = new Map();
  collectCandidateTles([...catalog.records.values()], candidateIds, records);

  return {
    records,
    sourceTotal: catalog.sourceTotal,
    pages: catalog.pages,
    fetchedAt: catalog.fetchedAt,
  };
}

export function tleRecordToOmm(tleRecord, satcatRecord = {}) {
  const line1 = String(tleRecord?.line1 || tleRecord?.tle1 || "").trimEnd();
  const line2 = String(tleRecord?.line2 || tleRecord?.tle2 || "").trimEnd();
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ") || line1.length < 63 || line2.length < 63) return null;
  const noradId = normalizeCatalogId(tleRecord?.satelliteId || tleRecord?.norad_cat_id || satcatRecord?.NORAD_CAT_ID || line1.slice(2, 7));
  if (!noradId || String(line2.slice(2, 7)).trim() !== String(line1.slice(2, 7)).trim()) return null;
  const epoch = parseTleEpoch(line1.slice(18, 32));
  const meanMotion = finiteNumber(line2.slice(52, 63));
  const eccentricityDigits = line2.slice(26, 33).trim();
  const eccentricity = finiteNumber(`0.${eccentricityDigits}`);
  const inclination = finiteNumber(line2.slice(8, 16));
  const raan = finiteNumber(line2.slice(17, 25));
  const argumentOfPericenter = finiteNumber(line2.slice(34, 42));
  const meanAnomaly = finiteNumber(line2.slice(43, 51));
  if (!epoch || !(meanMotion > 0) || !(eccentricity >= 0 && eccentricity < 1)
    || ![inclination, raan, argumentOfPericenter, meanAnomaly].every(Number.isFinite)) return null;

  return {
    OBJECT_NAME: String(satcatRecord?.OBJECT_NAME || tleRecord?.name || tleRecord?.tle0 || `NORAD ${noradId}`).replace(/^0\s+/, "").trim(),
    OBJECT_ID: String(satcatRecord?.OBJECT_ID || parseTleInternationalDesignator(line1.slice(9, 17))).trim(),
    EPOCH: epoch,
    MEAN_MOTION: meanMotion,
    ECCENTRICITY: eccentricity,
    INCLINATION: inclination,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: argumentOfPericenter,
    MEAN_ANOMALY: meanAnomaly,
    EPHEMERIS_TYPE: Math.max(0, Math.trunc(finiteNumber(line1.slice(62, 63)) || 0)),
    CLASSIFICATION_TYPE: String(line1.slice(7, 8) || "U").trim() || "U",
    NORAD_CAT_ID: noradId,
    ELEMENT_SET_NO: Math.max(0, Math.trunc(finiteNumber(line1.slice(64, 68)) || 0)),
    REV_AT_EPOCH: Math.max(0, Math.trunc(finiteNumber(line2.slice(63, 68)) || 0)),
    BSTAR: parseTleExponent(line1.slice(53, 61)),
    MEAN_MOTION_DOT: finiteNumber(line1.slice(33, 43)) || 0,
    MEAN_MOTION_DDOT: parseTleExponent(line1.slice(44, 52)),
  };
}

async function fetchBulkTleArchive(fetchImpl, signal) {
  return fetchZipArchive({
    url: BULK_TLE_ZIP_URL,
    fetchImpl,
    signal,
    minimumBytes: 100000,
    label: "ALL_TLE.ZIP",
  });
}

async function fetchZipArchive({ url, fetchImpl, signal, minimumBytes, label }) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const body = fetchImpl
        ? await fetchArchiveWithFetch(fetchImpl, signal, url)
        : await downloadArchiveWithCurl(signal, url);
      if (body.byteLength < minimumBytes) throw new Error(`${label} 文件过小（${body.byteLength} bytes）`);
      return body;
    } catch (error) {
      lastError = error;
      if (signal?.aborted || attempt >= MAX_RETRIES) break;
      await delay(Math.min(12000, 800 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250));
    }
  }
  throw lastError || new Error(`${label} 下载失败`);
}

async function fetchArchiveWithFetch(fetchImpl, signal, url) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/zip, application/octet-stream, */*", "user-agent": "NOTAM-MAP/1.0 inactive-satellite-cache" },
    signal,
  });
  if (!response.ok) throw new Error(`ALL_TLE.ZIP HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function downloadArchiveWithCurl(signal, url) {
  const executable = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(executable, [
    "--fail",
    "--location",
    "--silent",
    "--show-error",
    "--connect-timeout", "30",
    "--max-time", "300",
    "--header", "Accept: application/zip, application/octet-stream, */*",
    "--user-agent", "NOTAM-MAP/1.0 inactive-satellite-cache",
    url,
  ], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 310000,
    signal,
    windowsHide: true,
  });
  return stdout;
}

function collectCandidateTles(members, candidateIds, records) {
  for (const member of Array.isArray(members) ? members : []) {
    const id = String(member?.satelliteId ?? member?.norad_cat_id ?? "").trim();
    if (!candidateIds.has(id)) continue;
    if (!member?.line1 || !member?.line2) continue;
    const existing = records.get(id);
    const nextDate = Date.parse(member?.date || member?.updated || "") || 0;
    const existingDate = Date.parse(existing?.date || existing?.updated || "") || 0;
    if (!existing || nextDate >= existingDate) records.set(id, member);
  }
}

export function parseThreeLineCatalog(text, source = "TLE.info / IDB ALL_TLE mirror") {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const records = [];
  let index = 0;
  while (index < lines.length) {
    let name = "";
    let line1 = "";
    let line2 = "";
    if (lines[index].startsWith("1 ") && lines[index + 1]?.startsWith("2 ")) {
      line1 = lines[index];
      line2 = lines[index + 1];
      index += 2;
    } else if (lines[index + 1]?.startsWith("1 ") && lines[index + 2]?.startsWith("2 ")) {
      name = lines[index].replace(/^0\s+/, "").trim();
      line1 = lines[index + 1];
      line2 = lines[index + 2];
      index += 3;
    } else {
      index += 1;
      continue;
    }
    const rawSatelliteId = String(line1.slice(2, 7)).trim();
    const satelliteId = normalizeCatalogId(rawSatelliteId);
    if (!satelliteId || String(line2.slice(2, 7)).trim() !== rawSatelliteId) continue;
    records.push({
      satelliteId,
      name: name || `NORAD ${satelliteId}`,
      line1,
      line2,
      tle_source: source,
    });
  }
  return records;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function parseTleEpoch(value) {
  const match = String(value || "").trim().match(/^(\d{2})(\d{3}(?:\.\d+)?)$/);
  if (!match) return "";
  const shortYear = Number(match[1]);
  const year = shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
  const day = Number(match[2]);
  if (!(day >= 1 && day < 367)) return "";
  return new Date(Date.UTC(year, 0, 1) + (day - 1) * 86400000).toISOString();
}

function parseTleInternationalDesignator(value) {
  const match = String(value || "").trim().match(/^(\d{2})(\d{3})([A-Z0-9]{0,3})$/i);
  if (!match) return "";
  const shortYear = Number(match[1]);
  const year = shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
  return `${year}-${match[2]}${match[3]}`;
}

function parseTleExponent(value) {
  const normalized = String(value || "").replace(/\s+/g, "");
  const match = normalized.match(/^([+-]?)(\d{5})([+-]\d)$/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * Number(`0.${match[2]}`) * (10 ** Number(match[3]));
}

function finiteNumber(value) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) ? number : NaN;
}

function normalizeCatalogId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? (text.replace(/^0+(?=\d)/, "") || "0") : text;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
