import { createCommunicationPreferencesStore } from './communicationPreferencesStore';
import { DEFAULT_COMMUNICATION_PREFERENCES, normalizeCommunicationPreferences } from './communicationPreferences';

export const CARE_DEVICE_OVERRIDES_KEY = 'care-display-overrides';
// The existing preference payload remains canonical. This is a scope/merge
// adapter, not a second settings repository or a new synchronization channel.
export function createCareDevicePreferencesStore({ storage, defaults = () => ({}), legacy = () => ({}), legacySpeechPending = () => false, scoped = () => true, scope = () => '' }) {
  const device = createCommunicationPreferencesStore(storage);
  function overrides() {
    const raw = storage.getItem(CARE_DEVICE_OVERRIDES_KEY);
    if (!raw) return {};
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设备设置标记无法读取，请保留当前编辑。');
    return value;
  }
  function load() {
    const local = device.load();
    if (!scoped()) return local;
    const base = defaults() || {}, old = legacy() || {}, flags = overrides();
    return normalizeCommunicationPreferences({ ...local,
      fontSize: flags.fontSize === false ? base.fontSize ?? DEFAULT_COMMUNICATION_PREFERENCES.fontSize
        : flags.fontSize ? local.fontSize : old.fontSize ?? base.fontSize ?? local.fontSize,
      gridColumns: flags.gridColumns === false ? base.cardDensity ?? DEFAULT_COMMUNICATION_PREFERENCES.gridColumns
        : flags.gridColumns ? local.gridColumns : old.gridColumns ?? base.cardDensity ?? local.gridColumns,
      speechRate: flags.speechRate === false ? base.speechRate ?? DEFAULT_COMMUNICATION_PREFERENCES.speechRate
        : flags.speechRate || legacySpeechPending() ? local.speechRate : base.speechRate ?? local.speechRate
    });
  }
  function checkScope(expectedScope) {
    if (scope() !== expectedScope) throw new Error('当前档案已切换，请重新打开设置。');
  }
  function writeOverrides(flags, expectedScope) {
    checkScope(expectedScope);
    const serialized = JSON.stringify(flags);
    if (storage.setItem(CARE_DEVICE_OVERRIDES_KEY, serialized) === false ||
        JSON.stringify(overrides()) !== serialized) throw new Error('设备设置标记尚未核对保存，请重试。');
    checkScope(expectedScope);
  }
  function canRestorePatientDefaults() {
    if (!scoped()) return false;
    const base = defaults();
    return Boolean(base && typeof base === 'object' &&
      ['fontSize', 'cardDensity', 'speechRate'].some(name => Object.prototype.hasOwnProperty.call(base, name)));
  }
  function restorePatientDefaults() {
    const expectedScope = scope();
    if (!canRestorePatientDefaults()) throw new Error('尚未读取当前档案的患者默认，请先打开或同步档案；当前设置保持不变。');
    checkScope(expectedScope);
    const before = overrides();
    // Explicit false opts into inheritance and outranks legacy hints. One verified
    // local key changes; the canonical payload and old shared queue stay intact.
    const next = { ...before, fontSize: false, gridColumns: false, speechRate: false };
    if (JSON.stringify(next) !== JSON.stringify(before)) writeOverrides(next, expectedScope);
    const restored = load();
    checkScope(expectedScope);
    return restored;
  }
  function save(value) {
    const expectedScope = scope(), before = load();
    const flags = scoped() ? { ...overrides() } : null;
    const next = device.save(value);
    checkScope(expectedScope);
    if (flags) {
      for (const field of ['fontSize', 'gridColumns', 'speechRate']) if (before[field] !== next[field]) flags[field] = true;
      writeOverrides(flags, expectedScope);
    }
    checkScope(expectedScope);
    return next;
  }
  return { load, save, update: changes => save({ ...load(), ...changes }), canRestorePatientDefaults, restorePatientDefaults };
}
