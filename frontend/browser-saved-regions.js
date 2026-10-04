(function (root) {
  'use strict';
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('space-enthusiast-map', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('saved-regions', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(request.error); };
    });
    return database;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('saved-regions', mode);
      let result;
      operation(tx.objectStore('saved-regions'), value => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Browser storage unavailable'));
    });
  }
  async function all() {
    return transaction('readonly', (store, done) => {
      store.getAll().onsuccess = event => done(event.target.result.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
    });
  }
  function summary(entry) {
    const { item, ...meta } = entry;
    const polygons = item.geometry?.type === 'Polygon' ? [item.geometry.coordinates] : item.geometry?.coordinates || [];
    return {
      ...meta, originalId: item.id, label: item.notamId || item.title || item.id,
      title: item.title || '', region: item.region || '', beginsAt: item.beginsAt || null,
      endsAt: item.endsAt || null, polygonCount: polygons.length,
      vertexCount: polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring) => sum + ring.length - 1, 0), 0),
    };
  }
  async function fingerprint(value) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function request(path, options = {}) {
    const url = new URL(path, location.origin);
    const method = options.method || 'GET';
    if (method === 'GET' && url.pathname.endsWith('/item')) {
      const record = await transaction('readonly', (store, done) => {
        store.get(url.searchParams.get('id')).onsuccess = event => done(event.target.result);
      });
      if (!record) throw new Error('Saved area not found');
      return record;
    }
    if (method === 'DELETE') {
      await transaction('readwrite', (store, done) => { store.delete(url.searchParams.get('id')); done(true); });
      return { records: (await all()).map(summary), deletedId: url.searchParams.get('id') };
    }
    if (method === 'POST') {
      const entries = JSON.parse(options.body || '{}').entries;
      if (!Array.isArray(entries) || !entries.length || entries.length > 10000) throw new Error('Invalid saved-region selection');
      const candidates = await Promise.all(entries.map(async entry => {
        if (!entry?.item || !['Polygon', 'MultiPolygon'].includes(entry.item.geometry?.type)) throw new Error('Invalid saved-region geometry');
        const value = { source: entry.source, refreshedAt: entry.refreshedAt || null, referenceTime: entry.referenceTime || null,
          dataVersion: String(entry.dataVersion || ''), historyDate: String(entry.historyDate || ''), item: entry.item };
        return { ...value, fingerprint: await fingerprint(value), id: crypto.randomUUID(), savedAt: new Date().toISOString() };
      }));
      // Read and merge in one transaction, including concurrent saves from another tab.
      const saved = await transaction('readwrite', (store, done) => {
        store.getAll().onsuccess = event => {
          const byFingerprint = new Map(event.target.result.map(record => [record.fingerprint, record]));
          let added = 0;
          const savedIds = candidates.map(candidate => {
            let record = byFingerprint.get(candidate.fingerprint);
            if (!record) {
              record = candidate;
              store.put(record);
              byFingerprint.set(record.fingerprint, record);
              added++;
            }
            return record.id;
          });
          done({ added, savedIds });
        };
      });
      return { ...saved, records: (await all()).map(summary) };
    }
    return { records: (await all()).map(summary) };
  }
  root.BrowserSavedRegions = { request };
})(globalThis);
