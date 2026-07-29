import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { scryptAsync } from '@noble/hashes/scrypt';
import { validatePrivateArchivePassphrase } from './privateArchivePassphrase';

export {
  PRIVATE_ARCHIVE_MAX_PASSPHRASE_LENGTH,
  PRIVATE_ARCHIVE_MIN_PASSPHRASE_LENGTH,
  normalizePrivateArchivePassphrase,
  validatePrivateArchivePassphrase
} from './privateArchivePassphrase';

export const PRIVATE_ARCHIVE_ENVELOPE_FORMAT =
  'picinterpreter-private-device-data-encrypted';
export const PRIVATE_ARCHIVE_ENVELOPE_VERSION = 1;
export const PRIVATE_ARCHIVE_MAX_BYTES = 20 * 1024 * 1024;

const MAGIC = Uint8Array.from([0x50, 0x49, 0x45, 0x32, 0x45, 0x45, 0x30, 0x31]);
const HEADER_SIZE = 52;
const AUTH_TAG_SIZE = 16;
const SALT_SIZE = 16;
const NONCE_SIZE = 24;
const SCRYPT_LOG_N = 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_SIZE = 32;

export class PrivateArchiveEncryptionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PrivateArchiveEncryptionError';
    this.code = code;
  }
}

function toBytes(value, label) {
  const bytes =
    value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : null;
  if (!bytes) {
    throw new PrivateArchiveEncryptionError(
      `${label} must be binary data`,
      'PRIVATE_ARCHIVE_INVALID_BINARY'
    );
  }
  return bytes;
}

function assertPassphrase(value) {
  const result = validatePrivateArchivePassphrase(value);
  if (!result.ok) {
    throw new PrivateArchiveEncryptionError(
      result.message,
      'PRIVATE_ARCHIVE_WEAK_PASSPHRASE'
    );
  }
  return result.passphrase;
}

function hasMagic(bytes) {
  if (bytes.length < MAGIC.length) return false;
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (bytes[index] !== MAGIC[index]) return false;
  }
  return true;
}

export function isEncryptedPrivateArchive(value) {
  try {
    return hasMagic(toBytes(value, 'Encrypted private archive'));
  } catch (error) {
    return false;
  }
}

function buildHeader(salt, nonce) {
  const header = new Uint8Array(HEADER_SIZE);
  header.set(MAGIC, 0);
  header[8] = PRIVATE_ARCHIVE_ENVELOPE_VERSION;
  header[9] = SCRYPT_LOG_N;
  header[10] = SCRYPT_R;
  header[11] = SCRYPT_P;
  header.set(salt, 12);
  header.set(nonce, 12 + SALT_SIZE);
  return header;
}

function parseEnvelope(value) {
  const envelope = toBytes(value, 'Encrypted private archive');
  if (
    envelope.length < HEADER_SIZE + AUTH_TAG_SIZE + 1 ||
    envelope.length > PRIVATE_ARCHIVE_MAX_BYTES ||
    !hasMagic(envelope)
  ) {
    throw new PrivateArchiveEncryptionError(
      'Private archive is not an encrypted PicInterpreter backup',
      'PRIVATE_ARCHIVE_INVALID_FORMAT'
    );
  }
  if (envelope[8] !== PRIVATE_ARCHIVE_ENVELOPE_VERSION) {
    throw new PrivateArchiveEncryptionError(
      'Private archive encryption version is not supported',
      'PRIVATE_ARCHIVE_UNSUPPORTED_VERSION'
    );
  }
  if (
    envelope[9] !== SCRYPT_LOG_N ||
    envelope[10] !== SCRYPT_R ||
    envelope[11] !== SCRYPT_P
  ) {
    throw new PrivateArchiveEncryptionError(
      'Private archive key derivation parameters are not supported',
      'PRIVATE_ARCHIVE_UNSUPPORTED_KDF'
    );
  }
  return {
    header: envelope.slice(0, HEADER_SIZE),
    salt: envelope.slice(12, 12 + SALT_SIZE),
    nonce: envelope.slice(12 + SALT_SIZE, HEADER_SIZE),
    ciphertext: envelope.slice(HEADER_SIZE)
  };
}

async function deriveKey(passphrase, salt) {
  return scryptAsync(passphrase, salt, {
    N: 2 ** SCRYPT_LOG_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: KEY_SIZE,
    asyncTick: 8,
    maxmem: 64 * 1024 * 1024
  });
}

export async function encryptPrivateArchive({ data, passphrase, randomBytes }) {
  const plaintext = toBytes(data, 'Private archive');
  if (
    !plaintext.length ||
    plaintext.length + HEADER_SIZE + AUTH_TAG_SIZE > PRIVATE_ARCHIVE_MAX_BYTES
  ) {
    throw new PrivateArchiveEncryptionError(
      'Private archive must be non-empty and no larger than 20 MiB',
      'PRIVATE_ARCHIVE_INVALID_SIZE'
    );
  }
  if (typeof randomBytes !== 'function') {
    throw new PrivateArchiveEncryptionError(
      'A platform cryptographic random source is required',
      'PRIVATE_ARCHIVE_RANDOM_UNAVAILABLE'
    );
  }
  const normalizedPassphrase = assertPassphrase(passphrase);
  const randomness = toBytes(
    await randomBytes(SALT_SIZE + NONCE_SIZE),
    'Private archive randomness'
  );
  if (randomness.length !== SALT_SIZE + NONCE_SIZE) {
    throw new PrivateArchiveEncryptionError(
      'Platform cryptographic random source returned the wrong length',
      'PRIVATE_ARCHIVE_RANDOM_INVALID'
    );
  }
  const salt = randomness.slice(0, SALT_SIZE);
  const nonce = randomness.slice(SALT_SIZE);
  const header = buildHeader(salt, nonce);
  const key = await deriveKey(normalizedPassphrase, salt);
  try {
    const ciphertext = xchacha20poly1305(key, nonce, header).encrypt(plaintext);
    const envelope = new Uint8Array(header.length + ciphertext.length);
    envelope.set(header, 0);
    envelope.set(ciphertext, header.length);
    return envelope;
  } finally {
    key.fill(0);
  }
}

export async function decryptPrivateArchive({ data, passphrase }) {
  const normalizedPassphrase = assertPassphrase(passphrase);
  const parsed = parseEnvelope(data);
  const key = await deriveKey(normalizedPassphrase, parsed.salt);
  try {
    return xchacha20poly1305(key, parsed.nonce, parsed.header).decrypt(
      parsed.ciphertext
    );
  } catch (error) {
    throw new PrivateArchiveEncryptionError(
      'Private archive password is incorrect or the backup was changed',
      'PRIVATE_ARCHIVE_DECRYPTION_FAILED'
    );
  } finally {
    key.fill(0);
  }
}
