import { createCommunicationRepository, COMMUNICATION_REPOSITORY_SCHEMA_VERSION, COMMUNICATION_STORAGE_KEYS } from './repository';
import { createBrowserKeyValueStore } from './adapters/browserStorage';

test.each([51, 80])('future schema with %i records must not create even a backup or migration write', count => {
  const values = new Map([
    [COMMUNICATION_STORAGE_KEYS.schema, JSON.stringify({ schemaVersion: COMMUNICATION_REPOSITORY_SCHEMA_VERSION + 100 })],
    [COMMUNICATION_STORAGE_KEYS.history, JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: `synthetic-${i}`, sentence: '合成原话', createdAt: i })))],
    [COMMUNICATION_STORAGE_KEYS.receiverRecords, JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: `synthetic-r-${i}`, recordStatus: 'confirmed' })))]
  ]);
  const before = Object.fromEntries(values);
  const storage = { getItem: key => values.get(key), setItem: jest.fn((key, value) => values.set(key, value)), removeItem: jest.fn(key => values.delete(key)) };
  const repository = createCommunicationRepository({ storage });
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
  expect(Object.fromEntries(values)).toEqual(before);
  expect(() => repository.loadCommunicationSavedPhrases()).toThrow('newer schema version');
});

test('actual browser adapter refuses every repository method before any migration or backup', () => {
  localStorage.clear();
  localStorage.setItem(COMMUNICATION_STORAGE_KEYS.schema, JSON.stringify({ schemaVersion: 999 }));
  localStorage.setItem(COMMUNICATION_STORAGE_KEYS.history, JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ id: `synthetic-${i}` }))));
  const before = { ...localStorage };
  const write = jest.spyOn(Storage.prototype, 'setItem');
  const remove = jest.spyOn(Storage.prototype, 'removeItem');
  try {
    const repository = createCommunicationRepository({ storage: createBrowserKeyValueStore(window) });
    for (const method of Object.values(repository).filter(value => typeof value === 'function')) {
      expect(method).toThrow(expect.objectContaining({ code: 'COMMUNICATION_SCHEMA_FUTURE' }));
    }
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
  } finally { write.mockRestore(); remove.mockRestore(); localStorage.clear(); }
});

test('unreadable browser schema cannot be mistaken for a missing legacy schema', () => {
  const getItem = jest.fn(() => { throw new Error('denied'); });
  const setItem = jest.fn(), removeItem = jest.fn();
  const storage = createBrowserKeyValueStore({ localStorage: { getItem, setItem, removeItem } });
  expect(() => createCommunicationRepository({ storage })).toThrow('版本暂时无法读取');
  expect(setItem).not.toHaveBeenCalled();
  expect(removeItem).not.toHaveBeenCalled();
});
