import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import validationSchema from './validationSchema';
import { resendVerification } from './SignUp.actions';

export default function ResendVerification({ email }) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(
    () => {
      generation.current += 1;
      setBusy(false);
      setMessage('');
      return () => {
        generation.current += 1;
      };
    },
    [normalized]
  );
  async function request() {
    const run = generation.current;
    if (!validationSchema.fields.email.isValidSync(normalized)) {
      setMessage('请先填写有效的邮箱地址。');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await resendVerification(normalized);
      if (run === generation.current)
        setMessage('请求已受理；若有待验证账号，请查收邮件或稍后重试。');
    } catch (error) {
      if (run !== generation.current) return;
      const status = error?.response?.status;
      const code = error?.response?.data?.error?.code;
      setMessage(
        code === 'MAIL_SERVICE_UNAVAILABLE'
          ? '验证邮件服务暂不可用，请稍后重试。'
          : status === 429
          ? '请求过于频繁，请稍后再试。'
          : '暂时无法受理，请检查网络后重试。'
      );
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }
  return (
    <div>
      <Button type="button" disabled={busy} onClick={request}>
        {busy ? '正在提交重发请求…' : '重新发送验证邮件'}
      </Button>
      {message && <Typography role="status">{message}</Typography>}
    </div>
  );
}
ResendVerification.propTypes = { email: PropTypes.string };
