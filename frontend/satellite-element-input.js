(function initSatelliteElementInput(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NotamSatelliteElementInput = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildSatelliteElementInput() {
  "use strict";

  const EARTH_MU_KM3_S2 = 398600.4418;
  const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
  const REQUIRED_FIELDS = [
    "NORAD_CAT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION",
    "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY",
  ];
  const OMM_FIELDS = [
    "OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION",
    "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "EPHEMERIS_TYPE",
    "CLASSIFICATION_TYPE", "NORAD_CAT_ID", "ELEMENT_SET_NO", "REV_AT_EPOCH", "BSTAR",
    "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT",
  ];

  function parse(text, options = {}) {
    const input = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!input) return { satellites: [], records: [], warnings: [], errors: ["empty_input"], formats: [] };
    const requested = String(options.format || "auto").toLowerCase();
    const attempts = requested === "auto" ? formatCandidates(input) : [requested];
    const warnings = [];
    const errors = [];
    let parsed = [];
    let detectedFormat = "";
    for (const format of attempts) {
      try {
        const result = parseByFormat(input, format);
        if (!result.records.length) continue;
        parsed = result.records;
        warnings.push(...result.warnings);
        detectedFormat = format;
        break;
      } catch (error) {
        errors.push(`${format}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!parsed.length) {
      return { satellites: [], records: [], warnings, errors: errors.length ? errors : ["unrecognized_format"], formats: [] };
    }
    const records = [];
    for (const record of parsed) {
      const normalized = normalizeOmm(record.omm || record);
      if (!normalized) {
        warnings.push(`invalid_record:${record?.omm?.NORAD_CAT_ID || record?.NORAD_CAT_ID || "unknown"}`);
        continue;
      }
      records.push({
        omm: normalized,
        epoch: normalized.EPOCH,
        sourceFormat: String(record.sourceFormat || detectedFormat).toUpperCase(),
        checksumValid: record.checksumValid !== false,
      });
    }
    const deduplicated = deduplicateRecords(records);
    const satellites = groupElementSets(deduplicated);
    if (!satellites.length) errors.push("no_valid_orbit_records");
    return {
      satellites,
      records: deduplicated,
      warnings: [...new Set(warnings)],
      errors,
      formats: [...new Set(deduplicated.map((record) => record.sourceFormat))],
    };
  }

  function formatCandidates(input) {
    const trimmed = input.trim();
    if (/^\s*</.test(trimmed)) return ["xml", "kvn", "json", "csv", "tle"];
    if (/^\s*[\[{]/.test(trimmed)) return ["json", "kvn", "csv", "tle", "xml"];
    if (/\bCCSDS_OMM_VERS\s*=|\bMEAN_ELEMENT_THEORY\s*=/.test(trimmed)) return ["kvn", "json", "csv", "tle", "xml"];
    if (/OBJECT_NAME\s*,\s*OBJECT_ID\s*,\s*EPOCH/i.test(trimmed)) return ["csv", "json", "kvn", "tle", "xml"];
    if (/(?:^|\s)1\s+[0-9A-Z]{5}[A-Z]\s/.test(trimmed) && /(?:^|\s)2\s+[0-9A-Z]{5}\s/.test(trimmed)) {
      return ["tle", "json", "csv", "kvn", "xml"];
    }
    return ["json", "csv", "kvn", "xml", "tle"];
  }

  function parseByFormat(input, format) {
    if (["tle", "2le", "3le"].includes(format)) return parseTle(input);
    if (["gp", "omm", "json", "json-pretty"].includes(format)) return parseJson(input);
    if (format === "csv") return parseCsv(input);
    if (format === "kvn") return parseKvn(input);
    if (format === "xml") return parseXml(input);
    throw new Error("unsupported_format");
  }

  function parseTle(input) {
    const pairs = [...tlePairsFromLines(input), ...tlePairsFromInline(input)];
    const seen = new Set();
    const records = [];
    const warnings = [];
    for (const pair of pairs) {
      const signature = `${pair.line1}\n${pair.line2}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const converted = tlePairToOmm(pair.name, pair.line1, pair.line2);
      if (!converted) {
        warnings.push("invalid_tle_pair");
        continue;
      }
      if (!converted.checksumValid) warnings.push(`tle_checksum:${converted.omm.NORAD_CAT_ID}:${converted.omm.EPOCH}`);
      records.push(converted);
    }
    return { records, warnings };
  }

  function tlePairsFromLines(input) {
    const lines = String(input).replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
    const pairs = [];
    let pendingName = "";
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trimStart();
      if (/^1\s+[0-9A-Z]{5}[A-Z]\s/.test(line)) {
        const line2 = String(lines[index + 1] || "").trimStart();
        if (/^2\s+[0-9A-Z]{5}\s/.test(line2)) {
          pairs.push({ name: pendingName, line1: line.slice(0, 69), line2: line2.slice(0, 69) });
          pendingName = "";
          index += 1;
          continue;
        }
      }
      if (line && !/^\d\s+/.test(line)) pendingName = line.replace(/^0\s+/, "").trim();
    }
    return pairs;
  }

  function tlePairsFromInline(input) {
    const source = String(input).replace(/[\r\n]+/g, " ");
    const starts = [];
    const matcher = /(?:^|\s)(1\s+[0-9A-Z]{5}[A-Z]\s)/g;
    let match;
    while ((match = matcher.exec(source))) starts.push(match.index + match[0].length - match[1].length);
    const pairs = [];
    let previousEnd = 0;
    for (const start of starts) {
      const line1 = source.slice(start, start + 69);
      const afterLine1 = source.slice(start + 69);
      const line2Match = afterLine1.match(/^\s*(2\s+[0-9A-Z]{5}\s)/);
      if (!line2Match) continue;
      const line2Start = start + 69 + line2Match[0].length - line2Match[1].length;
      const line2 = source.slice(line2Start, line2Start + 69);
      const rawName = source.slice(previousEnd, start).trim();
      const name = rawName.replace(/^0\s+/, "").replace(/\s+/g, " ").trim();
      pairs.push({ name, line1, line2 });
      previousEnd = line2Start + 69;
    }
    return pairs;
  }

  function tlePairToOmm(name, rawLine1, rawLine2) {
    const line1 = String(rawLine1 || "").padEnd(69, " ");
    const line2 = String(rawLine2 || "").padEnd(69, " ");
    if (line1[0] !== "1" || line2[0] !== "2") return null;
    const id1 = line1.slice(2, 7).trim();
    const id2 = line2.slice(2, 7).trim();
    if (!id1 || id1 !== id2) return null;
    const noradId = decodeTleCatalogId(id1);
    if (!noradId) return null;
    const epoch = tleEpochToIso(line1.slice(18, 20), line1.slice(20, 32));
    const meanMotion = finiteNumber(line2.slice(52, 63));
    const eccentricity = finiteNumber(`0.${line2.slice(26, 33).trim()}`);
    const inclination = finiteNumber(line2.slice(8, 16));
    if (!epoch || !(meanMotion > 0) || !(eccentricity >= 0 && eccentricity < 1) || !Number.isFinite(inclination)) return null;
    const objectId = tleInternationalDesignator(line1.slice(9, 17));
    const omm = {
      OBJECT_NAME: String(name || `NORAD ${noradId}`).trim(),
      OBJECT_ID: objectId,
      EPOCH: epoch,
      MEAN_MOTION: meanMotion,
      ECCENTRICITY: eccentricity,
      INCLINATION: inclination,
      RA_OF_ASC_NODE: finiteNumber(line2.slice(17, 25)),
      ARG_OF_PERICENTER: finiteNumber(line2.slice(34, 42)),
      MEAN_ANOMALY: finiteNumber(line2.slice(43, 51)),
      EPHEMERIS_TYPE: finiteNumber(line1.slice(62, 63)) || 0,
      CLASSIFICATION_TYPE: String(line1.slice(7, 8).trim() || "U"),
      NORAD_CAT_ID: noradId,
      ELEMENT_SET_NO: finiteNumber(line1.slice(64, 68)) || 0,
      REV_AT_EPOCH: finiteNumber(line2.slice(63, 68)) || 0,
      BSTAR: parseTleExponent(line1.slice(53, 61)),
      MEAN_MOTION_DOT: finiteNumber(line1.slice(33, 43)) || 0,
      MEAN_MOTION_DDOT: parseTleExponent(line1.slice(44, 52)),
    };
    if (REQUIRED_FIELDS.some((field) => field !== "NORAD_CAT_ID" && !Number.isFinite(field === "EPOCH" ? Date.parse(omm[field]) : Number(omm[field])))) return null;
    return {
      omm,
      sourceFormat: "TLE",
      checksumValid: tleChecksumValid(rawLine1) && tleChecksumValid(rawLine2),
    };
  }

  function tleChecksumValid(line) {
    const value = String(line || "");
    if (value.length < 69 || !/\d/.test(value[68])) return false;
    let sum = 0;
    for (let index = 0; index < 68; index += 1) {
      if (/\d/.test(value[index])) sum += Number(value[index]);
      else if (value[index] === "-") sum += 1;
    }
    return sum % 10 === Number(value[68]);
  }

  function decodeTleCatalogId(value) {
    const text = String(value || "").trim().toUpperCase();
    if (/^\d{1,5}$/.test(text)) return String(Number(text));
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const match = text.match(/^([A-HJ-NP-Z])(\d{4})$/);
    if (!match) return "";
    const prefix = alphabet.indexOf(match[1]) + 10;
    return prefix >= 10 ? String(prefix * 10000 + Number(match[2])) : "";
  }

  function parseTleExponent(value) {
    const match = String(value || "").trim().match(/^([+-]?)(\d{5})([+-]\d)$/);
    if (!match) return finiteNumber(value) || 0;
    return Number(`${match[1] === "-" ? "-" : ""}0.${match[2]}e${match[3]}`);
  }

  function tleEpochToIso(yearText, dayText) {
    const shortYear = Number(yearText);
    const day = Number(dayText);
    if (!Number.isInteger(shortYear) || !(day >= 1 && day < 367)) return "";
    const year = shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
    return new Date(Date.UTC(year, 0, 1) + (day - 1) * 86400000).toISOString();
  }

  function tleInternationalDesignator(value) {
    const compact = String(value || "").trim();
    const match = compact.match(/^(\d{2})(\d{3})([A-Z0-9]*)$/i);
    if (!match) return compact;
    const shortYear = Number(match[1]);
    const year = shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
    return `${year}-${match[2]}${match[3]}`;
  }

  function parseJson(input) {
    const root = JSON.parse(input);
    const candidates = [];
    collectOmmObjects(root, candidates);
    return { records: candidates.map((omm) => ({ omm, sourceFormat: "GP JSON" })), warnings: [] };
  }

  function collectOmmObjects(value, output) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectOmmObjects(item, output));
      return;
    }
    if (!value || typeof value !== "object") return;
    const normalized = uppercaseRecord(value);
    if (normalized.EPOCH != null && normalized.MEAN_MOTION != null && normalized.NORAD_CAT_ID != null) {
      output.push(normalized);
      return;
    }
    Object.values(value).forEach((item) => collectOmmObjects(item, output));
  }

  function parseCsv(input) {
    const rows = csvRows(input);
    if (rows.length < 2) return { records: [], warnings: [] };
    const headers = rows[0].map((value) => String(value).trim().toUpperCase());
    const records = rows.slice(1).filter((row) => row.some((value) => String(value).trim())).map((row) => {
      const omm = {};
      headers.forEach((header, index) => { if (header) omm[header] = row[index] ?? ""; });
      return { omm, sourceFormat: "GP CSV" };
    });
    return { records, warnings: [] };
  }

  function csvRows(input) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    const source = String(input || "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') { value += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else value += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") { row.push(value); value = ""; }
      else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
      else value += char;
    }
    row.push(value.replace(/\r$/, ""));
    if (row.some((item) => item !== "") || !rows.length) rows.push(row);
    return rows;
  }

  function parseKvn(input) {
    const records = [];
    let current = {};
    const pushCurrent = () => {
      if (current.EPOCH != null || current.NORAD_CAT_ID != null) records.push({ omm: current, sourceFormat: "GP KVN" });
      current = {};
    };
    for (const line of String(input).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
      if (!match) continue;
      const key = match[1].toUpperCase();
      if (key === "CCSDS_OMM_VERS" && (current.EPOCH != null || current.NORAD_CAT_ID != null)) pushCurrent();
      if (key === "OBJECT_NAME" && current.OBJECT_NAME != null && current.EPOCH != null) pushCurrent();
      current[key] = match[2];
    }
    pushCurrent();
    return { records, warnings: [] };
  }

  function parseXml(input) {
    const source = String(input || "");
    const segmentMatches = [...source.matchAll(/<(?:[\w.-]+:)?segment\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?segment>/gi)];
    const blocks = segmentMatches.length ? segmentMatches.map((match) => match[1]) : [source];
    const records = [];
    for (const block of blocks) {
      const omm = {};
      for (const field of OMM_FIELDS) {
        const pattern = new RegExp(`<(?:[\\w.-]+:)?${field}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${field}>`, "i");
        const match = block.match(pattern);
        if (match) omm[field] = decodeXml(match[1].trim());
      }
      if (omm.EPOCH != null || omm.NORAD_CAT_ID != null) records.push({ omm, sourceFormat: "GP XML" });
    }
    return { records, warnings: [] };
  }

  function decodeXml(value) {
    return String(value).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }

  function uppercaseRecord(record) {
    const output = {};
    for (const [key, value] of Object.entries(record || {})) output[String(key).toUpperCase()] = value;
    return output;
  }

  function normalizeOmm(raw) {
    const source = uppercaseRecord(raw);
    const noradId = String(source.NORAD_CAT_ID ?? "").trim().replace(/\.0$/, "");
    const epoch = normalizeEpoch(source.EPOCH);
    const normalized = {
      OBJECT_NAME: String(source.OBJECT_NAME || `NORAD ${noradId}`).trim(),
      OBJECT_ID: String(source.OBJECT_ID || "").trim(),
      EPOCH: epoch,
      MEAN_MOTION: finiteNumber(source.MEAN_MOTION),
      ECCENTRICITY: finiteNumber(source.ECCENTRICITY),
      INCLINATION: finiteNumber(source.INCLINATION),
      RA_OF_ASC_NODE: finiteNumber(source.RA_OF_ASC_NODE),
      ARG_OF_PERICENTER: finiteNumber(source.ARG_OF_PERICENTER),
      MEAN_ANOMALY: finiteNumber(source.MEAN_ANOMALY),
      EPHEMERIS_TYPE: finiteNumber(source.EPHEMERIS_TYPE) || 0,
      CLASSIFICATION_TYPE: String(source.CLASSIFICATION_TYPE || "U").trim() || "U",
      NORAD_CAT_ID: noradId,
      ELEMENT_SET_NO: finiteNumber(source.ELEMENT_SET_NO) || 0,
      REV_AT_EPOCH: finiteNumber(source.REV_AT_EPOCH) || 0,
      BSTAR: finiteNumber(source.BSTAR) || 0,
      MEAN_MOTION_DOT: finiteNumber(source.MEAN_MOTION_DOT) || 0,
      MEAN_MOTION_DDOT: finiteNumber(source.MEAN_MOTION_DDOT) || 0,
    };
    if (!noradId || !/^\d{1,9}$/.test(noradId) || !epoch) return null;
    if (!(normalized.MEAN_MOTION > 0) || !(normalized.ECCENTRICITY >= 0 && normalized.ECCENTRICITY < 1)) return null;
    if (![normalized.INCLINATION, normalized.RA_OF_ASC_NODE, normalized.ARG_OF_PERICENTER, normalized.MEAN_ANOMALY].every(Number.isFinite)) return null;
    return normalized;
  }

  function normalizeEpoch(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
    const time = Date.parse(withZone);
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
  }

  function finiteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const normalized = String(value ?? "").trim().replace(/^\+/, "");
    if (!normalized) return NaN;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
  }

  function deduplicateRecords(records) {
    const map = new Map();
    for (const record of records) {
      const key = `${record.omm.NORAD_CAT_ID}:${record.omm.EPOCH}`;
      map.set(key, record);
    }
    return [...map.values()].sort((a, b) => a.omm.NORAD_CAT_ID.localeCompare(b.omm.NORAD_CAT_ID, "en", { numeric: true }) || Date.parse(a.epoch) - Date.parse(b.epoch));
  }

  function groupElementSets(records) {
    const groups = new Map();
    for (const record of records) {
      const id = String(record.omm.NORAD_CAT_ID);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(record);
    }
    return [...groups.entries()].map(([id, elementSets]) => satelliteFromElements(id, elementSets));
  }

  function satelliteFromElements(id, elementSets) {
    const sorted = [...elementSets].sort((a, b) => Date.parse(a.epoch) - Date.parse(b.epoch));
    const latest = sorted[sorted.length - 1];
    const omm = latest.omm;
    const orbit = orbitSummary(omm);
    return {
      id,
      noradId: id,
      name: String(omm.OBJECT_NAME || `NORAD ${id}`),
      internationalDesignator: String(omm.OBJECT_ID || ""),
      epoch: omm.EPOCH,
      orbitClass: orbit.orbitClass,
      objectType: "PAYLOAD",
      objectTypeLabel: "User orbit object",
      objectClass: "ACTIVE_PAYLOAD",
      catalogClass: "ACTIVE_PAYLOAD",
      operationalState: "active",
      operationalStatusCode: "+",
      operationalStatusLabel: "User supplied",
      owner: "USER",
      launchDate: "",
      elementSource: `User ${[...new Set(sorted.map((item) => item.sourceFormat))].join(" / ")} input`,
      periodMinutes: orbit.periodMinutes,
      semiMajorKm: orbit.semiMajorKm,
      perigeeKm: orbit.perigeeKm,
      apogeeKm: orbit.apogeeKm,
      inclinationDeg: round(Number(omm.INCLINATION), 5),
      eccentricity: Number(omm.ECCENTRICITY),
      omm,
      elementSets: sorted.map((item) => ({ ...item, ...orbitSummary(item.omm), inclinationDeg: round(Number(item.omm.INCLINATION), 5), omm: { ...item.omm } })),
      customOrbit: true,
    };
  }

  function orbitSummary(omm) {
    const meanMotion = Number(omm.MEAN_MOTION);
    const eccentricity = Number(omm.ECCENTRICITY);
    const periodMinutes = 1440 / meanMotion;
    const angularRate = meanMotion * Math.PI * 2 / 86400;
    const semiMajorKm = Math.cbrt(EARTH_MU_KM3_S2 / (angularRate * angularRate));
    const perigeeKm = semiMajorKm * (1 - eccentricity) - EARTH_EQUATORIAL_RADIUS_KM;
    const apogeeKm = semiMajorKm * (1 + eccentricity) - EARTH_EQUATORIAL_RADIUS_KM;
    return {
      orbitClass: classifyOrbit(periodMinutes, perigeeKm, apogeeKm, eccentricity),
      periodMinutes: round(periodMinutes, 4),
      semiMajorKm: round(semiMajorKm, 3),
      perigeeKm: round(perigeeKm, 3),
      apogeeKm: round(apogeeKm, 3),
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

  function selectElementSet(itemOrSets, timeMs = Date.now()) {
    const sets = Array.isArray(itemOrSets) ? itemOrSets : itemOrSets?.elementSets;
    if (!Array.isArray(sets) || !sets.length) return null;
    const target = Number(timeMs);
    let low = 0;
    let high = sets.length - 1;
    let selectedIndex = 0;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const epochMs = Date.parse(sets[middle]?.epoch || sets[middle]?.omm?.EPOCH || "");
      if (!Number.isFinite(epochMs) || epochMs > target) high = middle - 1;
      else { selectedIndex = middle; low = middle + 1; }
    }
    return sets[selectedIndex];
  }

  function round(value, digits) {
    const scale = 10 ** digits;
    return Math.round(Number(value) * scale) / scale;
  }

  return {
    parse,
    parseTle,
    normalizeOmm,
    selectElementSet,
    tleChecksumValid,
  };
});
