// Small hosts keep one source's working cache at a time. Saved files stay intact.
export class MemoryBudgetQueue {
  constructor({ enabled = false, release = () => {} } = {}) {
    this.enabled = enabled;
    this.release = release;
    this.tail = Promise.resolve();
    this.group = null;
  }

  run(group, operation, { fresh = false } = {}) {
    if (!this.enabled || !group) return Promise.resolve().then(operation);
    const task = this.tail.then(async () => {
      if (fresh || this.group !== group) await this.release();
      this.group = group;
      return operation();
    });
    this.tail = task.then(() => {}, () => {});
    return task;
  }
}

export function dataResourceGroup(path) {
  const groups = [
    ['/api/restrictions', 'notam'], ['/api/hydropac', 'hydropac'],
    ['/api/msa-warnings', 'msa'], ['/api/navarea-warnings', 'navarea'],
    ['/api/launches', 'launch'], ['/api/satellites', 'satellite'],
    ['/api/cloud-satellite', 'cloud'], ['/api/ballistics/', 'ballistics'],
    ['/api/refresh-history/item', 'history'],
  ];
  return groups.find(([prefix]) => path.startsWith(prefix))?.[1] || null;
}
