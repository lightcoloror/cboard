export async function persistAuthenticatedUser(
  page,
  authToken,
  overrides = {}
) {
  const userData = {
    authToken,
    id: 'playwright-private-picture-user',
    email: 'private-picture@example.test',
    name: 'Private picture test',
    locale: 'en-US',
    boards: [],
    communicators: [],
    settings: {},
    ...overrides
  };

  // Let the initial redux-persist rehydration finish before replacing the
  // user record; otherwise its first empty-state write can win this race.
  await page.waitForTimeout(500);
  await page.evaluate(async value => {
    const wait = delay => new Promise(resolve => setTimeout(resolve, delay));
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const updated = await new Promise((resolve, reject) => {
        const openRequest = indexedDB.open('cboard');
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          if (!database.objectStoreNames.contains('cboard_store')) {
            database.close();
            resolve(false);
            return;
          }
          const transaction = database.transaction('cboard_store', 'readwrite');
          const store = transaction.objectStore('cboard_store');
          const readRequest = store.get('persist:root');
          readRequest.onerror = () => reject(readRequest.error);
          readRequest.onsuccess = () => {
            if (!readRequest.result) {
              database.close();
              resolve(false);
              return;
            }
            const root = JSON.parse(readRequest.result);
            const app = JSON.parse(root.app);
            root.app = JSON.stringify({ ...app, userData: value });
            store.put(JSON.stringify(root), 'persist:root');
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(Boolean(readRequest.result));
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
      if (updated) return;
      await wait(100);
    }
    throw new Error('Redux Persist root was not initialized');
  }, userData);
}
