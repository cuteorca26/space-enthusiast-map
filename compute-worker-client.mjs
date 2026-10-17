import { Worker } from "node:worker_threads";

// One task at a time per service keeps decoded datasets local and bounds CPU/memory.
export class ComputeWorkerClient {
  constructor(name) { this.name = name; this.worker = null; this.current = null; this.queue = []; this.sequence = 0; }
  run(type, payload, priority = 0) {
    clearTimeout(this.idleTimer);
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.sequence, type, payload, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
      this.pump();
    });
  }
  pump() {
    if (this.current || !this.queue.length) return;
    if (!this.worker) {
      let worker;
      try { worker = new Worker(new URL("./server-compute-worker.mjs", import.meta.url), { name: this.name }); }
      catch (error) {
        this.queue.shift().reject(error);
        queueMicrotask(() => this.pump());
        return;
      }
      this.worker = worker;
      worker.on("message", (message) => {
        if (this.worker !== worker || message.id !== this.current?.id) return;
        const task = this.current; clearTimeout(task.timer); this.current = null;
        if (message.error) task.reject(new Error(message.error)); else task.resolve(message.result);
        worker.unref(); this.pump();
        if (!this.current && process.env.MEMORY_BUDGET_MODE === '1') {
          this.idleTimer = setTimeout(() => { if (!this.current && this.worker === worker) void this.close(); }, 1000);
          this.idleTimer.unref();
        }
      });
      worker.on("error", (error) => this.fail(worker, error));
      worker.on("exit", (code) => { if (this.worker === worker) this.fail(worker, new Error(`${this.name} worker exited (${code})`)); });
    }
    this.current = this.queue.shift();
    this.worker.ref();
    const worker = this.worker;
    this.current.timer = setTimeout(() => this.fail(worker, new Error(`${this.name} task timeout`)), 300000);
    this.current.timer.unref();
    try { worker.postMessage({ id: this.current.id, type: this.current.type, payload: this.current.payload }); }
    catch (error) { this.fail(worker, error); }
  }
  fail(worker, error) {
    if (this.worker !== worker) return;
    this.worker = null;
    if (this.current) { clearTimeout(this.current.timer); this.current.reject(error); this.current = null; }
    void worker.terminate(); this.pump();
  }
  async close() {
    clearTimeout(this.idleTimer);
    const error = new Error(`${this.name} worker closed`), worker = this.worker;
    this.worker = null;
    if (this.current) { clearTimeout(this.current.timer); this.current.reject(error); this.current = null; }
    for (const task of this.queue.splice(0)) task.reject(error);
    if (worker) await worker.terminate();
  }
}
