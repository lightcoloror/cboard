import React, { useState } from 'react';
import { previewCareArchive } from './careArchiveImport';
import { exportCareDeviceArchive } from './careDeviceArchive';
import { encryptPrivateArchive } from './privateArchiveEncryption';

export default function CareOfflineImport({ runtime, ui }) {
  const { Box, Text, Input, Button } = ui;
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function restore() {
    setBusy(true);
    try {
      const bytes = await runtime.chooseArchive();
      if (!bytes) return;
      const preview = await previewCareArchive(bytes, null, password);
      setPassword('');
      if (!preview.restore)
        throw new Error(
          '旧格式请从原有本机备份入口预览来源；此入口用于同一患者的换设备备份。'
        );
      if (
        !(await runtime.confirm(
          `离线恢复同一患者的 ${preview.boardCount} 个图板、${
            preview.tileCount
          } 张图卡。不会登录账号、取得家庭授权或上传资料。`
        ))
      )
        return;
      await runtime.restoreOffline(preview);
    } catch (error) {
      setMessage(error.message || '备份恢复失败，原资料保留。');
    } finally {
      setBusy(false);
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
          onClick={async () => {
            setBusy(true);
            try {
              const { identity, snapshot } = await runtime.offlineArchive();
              const bytes = await exportCareDeviceArchive(identity, snapshot);
              await runtime.saveArchive(
                await encryptPrivateArchive({
                  data: bytes,
                  passphrase: password,
                  randomBytes: runtime.randomBytes
                })
              );
              setPassword('');
              setMessage('已加密导出本机恢复的患者资料。');
            } catch (error) {
              setMessage(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          再次加密导出本机资料
        </Button>
      )}
      <Text>{message}</Text>
    </Box>
  );
}
