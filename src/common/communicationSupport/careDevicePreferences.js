import { createCommunicationPreferencesStore } from './communicationPreferencesStore';
import { normalizeCommunicationPreferences } from './communicationPreferences';

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
      fontSize: flags.fontSize ? local.fontSize : old.fontSize ?? base.fontSize ?? local.fontSize,
      gridColumns: flags.gridColumns ? local.gridColumns : old.gridColumns ?? base.cardDensity ?? local.gridColumns,
      speechRate: flags.speechRate || legacySpeechPending() ? local.speechRate : base.speechRate ?? local.speechRate
    });
  }
  function save(value) {
    const expectedScope = scope(), before = load();
    const flags = scoped() ? { ...overrides() } : null;
    const next = device.save(value);
    if (scope() !== expectedScope) throw new Error('当前档案已切换，请重新打开设置。');
    if (flags) {
      for (const field of ['fontSize', 'gridColumns', 'speechRate']) if (before[field] !== next[field]) flags[field] = true;
      const serialized = JSON.stringify(flags);
      if (storage.setItem(CARE_DEVICE_OVERRIDES_KEY, serialized) === false ||
          JSON.stringify(overrides()) !== serialized) throw new Error('设备设置标记尚未核对保存，请重试。');
    }
    if (scope() !== expectedScope) throw new Error('当前档案已切换，请重新打开设置。');
    return next;
  }
  return { load, save, update: changes => save({ ...load(), ...changes }) };
}
