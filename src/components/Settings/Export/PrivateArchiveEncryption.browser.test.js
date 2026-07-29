import {
  PRIVATE_DEVICE_DATA_CONTENT_TYPE,
  blobToBytes,
  decryptPrivateArchiveBlob,
  encryptPrivateArchiveBlob
} from './PrivateArchiveEncryption.browser';

const PASSPHRASE = 'correct-horse-battery-staple';

function deterministicRandomBytes(length) {
  return Uint8Array.from({ length }, (_value, index) => (index * 13 + 7) % 256);
}

describe('browser private archive encryption adapter', () => {
  test('encrypts and decrypts Blob content without exposing plaintext format', async () => {
    const plaintext = new Blob([
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])
    ]);
    const encrypted = await encryptPrivateArchiveBlob({
      archive: plaintext,
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes
    });

    expect(encrypted.type).toBe(PRIVATE_DEVICE_DATA_CONTENT_TYPE);
    expect(Array.from((await blobToBytes(encrypted)).slice(0, 8))).toEqual(
      Array.from(new TextEncoder().encode('PIE2EE01'))
    );

    const restored = await decryptPrivateArchiveBlob({
      archive: encrypted,
      passphrase: PASSPHRASE
    });
    expect(restored.type).toBe('application/zip');
    expect(await blobToBytes(restored)).toEqual(await blobToBytes(plaintext));
  });
});
