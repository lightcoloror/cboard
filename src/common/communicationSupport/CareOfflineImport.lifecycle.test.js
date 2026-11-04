import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import CareOfflineImport from './CareOfflineImport';
import { previewCareArchive } from './careArchiveImport';
import { exportCareDeviceArchive } from './careDeviceArchive';
import { encryptPrivateArchive } from './privateArchiveEncryption';
import { invalidateImageOperations } from './imageOperationEpoch';

jest.mock('./careArchiveImport', () => ({ previewCareArchive: jest.fn() }));
jest.mock('./careDeviceArchive', () => ({ exportCareDeviceArchive: jest.fn() }));
jest.mock('./privateArchiveEncryption', () => ({ encryptPrivateArchive: jest.fn() }));

// Component/port tests: real React handlers, controlled archive/crypto completion.
// They do not establish real KDF, native picker, SDK, or phone lifecycle behavior.
// The frozen baseline is expected to fail the successful stale continuations,
// privacy/page/session changes and same-tick duplicate-operation cases. Ordinary
// success/cancel and unmounted rejected promises are compatibility checks; their
// passing alone must not be described as a reproduced lifecycle defect.
describe('offline Care import/export lifecycle through the existing buttons', () => {
  let host, mounted, runtime, who, active, pageVersion, invalidations;
  const importedBytes = new Uint8Array([1, 2, 3]);
  const exportedBytes = new Uint8Array([4, 5, 6]);
  const encryptedBytes = new Uint8Array([7, 8, 9]);
  const preview = {
    restore: true, profileId: 'synthetic-patient', familyId: 'synthetic-family',
    boardCount: 1, tileCount: 2, media: [], resources: []
  };
  const ui = {
    Box: 'div', Text: 'p', Button: 'button',
    Input: ({ onValue, ...props }) => (
      <input {...props} onChange={event => onValue(event.target.value)} />
    )
  };
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
  const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text);
  const importButton = () => button('选择同一患者的加密备份');
  const exportButton = () => button('再次加密导出本机资料');
  const click = async node => { await act(async () => { Simulate.click(node); await flush(); }); };
  async function settle(pending, value, error = false) {
    await act(async () => {
      if (error) pending.reject(value); else pending.resolve(value);
      await flush();
    });
  }
  function hidePage() {
    active = false;
    pageVersion += 1;
    [...invalidations].forEach(notify => notify());
  }
  function showPage() { active = true; pageVersion += 1; }
  function unmount() {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    mounted = false;
  }
  async function render() {
    await act(async () => {
      ReactDOM.render(<CareOfflineImport runtime={runtime} ui={ui} />, host);
      mounted = true;
      await flush();
    });
    await act(async () => {
      Simulate.change(host.querySelector('input'), { target: { value: 'Synthetic-local-only-password' } });
      await flush();
    });
  }

  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    mounted = false; who = null; active = true; pageVersion = 0; invalidations = new Set();
    previewCareArchive.mockReset().mockResolvedValue(preview);
    exportCareDeviceArchive.mockReset().mockResolvedValue(exportedBytes);
    encryptPrivateArchive.mockReset().mockImplementation(async ({ randomBytes }) => {
      await randomBytes(40);
      return encryptedBytes;
    });
    runtime = {
      identity: () => who,
      chooseArchive: jest.fn(async () => importedBytes),
      confirm: jest.fn(async () => true),
      restoreOffline: jest.fn(async () => {}),
      offlineArchive: jest.fn(async () => ({
        identity: { profileId: 'synthetic-patient', familyId: 'synthetic-family' },
        snapshot: { resources: {}, media: {} }
      })),
      randomBytes: jest.fn(async length => new Uint8Array(length).fill(3)),
      saveArchive: jest.fn(async () => {}),
      // This port represents page visibility only. Account identity and the real
      // shared cleanup epoch deliberately remain independent of this substitute.
      captureOperationContext: () => {
        const version = pageVersion;
        return {
          isCurrent: () => active && version === pageVersion,
          onInvalidate: notify => {
            invalidations.add(notify);
            return () => invalidations.delete(notify);
          }
        };
      }
    };
  });
  afterEach(() => {
    if (mounted) unmount();
    host.remove();
  });

  test('ordinary explicit import and export still use the chosen complete content', async () => {
    await render();
    await click(importButton());
    expect(previewCareArchive).toHaveBeenCalledWith(importedBytes, null, 'Synthetic-local-only-password');
    expect(runtime.confirm).toHaveBeenCalledTimes(1);
    expect(runtime.restoreOffline).toHaveBeenCalledTimes(1);
    expect(runtime.restoreOffline.mock.calls[0][0]).toBe(preview);
    // Successful import clears its password field. Export is another explicit
    // action and therefore receives its own valid synthetic passphrase.
    await act(async () => {
      Simulate.change(host.querySelector('input'), { target: { value: 'Synthetic-export-only-password' } });
      await flush();
    });
    await click(exportButton());
    expect(exportCareDeviceArchive).toHaveBeenCalledTimes(1);
    expect(encryptPrivateArchive.mock.calls[0][0].passphrase).toBe('Synthetic-export-only-password');
    expect(runtime.saveArchive).toHaveBeenCalledTimes(1);
    expect(runtime.saveArchive.mock.calls[0][0]).toBe(encryptedBytes);
    expect(host.textContent).toContain('已加密导出本机恢复的患者资料');
  });

  test('declining the existing restore confirmation has no import side effect', async () => {
    runtime.confirm.mockResolvedValue(false);
    await render(); await click(importButton());
    expect(runtime.confirm).toHaveBeenCalledTimes(1);
    expect(runtime.restoreOffline).not.toHaveBeenCalled();
    expect(importButton().disabled).toBe(false);
  });

  test.each(['file', 'preview', 'confirmation'])(
    'unmount while %s is pending cannot restore a late successful result', async stage => {
      const pending = deferred();
      if (stage === 'file') runtime.chooseArchive.mockReturnValue(pending.promise);
      if (stage === 'preview') previewCareArchive.mockReturnValue(pending.promise);
      if (stage === 'confirmation') runtime.confirm.mockReturnValue(pending.promise);
      await render(); await click(importButton());
      if (stage === 'file') expect(runtime.chooseArchive).toHaveBeenCalledTimes(1);
      if (stage === 'preview') expect(previewCareArchive).toHaveBeenCalledTimes(1);
      if (stage === 'confirmation') expect(runtime.confirm).toHaveBeenCalledTimes(1);
      unmount();
      await settle(pending, stage === 'file' ? importedBytes : stage === 'preview' ? preview : true);
      expect(runtime.restoreOffline).not.toHaveBeenCalled();
      if (stage === 'file') expect(previewCareArchive).not.toHaveBeenCalled();
      if (stage === 'preview') expect(runtime.confirm).not.toHaveBeenCalled();
    }
  );

  test.each(['file', 'preview', 'confirmation'])(
    'unmount while %s is pending safely handles a late rejection', async stage => {
      const pending = deferred();
      if (stage === 'file') runtime.chooseArchive.mockReturnValue(pending.promise);
      if (stage === 'preview') previewCareArchive.mockReturnValue(pending.promise);
      if (stage === 'confirmation') runtime.confirm.mockReturnValue(pending.promise);
      await render(); await click(importButton()); unmount();
      await settle(pending, new Error('synthetic-old-operation-failed'), true);
      expect(runtime.restoreOffline).not.toHaveBeenCalled();
      expect(runtime.saveArchive).not.toHaveBeenCalled();
      expect(host.textContent).toBe('');
    }
  );

  test.each([false, true])(
    'hide while archive preview is pending cancels its late result, rejected=%s', async rejected => {
      const pending = deferred(); previewCareArchive.mockReturnValue(pending.promise);
      await render(); await click(importButton());
      expect(previewCareArchive).toHaveBeenCalledTimes(1);
      act(() => hidePage());
      await settle(pending, rejected ? new Error('synthetic-hidden-preview-error') : preview, rejected);
      expect(runtime.confirm).not.toHaveBeenCalled();
      expect(runtime.restoreOffline).not.toHaveBeenCalled();
      expect(host.textContent).not.toContain('synthetic-hidden-preview-error');
    }
  );

  test('privacy cleanup invalidates an already selected archive before confirmation or import', async () => {
    const pending = deferred(); previewCareArchive.mockReturnValue(pending.promise);
    await render(); await click(importButton());
    act(() => invalidateImageOperations());
    await settle(pending, preview);
    expect(runtime.confirm).not.toHaveBeenCalled();
    expect(runtime.restoreOffline).not.toHaveBeenCalled();
  });

  test('the same account with a different token cannot complete an earlier operation', async () => {
    // Direct component contract: the containing CarePanel also has session
    // checks. This does not pretend a real login occurred in this unit test.
    who = { id: 'synthetic-account', token: 'synthetic-original-session' };
    const pending = deferred(); runtime.confirm.mockReturnValue(pending.promise);
    await render(); await click(importButton());
    expect(runtime.confirm).toHaveBeenCalledTimes(1);
    who = { id: 'synthetic-account', token: 'synthetic-new-session' };
    await settle(pending, true);
    expect(runtime.restoreOffline).not.toHaveBeenCalled();
  });

  test('a hidden operation cannot finish or release a later operation on return', async () => {
    const oldPreview = deferred(), currentPreview = deferred();
    previewCareArchive.mockReturnValueOnce(oldPreview.promise).mockReturnValueOnce(currentPreview.promise);
    await render(); await click(importButton());
    await act(async () => { hidePage(); showPage(); await flush(); });
    expect(importButton().disabled).toBe(false);
    await click(importButton());
    expect(runtime.chooseArchive).toHaveBeenCalledTimes(2);
    await settle(oldPreview, preview);
    expect(runtime.confirm).not.toHaveBeenCalled();
    expect(importButton().disabled).toBe(true);
    const current = { ...preview, tileCount: 3 };
    await settle(currentPreview, current);
    expect(runtime.restoreOffline).toHaveBeenCalledTimes(1);
    expect(runtime.restoreOffline.mock.calls[0][0]).toBe(current);
  });

  test.each(['archive', 'encryption', 'random'])('unmount during export %s cannot save or share a late result', async stage => {
    const pending = deferred();
    if (stage === 'archive') exportCareDeviceArchive.mockReturnValue(pending.promise);
    if (stage === 'encryption') encryptPrivateArchive.mockReturnValue(pending.promise);
    if (stage === 'random') runtime.randomBytes.mockReturnValue(pending.promise);
    await render(); await click(exportButton());
    if (stage === 'archive') expect(exportCareDeviceArchive).toHaveBeenCalledTimes(1);
    if (stage === 'encryption') expect(encryptPrivateArchive).toHaveBeenCalledTimes(1);
    if (stage === 'random') expect(runtime.randomBytes).toHaveBeenCalledTimes(1);
    unmount();
    await settle(pending, stage === 'archive' ? exportedBytes : stage === 'random' ? new Uint8Array(40) : encryptedBytes);
    expect(runtime.saveArchive).not.toHaveBeenCalled();
    if (stage === 'archive') expect(encryptPrivateArchive).not.toHaveBeenCalled();
  });

  test('cleanup during key randomness prevents the old export from saving or reporting success', async () => {
    const pending = deferred(); runtime.randomBytes.mockReturnValue(pending.promise);
    await render(); await click(exportButton());
    expect(runtime.randomBytes).toHaveBeenCalledTimes(1);
    act(() => invalidateImageOperations());
    await settle(pending, new Uint8Array(40));
    expect(runtime.saveArchive).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('已加密导出');
  });

  test.each(['import-import', 'export-export', 'import-export', 'export-import'])(
    'same-tick clicks %s start only the first operation', async order => {
      const pending = deferred();
      runtime.chooseArchive.mockReturnValue(pending.promise);
      runtime.offlineArchive.mockReturnValue(pending.promise);
      await render();
      const [first, second] = order.split('-');
      const pick = kind => kind === 'import' ? importButton() : exportButton();
      await act(async () => {
        ReactDOM.unstable_batchedUpdates(() => {
          Simulate.click(pick(first));
          Simulate.click(pick(second));
        });
        await flush();
      });
      expect(runtime.chooseArchive).toHaveBeenCalledTimes(first === 'import' ? 1 : 0);
      expect(runtime.offlineArchive).toHaveBeenCalledTimes(first === 'export' ? 1 : 0);
      unmount();
      await settle(pending, first === 'import' ? importedBytes : {
        identity: { profileId: 'synthetic-patient', familyId: 'synthetic-family' },
        snapshot: { resources: {}, media: {} }
      });
      expect(runtime.restoreOffline).not.toHaveBeenCalled();
      expect(runtime.saveArchive).not.toHaveBeenCalled();
    }
  );
});
