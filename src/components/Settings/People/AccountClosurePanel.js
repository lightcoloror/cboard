import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  TextField
} from '@material-ui/core';
import { createBrowserAccountClosure } from './accountClosureBrowser';
import { accountClosureMessage } from '../../../common/communicationSupport/accountClosure';
import { validatePrivateArchivePassphrase } from '../../../common/communicationSupport/privateArchivePassphrase';

export default function AccountClosurePanel({
  accountId,
  onAccepted,
  client: suppliedClient
}) {
  const [client] = useState(
    () => suppliedClient || createBrowserAccountClosure()
  );
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [entries, setEntries] = useState([]);
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  async function refresh() {
    const recoveries = await client.recoveries();
    if (!mounted.current) return;
    setEntries(recoveries);
    const next = await client.status();
    if (mounted.current) setStatus(next);
  }
  async function run(action) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      if (mounted.current) setMessage(accountClosureMessage(error));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    void run(refresh);
    return () => {
      mounted.current = false;
    };
    // Each account is rendered with a different component key by People.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const confirmed = status && status.status === 'confirmed';
  const showPreview = () =>
    run(async () => {
      const next = await client.preview();
      if (!mounted.current) return;
      setText('');
      setConsent(false);
      setPreview(next);
    });
  const confirm = () =>
    run(async () => {
      if (
        !preview ||
        !preview.canConfirm ||
        !consent ||
        text !== 'delete-account'
      )
        return;
      const next = await client.confirm(preview);
      if (!mounted.current) return;
      setStatus(next);
      setPreview(null);
      const recoveries = await client.recoveries();
      if (!mounted.current) return;
      setEntries(recoveries);
      if (
        next.status === 'confirmed' &&
        accountId &&
        (!client.isCurrentAccount || client.isCurrentAccount(accountId))
      )
        await onAccepted();
    });
  return (
    <section aria-label="账号注销与本机恢复" style={{ padding: 16 }}>
      <h3>账号注销与本机恢复</h3>
      <p>
        注销会删除账号及确认关闭家庭的云端资料。恢复副本仅包含本机可读取且允许导出的资料；受邀协作的其他家庭与已锁定档案不会转为离线副本。
      </p>
      {accountId && !confirmed && (
        <Button
          disabled={busy}
          variant="outlined"
          color="secondary"
          onClick={showPreview}
        >
          查看注销影响范围
        </Button>
      )}
      <Button disabled={busy} onClick={() => run(refresh)}>
        查询注销进度
      </Button>
      {busy && <LinearProgress />}
      {status && (
        <p role="status">
          {status.accountDeleted
            ? '云端注销已完成。可以下载下方本机恢复副本。'
            : confirmed
            ? '注销已受理，云端资料仍在清理。请稍后查询进度。'
            : status.confirmationUnknown
            ? '确认请求结果尚不明确，暂不重复提交。请稍后查询或联系支持。'
            : '已保存查询凭据；尚未确认受理注销。'}
        </p>
      )}
      {message && <p role="alert">{message}</p>}
      {entries.length > 0 && (
        <div>
          <p>
            本机恢复副本独立于云端账号。请设置至少 12
            个字符的恢复密码并妥善保存；换设备时从对应的备份恢复入口导入。
          </p>
          <TextField
            id="closure-recovery-password"
            fullWidth
            label="恢复密码"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          {entries.map(entry => (
            <Button
              key={entry.id}
              disabled={busy}
              onClick={() => {
                const validation = validatePrivateArchivePassphrase(password);
                if (!validation.ok) {
                  setMessage(validation.message);
                  return;
                }
                void run(async () => {
                  await client.downloadRecovery(
                    entry.id,
                    validation.passphrase
                  );
                  if (mounted.current) {
                    setPassword('');
                    setMessage('已生成加密恢复文件，请确认已保存到设备。');
                  }
                });
              }}
            >
              下载{entry.label}
            </Button>
          ))}
        </div>
      )}
      <Dialog
        open={Boolean(preview)}
        onClose={() => {
          if (!busy) setPreview(null);
        }}
        aria-labelledby="closure-title"
      >
        <DialogTitle id="closure-title">确认云端资料删除范围</DialogTitle>
        <DialogContent>
          {preview && (
            <>
              <p>
                将注销当前账号，关闭 {preview.familyIds.length}{' '}
                个家庭，并删除这些家庭的云端档案、图库及相关资料。这个操作不可撤销。
              </p>
              <ul>
                {(preview.families || []).map(family => (
                  <li key={family.familyId}>
                    家庭 {family.familyId}：{family.profileCount} 个患者档案
                  </li>
                ))}
              </ul>
              {(preview.blockers || []).map(blocker => (
                <p role="alert" key={blocker.code}>
                  {accountClosureMessage(blocker)}
                </p>
              ))}
              <p>
                本机副本只包含已保存且仍获授权可读取的资料，不等于完整云端备份。若需要其他云端资料，请先下载。
              </p>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={consent}
                    disabled={busy}
                    onChange={event => setConsent(event.target.checked)}
                  />
                }
                label="我确认上述家庭及云端资料删除范围，并已了解本机副本的范围。"
              />
              <TextField
                id="closure-confirmation-text"
                fullWidth
                label="输入 delete-account 确认"
                value={text}
                disabled={busy}
                onChange={event => setText(event.target.value)}
              />
              {busy && (
                <p role="status">
                  正在保存本机恢复副本并处理请求，请勿关闭页面。
                </p>
              )}
              {message && <p role="alert">{message}</p>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setPreview(null)}>
            取消
          </Button>
          <Button
            color="secondary"
            disabled={
              busy ||
              !preview ||
              !preview.canConfirm ||
              !consent ||
              text !== 'delete-account'
            }
            onClick={confirm}
          >
            保存本机副本并确认注销
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
