import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync, mkdirSync, renameSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

export function fileRevision(path) {
  const stat = statSync(path, { bigint: true });
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

export class HistoryDerivedCache {
  constructor(root, version, { dataDirectory = join(root, "data"), memoryBytes = 96 * 1024 * 1024 } = {}) {
    this.directory = join(dataDirectory, "derived_history_v1");
    this.maxMemoryBytes = memoryBytes;
    this.version = version;
    this.memory = new Map(); this.memoryBytes = 0; this.writes = 0;
  }
  read(filePath, context, build) {
    const revision = fileRevision(filePath), identity = `${this.version}:${filePath}:${context}`;
    const memo = this.memory.get(identity);
    if (memo?.revision === revision) { this.memory.delete(identity); this.memory.set(identity, memo); return memo.value; }
    const raw = readFileSync(filePath);
    const hash = createHash("sha256").update(identity).update(raw).digest("hex");
    const cachePath = join(this.directory, `${hash}.json.gz`);
    let value;
    try { value = JSON.parse(gunzipSync(readFileSync(cachePath)).toString("utf8")); }
    catch {
      value = build(JSON.parse(raw.toString("utf8")));
      try {
        mkdirSync(this.directory, { recursive: true });
        const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
        writeFileSync(temporary, gzipSync(JSON.stringify(value), { level: 1 }));
        renameSync(temporary, cachePath);
        if (++this.writes % 8 === 1) this.trim();
      } catch (error) {
        // A cache write failure must never discard a valid historical result.
        console.error("History derived cache write failed:", error.message);
      }
    }
    if (fileRevision(filePath) !== revision) return this.read(filePath, context, build);
    if (memo) { this.memoryBytes -= memo.bytes; this.memory.delete(identity); }
    const bytes = raw.length * 3;
    if (bytes <= this.maxMemoryBytes) {
      this.memory.set(identity, { revision, value, bytes }); this.memoryBytes += bytes;
      while (this.memoryBytes > this.maxMemoryBytes) {
        const first = this.memory.keys().next().value; this.memoryBytes -= this.memory.get(first).bytes; this.memory.delete(first);
      }
    }
    return value;
  }
  trim() {
    // Only our content-addressed, disposable files are eligible. Source snapshots are immutable.
    const files = readdirSync(this.directory).filter(name => /^[a-f0-9]{64}\.json\.gz$/.test(name)).map(name => {
      const path = join(this.directory, name), stat = statSync(path); return { path, size: stat.size, modified: stat.mtimeMs };
    }).sort((a, b) => b.modified - a.modified);
    let size = 0;
    for (const file of files) { size += file.size; if (size > 512 * 1024 * 1024) { try { unlinkSync(file.path); } catch {} } }
  }
}
