import { sameOriginWrite } from "./deployment.mjs";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const SOURCES = new Set(["notam", "hydropac", "msa", "navarea"]);
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function validateEntry(entry) {
  if (!SOURCES.has(entry?.source) || typeof entry?.item?.id !== "string" || !entry.item.id) throw fail("Invalid warning source or identifier");
  const geometry = entry.item.geometry;
  if (!["Polygon", "MultiPolygon"].includes(geometry?.type)) throw fail("Only polygon areas can be saved");
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) throw fail("Empty polygon geometry");
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) throw fail("Empty polygon");
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) throw fail("Invalid polygon ring");
      for (const point of ring) {
        if (!Array.isArray(point) || point.length < 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 540 || Math.abs(point[1]) > 90) throw fail("Invalid longitude or latitude");
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw fail("Polygon rings must be closed");
    }
  }
  for (const key of ["refreshedAt", "referenceTime"]) {
    if (entry[key] != null && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(entry[key]) || !Number.isFinite(Date.parse(entry[key])))) throw fail(`Invalid ${key}`);
  }
}

function summary(record) {
  const { item, ...meta } = record;
  const polygons = item.geometry.type === "Polygon" ? [item.geometry.coordinates] : item.geometry.coordinates;
  return { ...meta, originalId: item.id, label: item.notamId || item.title || item.id, title: item.title || "", region: item.region || "",
    beginsAt: item.beginsAt || null, endsAt: item.endsAt || null, polygonCount: polygons.length,
    vertexCount: polygons.reduce((n, polygon) => n + polygon.reduce((sum, ring) => sum + ring.length - 1, 0), 0) };
}

export class SavedRegionStore {
  constructor(filePath) { this.filePath = filePath; }

  read() {
    if (!existsSync(this.filePath)) return { version: 1, records: [] };
    const data = JSON.parse(readFileSync(this.filePath, "utf8"));
    if (data?.version !== 1 || !Array.isArray(data.records)) throw fail("Saved-area file is not readable; the existing file has not been changed", 500);
    for (const entry of data.records) validateEntry(entry);
    return data;
  }

  write(data) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(data), { encoding: "utf8", flag: "wx", flush: true });
      // Never remove the last good copy if an atomic replacement fails.
      renameSync(temporary, this.filePath);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  list() { return this.read().records.map(summary); }

  get(id) {
    const record = this.read().records.find((entry) => entry.id === id);
    if (!record) throw fail("Saved area not found", 404);
    return record;
  }

  save(entries) {
    if (!Array.isArray(entries) || !entries.length) throw fail("No highlighted polygon areas were supplied");
    entries.forEach(validateEntry);
    const data = this.read();
    const byFingerprint = new Map(data.records.map((entry) => [entry.fingerprint, entry]));
    const savedIds = [];
    let added = 0;
    for (const entry of entries) {
      const canonical = { source: entry.source, refreshedAt: entry.refreshedAt || null, referenceTime: entry.referenceTime || null,
        dataVersion: String(entry.dataVersion || ""), historyDate: String(entry.historyDate || ""), item: entry.item };
      const fingerprint = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
      let record = byFingerprint.get(fingerprint);
      if (!record) {
        record = { ...canonical, id: randomUUID(), fingerprint, savedAt: new Date().toISOString() };
        data.records.unshift(record);
        byFingerprint.set(fingerprint, record);
        added++;
      }
      savedIds.push(record.id);
    }
    if (added) this.write(data);
    return { records: data.records.map(summary), savedIds, added };
  }

  delete(id) {
    const data = this.read();
    const index = data.records.findIndex((entry) => entry.id === id);
    if (index < 0) throw fail("Saved area not found", 404);
    data.records.splice(index, 1);
    this.write(data);
    return { records: data.records.map(summary), deletedId: id };
  }
}

export async function handleSavedRegionsApi(req, res, url, store) {
  if (!["/api/saved-regions", "/api/saved-regions/item"].includes(url.pathname)) return false;
  const send = (status, payload) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(payload));
  };
  try {
    if (["POST", "DELETE"].includes(req.method) && req.headers.origin && !sameOriginWrite(req)) throw fail("Cross-origin writes are not allowed", 403);
    const itemRoute = url.pathname.endsWith("/item");
    if (req.method === "GET") send(200, itemRoute ? store.get(url.searchParams.get("id")) : { records: store.list() });
    else if (req.method === "DELETE" && itemRoute) send(200, store.delete(url.searchParams.get("id")));
    else if (req.method === "POST" && !itemRoute) {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      }
      if (size > MAX_BODY_BYTES) throw fail("Selection exceeds 64 MB; save it in smaller batches", 413);
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw fail("Invalid JSON"); }
      send(200, store.save(body?.entries));
    } else send(405, { error: "Method not allowed" });
  } catch (error) { send(error.status || 500, { error: error.message || "Saved-area operation failed" }); }
  return true;
}
