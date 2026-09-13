// Transactional IndexedDB avoids partial offline writes and localStorage's small quota.
let database;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('tuyujia-care-v1', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('profiles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = null;
        reject(request.error);
      };
    });
  return database;
}
export const careBrowserStorage = {
  async get(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction('profiles')
        .objectStore('profiles')
        .get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },
  async set(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', 'readwrite');
      tx.objectStore('profiles').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('离线保存中断'));
    });
  }
};
