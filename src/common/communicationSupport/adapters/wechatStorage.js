function serializeWechatValue(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  const serialized = JSON.stringify(value);
  return typeof serialized === 'string' ? serialized : null;
}

export function createWechatKeyValueStore(wechatApi) {
  if (
    !wechatApi ||
    typeof wechatApi.getStorageSync !== 'function' ||
    typeof wechatApi.setStorageSync !== 'function'
  ) {
    throw new TypeError(
      'A WeChat API with getStorageSync and setStorageSync is required'
    );
  }

  return {
    getItem: key => serializeWechatValue(wechatApi.getStorageSync(key)),
    setItem: (key, value) => wechatApi.setStorageSync(key, value),
    removeItem: key => {
      if (typeof wechatApi.removeStorageSync === 'function') {
        wechatApi.removeStorageSync(key);
      }
    }
  };
}
