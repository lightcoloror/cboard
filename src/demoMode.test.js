import {
  createAsyncMemoryStorage,
  createMemoryKeyValueStorage,
  isDemoMode,
  setDemoModeOverride
} from './demoMode';

describe('demo mode', () => {
  afterEach(() => {
    setDemoModeOverride(null);
  });

  test('detects the dedicated route or explicit build flag', () => {
    expect(isDemoMode({ pathname: '/demo', env: {} })).toBe(true);
    expect(isDemoMode({ pathname: '/demo/receiver', env: {} })).toBe(true);
    expect(
      isDemoMode({
        pathname: '/',
        env: { REACT_APP_DEMO_MODE: 'true' }
      })
    ).toBe(true);
    expect(isDemoMode({ pathname: '/', env: {} })).toBe(false);
  });

  test('uses the startup override for services without router props', () => {
    setDemoModeOverride(true);
    expect(isDemoMode()).toBe(true);
    setDemoModeOverride(false);
    expect(isDemoMode()).toBe(false);
  });

  test('keeps synchronous demo data in memory only', () => {
    const storage = createMemoryKeyValueStorage();

    storage.setItem('history', '[{"sentence":"我要喝水"}]');
    expect(storage.getItem('history')).toContain('我要喝水');
    storage.clear();
    expect(storage.getItem('history')).toBeNull();
  });

  test('provides the async contract required by redux-persist', async () => {
    const storage = createAsyncMemoryStorage();

    await storage.setItem('persist:root', '{"demo":true}');
    expect(await storage.getItem('persist:root')).toBe('{"demo":true}');
    await storage.removeItem('persist:root');
    expect(await storage.getItem('persist:root')).toBeNull();
  });
});
