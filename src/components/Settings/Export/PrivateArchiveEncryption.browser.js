import {
  decryptPrivateArchive,
  encryptPrivateArchive
} from '../../../common/communicationSupport/privateArchiveEncryption';

export const PRIVATE_DEVICE_DATA_CONTENT_TYPE = 'application/octet-stream';

export async function blobToBytes(blob) {
  if (!blob || typeof blob.size !== 'number') {
    throw new TypeError('Private archive must be a Blob');
  }
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error('Blob read failed'));
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(blob);
  });
}

export function browserRandomBytes(length) {
  const cryptoSource = window.crypto || window.msCrypto;
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') {
    throw new Error('Browser cryptographic random source is unavailable');
  }
  const value = new Uint8Array(length);
  cryptoSource.getRandomValues(value);
  return value;
}

export async function encryptPrivateArchiveBlob({
  archive,
  passphrase,
  randomBytes = browserRandomBytes
}) {
  const encrypted = await encryptPrivateArchive({
    data: await blobToBytes(archive),
    passphrase,
    randomBytes
  });
  return new Blob([encrypted], { type: PRIVATE_DEVICE_DATA_CONTENT_TYPE });
}

export async function decryptPrivateArchiveBlob({ archive, passphrase }) {
  const plaintext = await decryptPrivateArchive({
    data: await blobToBytes(archive),
    passphrase
  });
  return new Blob([plaintext], { type: 'application/zip' });
}
