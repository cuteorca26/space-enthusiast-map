import { parentPort } from "node:worker_threads";
import { readSnapshotSummary, readRefreshHistoryItem, historyItemFilePath, loadGmgsiDataset, renderGmgsiTile, renderGmgsiGlobeTexture } from "./server.mjs";
import { fileRevision } from "./history-derived-cache.mjs";

const responses = new Map(); let responseBytes = 0;
const responseLimit = process.env.MEMORY_BUDGET_MODE === '1' ? 8 * 1024 * 1024 : 128 * 1024 * 1024;
parentPort.on("message", async ({ id, type, payload }) => {
  try {
    let result;
    if (type === "history-summary") result = readSnapshotSummary(payload.source, payload.path, payload.id, payload.latest);
    else if (type === "history-item") {
      const path = historyItemFilePath(payload.source, payload.id);
      if (!path) result = null;
      else {
        const key = `${payload.source}:${payload.id}:${fileRevision(path)}`;
        let cached = responses.get(key);
        if (!cached) {
          const snapshot = readRefreshHistoryItem(payload.source, payload.id);
          if (snapshot) {
            cached = Buffer.from(JSON.stringify(snapshot)); responses.set(key, cached); responseBytes += cached.length;
            while (responseBytes > responseLimit && responses.size > 0) {
              const oldest = responses.keys().next().value; responseBytes -= responses.get(oldest).length; responses.delete(oldest);
            }
          }
        } else { responses.delete(key); responses.set(key, cached); }
        result = cached ? { body: Uint8Array.from(cached).buffer } : null;
      }
    } else if (type === "cloud-image") {
      const dataset = await loadGmgsiDataset(payload.item);
      const image = payload.kind === "globe" ? renderGmgsiGlobeTexture(dataset) : renderGmgsiTile(dataset, payload.z, payload.y, payload.x);
      result = { ...image, buffer: Uint8Array.from(image.buffer).buffer };
    } else throw new Error(`Unknown compute task: ${type}`);
    const transfer = result?.body ? [result.body] : result?.buffer instanceof ArrayBuffer ? [result.buffer] : [];
    parentPort.postMessage({ id, result }, transfer);
  } catch (error) { parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
});
