import { createCareDevicePreferencesStore, CARE_DEVICE_OVERRIDES_KEY } from './careDevicePreferences';
import { DEFAULT_COMMUNICATION_PREFERENCES } from './communicationPreferences';

function fixture(extra = {}) {
  const values = new Map(); let writes = 0;
  const defaults = { fontSize: 'large', cardDensity: 3, speechRate: 0.7 };
  const options = { storage: { getItem: key => values.get(key), setItem(key, value) { writes++; values.set(key, value); } },
    defaults: () => defaults, scoped: () => true, ...extra };
  return { values, defaults, options, open: () => createCareDevicePreferencesStore(options), writes: () => writes };
}

test('restore only releases this device display/rate overrides and follows later patient defaults', () => {
  const f = fixture(), store = f.open();
  store.save({ ...DEFAULT_COMMUNICATION_PREFERENCES, fontSize: 'extra-large', gridColumns: 2, speechRate: 1.3,
    highContrast: true, candidateAutoplayDelaySeconds: 30, hiddenBoardIds: ['synthetic-board'], onboardingComplete: true });
  const previousPayload = f.values.get('cboard_communication_preferences');
  const actual = store.restorePatientDefaults();
  expect(actual).toMatchObject({ fontSize: 'large', gridColumns: 3, speechRate: 0.7,
    highContrast: true, candidateAutoplayDelaySeconds: 30, hiddenBoardIds: ['synthetic-board'], onboardingComplete: true });
  expect(f.values.get('cboard_communication_preferences')).toBe(previousPayload);
  expect(JSON.parse(f.values.get(CARE_DEVICE_OVERRIDES_KEY))).toMatchObject({ fontSize: false, gridColumns: false, speechRate: false });
  const writes = f.writes(); store.restorePatientDefaults(); expect(f.writes()).toBe(writes);
  Object.assign(f.defaults, { fontSize: 'normal', cardDensity: 4, speechRate: 1 });
  expect(f.open().load()).toMatchObject({ fontSize: 'normal', gridColumns: 4, speechRate: 1 });
  expect([...f.values.keys()].some(key => key.includes('pending'))).toBe(false);
});

test('explicit inheritance supersedes old display hints without cancelling an older shared command', () => {
  const f = fixture({ legacy: () => ({ fontSize: 'extra-large', gridColumns: 2 }), legacySpeechPending: () => true });
  f.values.set('care-pending-speechRate', 'synthetic-existing-command');
  f.open().save({ ...DEFAULT_COMMUNICATION_PREFERENCES, speechRate: 1.3 });
  const result = f.open().restorePatientDefaults();
  expect(result).toMatchObject({ fontSize: 'large', gridColumns: 3, speechRate: 0.7 });
  expect(f.values.get('care-pending-speechRate')).toBe('synthetic-existing-command');
  f.open().update({ fontSize: 'extra-large' });
  expect(f.open().load()).toMatchObject({ fontSize: 'extra-large', gridColumns: 3, speechRate: 0.7 });
});

test.each(['false', 'silent', 'readback', 'receipt'])('restore %s failure is visible and safely retryable', mode => {
  const f = fixture();
  f.open().update({ fontSize: 'extra-large', speechRate: 1.3 });
  let failed = true, committed = false;
  f.options.storage = {
    getItem(key) { if (failed && mode === 'readback' && committed && key === CARE_DEVICE_OVERRIDES_KEY) throw Error('synthetic readback'); return f.values.get(key); },
    setItem(key, value) {
      if (failed && key === CARE_DEVICE_OVERRIDES_KEY) {
        if (mode === 'false') return false;
        if (mode === 'silent') return;
      }
      f.values.set(key, value); committed = true;
      if (failed && mode === 'receipt') throw Error('synthetic receipt lost');
    }
  };
  const store = f.open();
  expect(() => store.restorePatientDefaults()).toThrow();
  failed = false;
  expect(store.restorePatientDefaults()).toMatchObject({ fontSize: 'large', speechRate: 0.7 });
  expect(f.open().load()).toMatchObject({ fontSize: 'large', speechRate: 0.7 });
});

test('unselected or unavailable patient defaults are not replaced with silently guessed shared values', () => {
  for (const extra of [{ scoped: () => false }, { defaults: () => ({}) }]) {
    const f = fixture(extra), store = f.open();
    expect(store.canRestorePatientDefaults()).toBe(false);
    expect(() => store.restorePatientDefaults()).toThrow(/患者默认|档案/);
    expect(f.writes()).toBe(0);
  }
});

test('scope changes while reading defaults prevent the old action from writing into the new profile', () => {
  let scope = 'A', changed = false;
  const f = fixture({ scope: () => scope, defaults: () => { if (changed) scope = 'B'; return { speechRate: 0.7 }; } });
  f.open().update({ speechRate: 1.3 });
  const before = Array.from(f.values.entries()); changed = true;
  expect(() => f.open().restorePatientDefaults()).toThrow(/档案/);
  expect(Array.from(f.values.entries())).toEqual(before);
});
