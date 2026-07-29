import {
  PRIVATE_ARCHIVE_ENVELOPE_FORMAT,
  PrivateArchiveEncryptionError,
  decryptPrivateArchive,
  encryptPrivateArchive,
  isEncryptedPrivateArchive,
  validatePrivateArchivePassphrase
} from './privateArchiveEncryption';

const PASSPHRASE = 'correct-horse-电池-staple';

function deterministicRandomBytes(length) {
  return Uint8Array.from({ length }, (_value, index) => (index * 17 + 3) % 256);
}

describe('private archive end-to-end encryption', () => {
  test('uses a stable encrypted format and restores the original bytes', async () => {
    const plaintext = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const encrypted = await encryptPrivateArchive({
      data: plaintext,
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes
    });

    expect(PRIVATE_ARCHIVE_ENVELOPE_FORMAT).toBe(
      'picinterpreter-private-device-data-encrypted'
    );
    expect(isEncryptedPrivateArchive(encrypted)).toBe(true);
    await expect(
      decryptPrivateArchive({ data: encrypted, passphrase: PASSPHRASE })
    ).resolves.toEqual(plaintext);
  });

  test('rejects a wrong password and authenticated-ciphertext changes', async () => {
    const encrypted = await encryptPrivateArchive({
      data: Uint8Array.from([1, 2, 3]),
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes
    });

    await expect(
      decryptPrivateArchive({
        data: encrypted,
        passphrase: 'another-safe-password'
      })
    ).rejects.toMatchObject({ code: 'PRIVATE_ARCHIVE_DECRYPTION_FAILED' });

    const changed = encrypted.slice();
    changed[changed.length - 1] ^= 1;
    await expect(
      decryptPrivateArchive({ data: changed, passphrase: PASSPHRASE })
    ).rejects.toMatchObject({ code: 'PRIVATE_ARCHIVE_DECRYPTION_FAILED' });
  });

  test('rejects plaintext ZIPs and unsupported envelope parameters', async () => {
    await expect(
      decryptPrivateArchive({
        data: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
        passphrase: PASSPHRASE
      })
    ).rejects.toMatchObject({ code: 'PRIVATE_ARCHIVE_INVALID_FORMAT' });

    const encrypted = await encryptPrivateArchive({
      data: Uint8Array.from([1]),
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes
    });
    const unsupported = encrypted.slice();
    unsupported[8] = 2;
    await expect(
      decryptPrivateArchive({ data: unsupported, passphrase: PASSPHRASE })
    ).rejects.toMatchObject({ code: 'PRIVATE_ARCHIVE_UNSUPPORTED_VERSION' });
  });

  test('validates recovery passwords before expensive key derivation', async () => {
    expect(validatePrivateArchivePassphrase('too-short')).toEqual({
      ok: false,
      code: 'PRIVATE_ARCHIVE_PASSPHRASE_TOO_SHORT',
      message: '恢复密码至少需要 12 个字符。'
    });
    expect(
      validatePrivateArchivePassphrase(PASSPHRASE, `${PASSPHRASE}!`)
    ).toEqual({
      ok: false,
      code: 'PRIVATE_ARCHIVE_PASSPHRASE_MISMATCH',
      message: '两次输入的恢复密码不一致。'
    });
    expect(validatePrivateArchivePassphrase(PASSPHRASE, PASSPHRASE)).toEqual({
      ok: true,
      passphrase: PASSPHRASE
    });

    await expect(
      encryptPrivateArchive({
        data: Uint8Array.from([1]),
        passphrase: 'weak',
        randomBytes: deterministicRandomBytes
      })
    ).rejects.toBeInstanceOf(PrivateArchiveEncryptionError);
  });
});
