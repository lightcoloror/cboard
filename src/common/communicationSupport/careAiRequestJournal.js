import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const PREFIX = 'care-ai-request-v1:';
const digest = value => bytesToHex(sha256(utf8ToBytes(value)));
const storageError = () =>
  Object.assign(new Error('Unable to preserve AI request identity'), {
    code: 'AI_REQUEST_STORAGE_UNAVAILABLE'
  });
const inputChangedError = () =>
  Object.assign(new Error('The original AI request context has changed'), {
    code: 'AI_REQUEST_INPUT_CHANGED'
  });

// Match JSON transport semantics while removing irrelevant object-key order.
// Array order, repeated words and punctuation remain significant.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonical(value[key]);
        return result;
      }, Object.create(null));
  }
  return value;
}

export function createCareAiRequestJournal({ storage }) {
  return {
    prepare(input) {
      try {
        const scope = {};
        for (const field of [
          'origin',
          'accountId',
          'familyId',
          'profileId',
          'fundingId'
        ]) {
          scope[field] = String(input[field] || '').trim();
          if (field === 'origin')
            scope[field] = scope[field].replace(/\/+$/, '');
          if (field !== 'familyId' && !scope[field]) throw storageError();
        }
        if (
          !['communication-sentences', 'communication-resegment'].includes(
            input.operation
          )
        )
          throw storageError();
        const body = JSON.parse(JSON.stringify(input.body));
        const localIdentity =
          typeof input.localIdentity === 'string' && input.localIdentity
            ? { localIdentity: input.localIdentity }
            : {};
        const fingerprint = digest(
          JSON.stringify(
            canonical({
              scope,
              operation: input.operation,
              body,
              ...localIdentity
            })
          )
        );
        // A background dictionary sync or image confirmation is not a fresh
        // request by the user. Keep the resegmentation intent tied to its text;
        // still fingerprint the complete body to reject changed context safely.
        const identityBody =
          input.operation === 'communication-resegment' &&
          typeof body.text === 'string'
            ? { text: body.text }
            : body;
        const identity = digest(
          JSON.stringify(
            canonical({
              scope,
              operation: input.operation,
              body: identityBody,
              ...localIdentity
            })
          )
        );
        // Deterministic identity removes the read/create race across tabs and
        // survives reload or lost metadata. Never age out an unknown request
        // into a fresh paid call. Explicit new-generation UI is not part of this path.
        const requestId = `cai_${identity}`;
        const key = PREFIX + identity;
        const existing = storage.getItem(key);
        if (existing) {
          const record = JSON.parse(existing);
          if (
            record.version !== 1 ||
            record.requestId !== requestId ||
            !record.fingerprint
          )
            throw storageError();
          if (record.fingerprint !== fingerprint) throw inputChangedError();
        } else {
          storage.setItem(
            key,
            JSON.stringify({
              version: 1,
              fingerprint,
              requestId,
              state: 'unknown',
              createdAt: Date.now()
            })
          );
        }
        // Some adapters can silently fail a write. Read-back is required before
        // contacting the provider. Store no text, token, response or raw scope.
        const saved = JSON.parse(storage.getItem(key) || 'null');
        if (
          !saved ||
          saved.requestId !== requestId ||
          saved.fingerprint !== fingerprint
        )
          throw storageError();
        return { requestId, scope, fingerprint, key };
      } catch (error) {
        if (error.code === 'AI_REQUEST_INPUT_CHANGED') throw error;
        throw storageError();
      }
    },
    observe(ticket, { status, code } = {}) {
      const saved = JSON.parse(storage.getItem(ticket.key) || 'null');
      if (!saved || saved.requestId !== ticket.requestId) throw storageError();
      const complete =
        (status >= 200 && status < 300) ||
        code === 'AI_REQUEST_ALREADY_COMPLETED';
      // Observations never rotate or delete the identity, even after errors.
      storage.setItem(
        ticket.key,
        JSON.stringify({
          ...saved,
          state: complete ? 'completed' : 'unknown',
          updatedAt: Date.now()
        })
      );
    }
  };
}
