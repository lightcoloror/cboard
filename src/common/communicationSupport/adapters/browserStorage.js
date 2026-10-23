const personalImagesKey = /cboard_communication_personal_image_preferences$/;

export function createUnavailableKeyValueStore() {
  return {
    getItem: key => {
      if (personalImagesKey.test(key)) throw new Error('熟悉图片存储暂时不可读取，原数据已保留。');
      return null;
    },
    setItem: () => false,
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
          if (personalImagesKey.test(key)) throw new Error('熟悉图片存储暂时不可读取，原数据已保留。');
          if (/(?:cboard_communication_favorite_state_v1|cboard_communication_saved_phrases|cboard_communication_saved_phrase_tombstones|cboard_tuyujia_saved_phrases|care-pending-favorites)$/.test(key)) {
            throw new Error('常用语存储暂时不可读取，未使用旧副本覆盖。');
          }
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          storage.setItem(key, value);
          return true;
        } catch (error) {
          return false;
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
