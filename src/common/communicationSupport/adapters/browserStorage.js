export function createUnavailableKeyValueStore() {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
}

export function createBrowserKeyValueStore(browserWindow) {
  const target =
    browserWindow === undefined
      ? typeof window === 'undefined'
        ? null
        : window
      : browserWindow;

  try {
    const storage = target && target.localStorage;

    if (
      !storage ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function'
    ) {
      return createUnavailableKeyValueStore();
    }

    return {
      getItem: key => {
        try {
          const value = storage.getItem(key);
          return value === undefined ? null : value;
        } catch (error) {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          storage.setItem(key, value);
        } catch (error) {
          // Treat runtime storage denial as unavailable storage.
        }
      },
      removeItem: key => {
        try {
          if (typeof storage.removeItem === 'function') {
            storage.removeItem(key);
          }
        } catch (error) {
          // Treat runtime storage denial as unavailable storage.
        }
      }
    };
  } catch (error) {
    return createUnavailableKeyValueStore();
  }
}
