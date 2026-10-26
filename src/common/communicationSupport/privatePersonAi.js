import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { normalizeResegmentResponse } from './resegmentationContract';

// Request-local mapping is intentionally absent from JSON, object spreading,
// logs and HTTP bodies. Existing drafts reconstruct it after a reload.
const CONTEXT = Symbol('local-person-ai-context');
const MARKER = /⟦P\d+⟧/g;
const failure = () =>
  Object.assign(new Error('AI person references did not preserve the input'), {
    code: 'AI_PERSON_REFERENCE_MISMATCH'
  });

export function attachPrivatePersonContext(
  request,
  { entries, sequence, sourceText } = {}
) {
  if (!entries || !entries.length) return request;
  const value = JSON.parse(JSON.stringify({ entries, sequence, sourceText }));
  Object.defineProperty(request, CONTEXT, { value });
  return request;
}

export function getPrivatePersonRequestIdentity(request) {
  const value = request && request[CONTEXT];
  if (!value && JSON.stringify(request || {}).match(MARKER)) throw failure();
  return value ? bytesToHex(sha256(utf8ToBytes(JSON.stringify(value)))) : '';
}

export function createPrivatePersonMarkers() {
  const entries = [];
  return {
    entries,
    marker(id, name) {
      // Distinct same-name cards remain distinct. Repeated occurrences of the
      // same card share a marker, but are never removed from the sequence.
      let entry = entries.find(item => item.id === id && item.name === name);
      if (!entry) {
        entry = { id, name, marker: `⟦P${entries.length + 1}⟧` };
        entries.push(entry);
      }
      return entry.marker;
    }
  };
}

export function restorePrivatePersonAiResponse(request, response, operation) {
  const context = request && request[CONTEXT];
  if (!context) {
    // A serialized request has lost its local identity mapping. Fail closed
    // rather than present unresolved markers or restore a different person.
    if (JSON.stringify(request || {}).match(MARKER)) throw failure();
    return response;
  }
  const restore = text =>
    String(text).replace(MARKER, marker => {
      const entry = context.entries.find(item => item.marker === marker);
      if (!entry) throw failure();
      return entry.name;
    });
  const matchesSequence = text =>
    JSON.stringify(String(text).match(MARKER) || []) ===
    JSON.stringify(context.sequence);
  if (operation === 'communication-resegment') {
    const normalized = normalizeResegmentResponse(request.text, response);
    if (!normalized || !matchesSequence(normalized.sourceText)) throw failure();
    // A marker must remain a single token; never put a guessed split of a
    // person's name through matching or public backfill after restoration.
    if (
      normalized.tokens.some(
        token => /[⟦⟧]/.test(token) && !/^⟦P\d+⟧$/.test(token)
      )
    )
      throw failure();
    const result = normalizeResegmentResponse(context.sourceText, {
      tokens: normalized.tokens.map(restore)
    });
    if (!result) throw failure();
    return { ...result, provider: response.provider };
  }
  const candidates = (response && Array.isArray(response.candidates)
    ? response.candidates
    : []
  )
    .filter(text => typeof text === 'string' && matchesSequence(text))
    .map(restore);
  if (!candidates.length) throw failure();
  return { ...response, candidates };
}
