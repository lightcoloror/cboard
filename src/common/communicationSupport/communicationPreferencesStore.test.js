import {
  COMMUNICATION_PREFERENCES_STORAGE_KEY,
  createCommunicationPreferencesStore
} from './communicationPreferencesStore';
import { DEFAULT_COMMUNICATION_PREFERENCES } from './communicationPreferences';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: jest.fn(key => (values.has(key) ? values.get(key) : null)),
    setItem: jest.fn((key, value) => values.set(key, value))
  };
}

describe('communication preferences store', () => {
  test.each(['false', 'silent', 'readback', 'receipt'])(
    'does not acknowledge %s failure and permits retry without losing input', mode => {
      const storage = createMemoryStorage();
      const store = createCommunicationPreferencesStore(storage);
      store.save({ fontSize: 'large' });
      const write = storage.setItem.getMockImplementation();
      const read = storage.getItem.getMockImplementation();
      if (mode === 'false') storage.setItem.mockImplementationOnce(() => false);
      if (mode === 'silent') storage.setItem.mockImplementationOnce(() => undefined);
      if (mode === 'receipt') storage.setItem.mockImplementationOnce((...args) => { write(...args); throw new Error('receipt lost'); });
      const next = { ...store.load(), fontSize: 'extra-large' };
      // Install read failure after constructing the desired value.
      if (mode === 'readback') storage.getItem.mockReset().mockImplementationOnce(() => { throw new Error('unreadable'); }).mockImplementation(read);
      expect(() => store.save(next)).toThrow();
      expect(next.fontSize).toBe('extra-large');
      expect(store.save(next).fontSize).toBe('extra-large');
      expect(createCommunicationPreferencesStore(storage).load().fontSize).toBe('extra-large');
    }
  );
  test('normalizes saved preferences and restores them', () => {
    const storage = createMemoryStorage();
    const store = createCommunicationPreferencesStore(storage);

    expect(
      store.save({
        highContrast: true,
        fontSize: 'extra-large',
        gridColumns: 4,
        speechRate: 1.3,
        hiddenBoardIds: ['food', 'food']
      })
    ).toEqual(
      expect.objectContaining({
        highContrast: true,
        fontSize: 'extra-large',
        gridColumns: 4,
        speechRate: 1.3,
        hiddenBoardIds: ['food']
      })
    );
    expect(store.load()).toEqual(
      expect.objectContaining({
        highContrast: true,
        hiddenBoardIds: ['food']
      })
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      COMMUNICATION_PREFERENCES_STORAGE_KEY,
      expect.any(String)
    );
  });

  test('preserves existing fields on update and repairs invalid storage', () => {
    const storage = createMemoryStorage();
    const store = createCommunicationPreferencesStore(storage);
    store.save({ highContrast: true, gridColumns: 2 });

    expect(store.update({ speechRate: 0.7 })).toEqual(
      expect.objectContaining({
        highContrast: true,
        gridColumns: 2,
        speechRate: 0.7
      })
    );

    storage.getItem.mockReturnValueOnce('{invalid');
    expect(store.load()).toEqual(DEFAULT_COMMUNICATION_PREFERENCES);
  });
});
