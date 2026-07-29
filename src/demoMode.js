export const DEMO_MODE_ROUTE = '/demo';
let demoModeOverride = null;

export function setDemoModeOverride(value) {
  demoModeOverride = typeof value === 'boolean' ? value : null;
}

export function isDemoMode({ pathname, env = process.env } = {}) {
  if (pathname === undefined && demoModeOverride !== null) {
    return demoModeOverride;
  }
  const currentPath =
    pathname === undefined
      ? typeof window === 'undefined'
        ? ''
        : window.location.pathname
      : pathname;

  return (
    String(env.REACT_APP_DEMO_MODE || '').toLowerCase() === 'true' ||
    currentPath === DEMO_MODE_ROUTE ||
    currentPath.startsWith(`${DEMO_MODE_ROUTE}/`)
  );
}

export function createMemoryKeyValueStorage() {
  const values = new Map();

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: key => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    }
  };
}

export function createAsyncMemoryStorage() {
  const storage = createMemoryKeyValueStorage();

  return {
    getItem: key => Promise.resolve(storage.getItem(key)),
    setItem: (key, value) => {
      storage.setItem(key, value);
      return Promise.resolve();
    },
    removeItem: key => {
      storage.removeItem(key);
      return Promise.resolve();
    }
  };
}
