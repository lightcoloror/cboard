// Keep the existing database/version and profile records. A non-personal local
// generation fences old windows after privacy cleanup; it is never exported.
const generationKey = '__tuyujia_privacy_generation_v1__';
export const LOCAL_DEVICE_DATA_LOCK = 'local-device-data';
export const LOCAL_DATA_CLEAR_START = 'cboard-local-data-clear-started-v1';
export const LOCAL_DATA_CLEAR_SIGNAL = 'cboard-local-data-cleared-v1';
const changed = () => Object.assign(
  new Error('本机协作资料已清除，旧操作已停止；请重新打开页面。'),
  { code: 'CARE_LOCAL_STATE_CHANGED' }
);
const generationOf = value => {
  if (value == null) return 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)))
    throw new Error('本机隐私清理状态无法核对，请保留资料并重试。');
  return Number(value);
};

export function createCareBrowserStorage({
  indexedDb = () => indexedDB,
  keyRange = () => IDBKeyRange,
  lockManager = () => typeof navigator === 'undefined' ? null : navigator.locks
} = {}) {
  let database;
  let initialGeneration;
  let blocked = false;
  async function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDb().open('tuyujia-care-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('profiles');
      request.onerror = () => { database = null; reject(request.error); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { blocked = true; db.close(); database = null; };
        const tx = db.transaction('profiles', 'readonly');
        const read = tx.objectStore('profiles').get(generationKey);
        let value;
        read.onsuccess = () => {
          try { value = generationOf(read.result); } catch (_) { tx.abort(); }
        };
        tx.oncomplete = () => {
          if (initialGeneration === undefined) initialGeneration = value;
          resolve(db);
        };
        tx.onabort = tx.onerror = () => {
          db.close(); database = null;
          reject(tx.error || new Error('本机隐私清理状态无法读取'));
        };
      };
    });
    return database;
  }
  function current(store, action) {
    const read = store.get(generationKey);
    read.onsuccess = () => {
      let matches = false;
      try { matches = generationOf(read.result) === initialGeneration; }
      catch (_) { store.transaction.abort(); return; }
      if (!matches) blocked = true;
      action(!blocked && matches);
    };
  }
  return {
  async list(prefix) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const rows = [];
      const tx = db.transaction('profiles', 'readonly');
      const store = tx.objectStore('profiles');
      current(store, valid => {
        if (!valid) return;
        const request = store.openCursor(keyRange().bound(prefix, prefix + '\uffff'));
        request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.key !== generationKey) rows.push({ key: cursor.key, value: cursor.value });
        if (rows.length > 512) { tx.abort(); return; }
        cursor.continue();
        };
      });
      tx.oncomplete = () => resolve(rows);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机档案无法读取，请先整理或导出资料。'));
    });
  },
  exclusive(key, action, { required = false } = {}) {
    const locks = lockManager();
    if (locks && typeof locks.request === 'function')
      return locks.request(`tuyujia:${key}`, action);
    if (required)
      throw Object.assign(new Error('当前环境无法协调其他已打开页面，请关闭其他页面后通过浏览器设置清理。'), {
        code: 'CARE_LOCAL_EXCLUSION_UNAVAILABLE'
      });
    return action();
  },
  async assertCurrent() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', 'readonly');
      let valid = false;
      current(tx.objectStore('profiles'), value => { valid = value; });
      tx.oncomplete = () => valid ? resolve() : reject(changed());
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机隐私清理状态无法读取'));
    });
  },
  async get(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', 'readonly');
      const store = tx.objectStore('profiles');
      let result = null;
      current(store, valid => {
        if (!valid || key === generationKey) return;
        const request = store.get(key);
        request.onsuccess = () => { result = request.result == null ? null : request.result; };
      });
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机档案无法读取'));
    });
  },
  async set(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', 'readwrite');
      const store = tx.objectStore('profiles');
      let committed = false;
      current(store, valid => {
        if (!valid || key === generationKey) return;
        store.put(value, key);
        committed = true;
      });
      tx.oncomplete = () => committed ? resolve() : reject(changed());
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('离线保存中断'));
    });
  },
  async setIfUnchanged(key, expected, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', 'readwrite');
      const store = tx.objectStore('profiles');
      let committed = false;
      current(store, valid => {
        if (!valid || key === generationKey) return;
        const request = store.get(key);
        request.onsuccess = () => {
          const valueBefore = request.result == null ? null : request.result;
          if (valueBefore !== expected) return;
          store.put(value, key);
          committed = true;
        };
      });
      tx.oncomplete = () => resolve(committed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('离线保存中断'));
    });
  },
  async clear() {
    // Fence this window immediately, including a write awaiting open(). Other
    // windows compare their original generation inside the same write transaction.
    blocked = true;
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', 'readwrite');
      const store = tx.objectStore('profiles');
      let verified = false;
      const read = store.get(generationKey);
      read.onsuccess = () => {
        let next;
        try {
          next = generationOf(read.result) + 1;
          if (!Number.isSafeInteger(next)) throw new Error('generation exhausted');
          store.clear();
          store.put(String(next), generationKey);
          const count = store.count(), check = store.get(generationKey);
          let rows, marker;
          const verify = () => {
            if (rows === undefined || marker === undefined) return;
            verified = rows === 1 && marker === String(next);
            if (!verified) tx.abort();
          };
          count.onsuccess = () => { rows = count.result; verify(); };
          check.onsuccess = () => { marker = check.result; verify(); };
        } catch (_) { tx.abort(); }
      };
      tx.oncomplete = () => verified ? resolve() : reject(new Error('本机协作资料尚未确认清除'));
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机协作资料尚未确认清除'));
    });
  }
  };
}

export const careBrowserStorage = createCareBrowserStorage();
