import { Worker } from 'node:worker_threads';

// Only one HDF5 decoder runs at a time, including requests for different hours.
// Terminating it releases the WebAssembly heap instead of keeping it in the server.
let decoding = Promise.resolve();
export function readCloudDataset(item, filePath, options = {}) {
  const task = decoding.then(() => decode(item, filePath, options));
  decoding = task.catch(() => {});
  return task;
}

function decode(item, filePath, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./cloud-dataset-worker.mjs', import.meta.url), {
      workerData: { item, filePath, options },
    });
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Cloud source decoding timed out')), 90_000);
    async function finish(error, dataset) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      await worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(dataset);
    }
    worker.once('message', dataset => finish(null, dataset));
    worker.once('error', error => finish(error));
    worker.once('exit', code => {
      if (!settled) finish(new Error(`Cloud decoder exited without a result (${code})`));
    });
  });
}
