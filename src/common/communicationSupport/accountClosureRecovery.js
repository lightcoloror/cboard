import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// Reuses each platform's existing complete device archive. No login state,
// receipt, family membership or subscription is part of this storage contract.
export function createAccountClosureRecovery({
  storage,
  scope,
  currentAccount,
  buildArchive
}) {
  const key = owner =>
    `account-closure-recovery-v1:${encodeURIComponent(scope)}:${owner}`;
  const fail = () => {
    throw Object.assign(new Error('本机恢复副本未能完整保存，尚未提交注销。'), {
      code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE'
    });
  };
  const digest = bytes => bytesToHex(sha256(bytes));
  function validate(record, owner) {
    if (
      !record ||
      record.owner !== owner ||
      record.version !== 1 ||
      !(record.bytes instanceof Uint8Array) ||
      !record.bytes.length ||
      record.sha256 !== digest(record.bytes)
    )
      fail();
    return record;
  }
  return {
    async preserve({ owner }) {
      if (!owner || currentAccount() !== owner) fail();
      const bytes = await buildArchive();
      if (
        !(bytes instanceof Uint8Array) ||
        !bytes.length ||
        currentAccount() !== owner
      )
        fail();
      const record = { version: 1, owner, bytes, sha256: digest(bytes) };
      try {
        await storage.set(key(owner), record);
        const restored = validate(await storage.get(key(owner)), owner);
        if (restored.sha256 !== record.sha256 || currentAccount() !== owner)
          fail();
      } catch (_) {
        fail();
      }
      return { saved: true };
    },
    async load(owner) {
      // Caller chooses an owner from its current session or locally saved
      // closure receipt; never discover other accounts or show patient content.
      if (!owner) fail();
      return validate(await storage.get(key(owner)), owner).bytes;
    }
  };
}
