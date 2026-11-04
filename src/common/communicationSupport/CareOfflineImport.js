import React, { useEffect, useRef, useState } from 'react';
import { previewCareArchive } from './careArchiveImport';
import { exportCareDeviceArchive } from './careDeviceArchive';
import { encryptPrivateArchive } from './privateArchiveEncryption';
import { assertCareOperation, captureCareOperation } from './careOperationContext';

export default function CareOfflineImport({ runtime, ui }) {
  const { Box, Text, Input, Button } = ui;
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(null);
  const finish = operation => {
    if (pending.current !== operation) return;
    pending.current = null;
    operation.live = false;
    operation.unsubscribe?.();
    if (mounted.current) setBusy(false);
  };
  useEffect(() => {
    mounted.current = true;
    setBusy(false);
    return () => {
      mounted.current = false;
      if (pending.current) finish(pending.current);
    };
  }, [runtime]);
  function start() {
    // React state is not a synchronous double-click lock.
    if (pending.current) return null;
    const context = runtime.captureOperationContext?.();
    const operation = { live: true, unsubscribe: null };
    operation.isCurrent = captureCareOperation({ identity: () => runtime.identity?.(),
      isCurrent: () => mounted.current && pending.current === operation && operation.live &&
        (!context || context.isCurrent()) });
    operation.assertCurrent = () => assertCareOperation(operation.isCurrent);
    pending.current = operation;
    setBusy(true);
    setMessage('');
    operation.unsubscribe = context?.onInvalidate?.(() => finish(operation));
    if (!operation.isCurrent()) { finish(operation); return null; }
    return operation;
  }
  async function restore() {
    const operation = start();
    if (!operation) return;
    try {
      const bytes = await runtime.chooseArchive();
      operation.assertCurrent();
      if (!bytes) return;
      const preview = await previewCareArchive(bytes, null, password);
      operation.assertCurrent();
      setPassword('');
      if (!preview.restore)
        throw new Error(
          '旧格式请从原有本机备份入口预览来源；此入口用于同一患者的换设备备份。'
        );
      const confirmed = await runtime.confirm(
          `离线恢复同一患者的 ${preview.boardCount} 个图板、${
            preview.tileCount
          } 张图卡。不会登录账号、取得家庭授权或上传资料。`
        );
      operation.assertCurrent();
      if (!confirmed) return;
      await runtime.restoreOffline(preview, { isCurrent: operation.isCurrent });
      operation.assertCurrent();
    } catch (error) {
      if (operation.isCurrent()) setMessage(error.message || '备份恢复失败，原资料保留。');
    } finally {
      finish(operation);
    }
  }
  async function exportArchive() {
    const operation = start();
    if (!operation) return;
    try {
      const { identity, snapshot } = await runtime.offlineArchive({ isCurrent: operation.isCurrent });
      operation.assertCurrent();
      const bytes = await exportCareDeviceArchive(identity, snapshot);
      operation.assertCurrent();
      const encrypted = await encryptPrivateArchive({
        data: bytes,
        passphrase: password,
        randomBytes: async length => {
          operation.assertCurrent();
          const value = await runtime.randomBytes(length);
          operation.assertCurrent();
          return value;
        }
      });
      operation.assertCurrent();
      await runtime.saveArchive(encrypted, { isCurrent: operation.isCurrent });
      operation.assertCurrent();
      setPassword('');
      setMessage('已加密导出本机恢复的患者资料。');
    } catch (error) {
      if (operation.isCurrent()) setMessage(error.message || '备份导出失败，原资料保留。');
    } finally {
      finish(operation);
    }
  }
  return (
    <Box>
      <Text>换设备离线恢复，无需订阅或登录</Text>
      <Input
        type="password"
        value={password}
        onValue={setPassword}
        placeholder="备份密码"
      />
      <Button disabled={busy} onClick={restore}>
        选择同一患者的加密备份
      </Button>
      {runtime.offlineArchive && (
        <Button
          disabled={busy}
          onClick={exportArchive}
        >
          再次加密导出本机资料
        </Button>
      )}
      <Text>{message}</Text>
    </Box>
  );
}
