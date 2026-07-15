import { createCommunicationLocalDataStore } from './localDataStore';
import { createWechatStoragePort } from './storagePorts';

function createMemoryStorage(initialValue = {}) {
  const values = new Map(Object.entries(initialValue));

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

describe('communication support local data store', () => {
  test('persists saved phrases and history through an injected storage port', () => {
    const storage = createMemoryStorage();
    const store = createCommunicationLocalDataStore({
      storage,
      now: () => 123
    });

    store.saveCommunicationPhrase({
      sentence: '我想喝水。',
      output: [{ id: 'water', label: '水' }]
    });
    store.appendCommunicationHistory({
      direction: 'express',
      sentence: '我想喝水。',
      labels: ['水']
    });

    expect(store.loadCommunicationSavedPhrases()[0]).toEqual(
      expect.objectContaining({ sentence: '我想喝水。', createdAt: 123 })
    );
    expect(store.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({ direction: 'express', createdAt: 123 })
    );
  });

  test('keeps reading legacy Tuyujia keys through the neutral repository', () => {
    const storage = createMemoryStorage({
      cboard_tuyujia_saved_phrases: JSON.stringify([
        {
          sentence: '旧常用语',
          output: [{ id: 'legacy', label: '旧图' }],
          createdAt: 1
        }
      ])
    });
    const store = createCommunicationLocalDataStore({ storage });

    expect(store.loadCommunicationSavedPhrases()[0].sentence).toBe('旧常用语');
  });

  test('runs the same repository contract on the WeChat storage adapter', () => {
    const values = new Map();
    const wechatApi = {
      getStorageSync: key => (values.has(key) ? values.get(key) : ''),
      setStorageSync: (key, value) => values.set(key, value),
      removeStorageSync: key => values.delete(key)
    };
    const store = createCommunicationLocalDataStore({
      storage: createWechatStoragePort(wechatApi),
      now: () => 456
    });

    store.overwriteCommunicationSettings({
      savedPhrases: [],
      history: [
        {
          direction: 'receive',
          inputText: '我要喝水',
          labels: ['想', '水']
        }
      ]
    });

    expect(store.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        direction: 'receive',
        inputText: '我要喝水',
        labels: ['想', '水']
      })
    );
  });
});
