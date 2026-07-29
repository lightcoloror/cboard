export const PRIVATE_ARCHIVE_MIN_PASSPHRASE_LENGTH = 12;
export const PRIVATE_ARCHIVE_MAX_PASSPHRASE_LENGTH = 256;

export function normalizePrivateArchivePassphrase(value) {
  return typeof value === 'string' ? value.normalize('NFKC') : '';
}

export function validatePrivateArchivePassphrase(value, confirmation) {
  const passphrase = normalizePrivateArchivePassphrase(value);
  const length = Array.from(passphrase).length;
  if (length < PRIVATE_ARCHIVE_MIN_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      code: 'PRIVATE_ARCHIVE_PASSPHRASE_TOO_SHORT',
      message: `恢复密码至少需要 ${PRIVATE_ARCHIVE_MIN_PASSPHRASE_LENGTH} 个字符。`
    };
  }
  if (length > PRIVATE_ARCHIVE_MAX_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      code: 'PRIVATE_ARCHIVE_PASSPHRASE_TOO_LONG',
      message: `恢复密码不能超过 ${PRIVATE_ARCHIVE_MAX_PASSPHRASE_LENGTH} 个字符。`
    };
  }
  if (
    confirmation !== undefined &&
    passphrase !== normalizePrivateArchivePassphrase(confirmation)
  ) {
    return {
      ok: false,
      code: 'PRIVATE_ARCHIVE_PASSPHRASE_MISMATCH',
      message: '两次输入的恢复密码不一致。'
    };
  }
  return { ok: true, passphrase };
}
