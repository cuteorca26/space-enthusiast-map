import { realpathSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import h5wasm from 'h5wasm/node';
import { readCloudNavigation } from './cloud-navigation.mjs';
import { buildGmgsiInvalidMask } from './cloud-quality.mjs';

const { item, filePath, options } = workerData;
await h5wasm.ready;
const file = new h5wasm.File(realpathSync(filePath), 'r');
let dataset;
try {
  const dataNode = file.get('data');
  const shape = Array.from(dataNode?.shape || []).map(Number);
  const height = shape[shape.length - 2];
  const width = shape[shape.length - 1];
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < (options.minimumWidth ?? 4000) || height < (options.minimumHeight ?? 2000)) {
    throw new Error(`unexpected data dimensions ${shape.join('x') || 'unknown'}`);
  }
  const data = dataNode.value;
  if (!ArrayBuffer.isView(data) || data.length !== width * height) {
    throw new Error(`data length ${data?.length || 0} does not match ${width}x${height}`);
  }
  const timeValue = Number(file.get('time').value?.[0]);
  const { latRows, lonColumns } = readCloudNavigation(file, width, height);
  if (lonColumns.length > 1 && lonColumns[0] > lonColumns[1]) lonColumns[0] -= 360;
  for (let column = 1; column < lonColumns.length; column += 1) {
    if (!Number.isFinite(lonColumns[column]) || lonColumns[column] <= lonColumns[column - 1]) {
      throw new Error(`longitude navigation is not strictly increasing at column ${column}`);
    }
  }
  const sourceDate = Number.isFinite(timeValue) ? new Date(timeValue * 1000).toISOString() : item.timeUtc;
  const sourceMs = Date.parse(sourceDate);
  const requestedMs = Date.parse(item.timeUtc || '');
  if (Number.isFinite(sourceMs) && Number.isFinite(requestedMs) && Math.abs(sourceMs - requestedMs) > 30 * 60 * 1000) {
    throw new Error(`source time ${sourceDate} does not match requested hour ${item.hourId}`);
  }
  const quality = buildGmgsiInvalidMask(data, width, height);
  dataset = {
    hourId: item.hourId, sourceDate, fetchedAt: new Date().toISOString(), width, height,
    north: latRows[0] || 72.71540832519531,
    south: latRows[latRows.length - 1] || -72.73677062988281,
    latRows, lonColumns, data,
    dataFillValue: Number(dataNode.attrs?._FillValue?.value?.[0]),
    invalidMask: quality.mask, invalidPixels: quality.invalidPixels, invalidRegions: quality.regions,
  };
} finally {
  file.close();
}
const buffers = [dataset.data, dataset.latRows, dataset.lonColumns, dataset.invalidMask]
  .filter(Boolean).map(value => value.buffer);
parentPort.postMessage(dataset, [...new Set(buffers)]);
