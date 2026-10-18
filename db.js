// Tiny IndexedDB wrapper. All data stays on the device.
const DB = (() => {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('healthtracker', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('entries', { keyPath: 'id', autoIncrement: true }).createIndex('ts', 'ts');
      d.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    addEntry: e => tx('entries', 'readwrite', s => s.add(e)),
    updateEntry: e => tx('entries', 'readwrite', s => s.put(e)),
    deleteEntry: id => tx('entries', 'readwrite', s => s.delete(id)),
    allEntries: async () => (await tx('entries', 'readonly', s => s.getAll())).sort((a, b) => a.ts - b.ts),
    getSetting: async (k, def) => (await tx('kv', 'readonly', s => s.get(k))) ?? def,
    setSetting: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
  };
})();
