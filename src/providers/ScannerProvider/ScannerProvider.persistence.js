import isEqual from 'lodash/isEqual';
import { getStoredState } from 'redux-persist';
import { updateScannerSettings } from './ScannerProvider.actions';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const failure = (message, code = 'SCANNER_PERSISTENCE_FAILED') => Object.assign(new Error(message), { code });
const contextIn = state => JSON.stringify([
  state.app && state.app.userData && (state.app.userData.id || state.app.userData._id || ''),
  state.app && state.app.userData && state.app.userData.authToken,
  state.communicator && state.communicator.activeCommunicatorId
]);

function normalizedSettings(value) {
  if (!value || typeof value.active !== 'boolean' ||
      !Number.isFinite(Number(value.delay)) || Number(value.delay) <= 0 ||
      !['manual', 'automatic'].includes(value.strategy))
    throw failure('扫描设置不完整，请保留编辑内容后重试。');
  return { active: value.active, delay: Number(value.delay), strategy: value.strategy };
}

export const saveVerifiedScannerSettings = (settings, options) => (dispatch, getState, services) => {
  if (!services || !services.verifiedScannerSettings)
    return Promise.reject(failure('本机保存服务未就绪，请保留编辑内容后重试。'));
  return services.verifiedScannerSettings.save(settings, options);
};

// Reuse the store's ordered backend, persist flush and authoritative readback.
// Scanner settings remain in the existing persisted Redux root, not a new key.
export function createVerifiedScannerSettings({ store, persistor, persistence }) {
  let tail = Promise.resolve();
  let attempt = null;

  function save(settings, { expectedSettings, guard = () => true } = {}) {
    let desired;
    try { desired = normalizedSettings(settings); }
    catch (error) { return Promise.reject(error); }
    const expected = clone(expectedSettings === undefined ? store.getState().scanner : expectedSettings);
    const context = contextIn(store.getState());
    const assertCurrent = () => {
      if (!guard() || contextIn(store.getState()) !== context)
        throw failure('账号或档案已切换，旧扫描设置未确认保存。', 'SCANNER_SAVE_CANCELLED');
    };
    const execute = async () => {
      assertCurrent();
      if (!persistor.getState().bootstrapped)
        throw failure('本机资料尚未载入完成，请稍后重试。');
      const current = clone(store.getState().scanner);
      const retry = attempt && attempt.context === context &&
        isEqual(current, attempt.after) &&
        (isEqual(expected, attempt.before) || isEqual(expected, attempt.after)) &&
        (!attempt.verified || isEqual(desired, attempt.after));
      if (!isEqual(current, expected) && !retry)
        throw failure('扫描设置已被其他操作修改，请重新查看后保存。', 'SCANNER_SAVE_CONFLICT');

      assertCurrent();
      // Re-dispatch on retry: flush alone does not retry a previously failed write.
      store.dispatch(updateScannerSettings(desired));
      const after = clone(store.getState().scanner);
      if (!isEqual(normalizedSettings(after), desired))
        throw failure('扫描设置未应用，请保留编辑内容后重试。');
      const thisAttempt = { context, before: retry ? attempt.before : expected, after, verified: false };
      attempt = thisAttempt;
      const assertUnchanged = () => {
        assertCurrent();
        if (!isEqual(store.getState().scanner, after))
          throw failure('保存期间扫描设置已改变，未覆盖后续修改。', 'SCANNER_SAVE_CONFLICT');
      };
      try {
        await persistor.flush();
        assertUnchanged();
        // Do not fall back to or migrate an older localStorage root on failure.
        const stored = await getStoredState({ ...persistence.rootConfig, storage: persistence.strictStorage });
        assertUnchanged();
        if (!stored || contextIn(stored) !== context || !isEqual(stored.scanner, after))
          throw failure('本机保存后核对失败，当前编辑仍保留，请重试。');
        thisAttempt.verified = true;
        return true;
      } catch (error) {
        assertUnchanged();
        if (error && error.code) throw error;
        throw failure('本机保存未确认，当前编辑仍保留，请重试。');
      }
    };
    const result = tail.then(execute);
    tail = result.catch(() => {});
    return result;
  }
  return { save };
}
