import {
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';
const MAX_COMMUNICATION_ITEMS = 20;

function normalizeTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Date.now();
}

function normalizeLabelList(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizeOutputList(value) {
  return Array.isArray(value)
    ? value
        .filter(item => item && item.label)
        .map(item => ({
          ...item,
          label: String(item.label).trim()
        }))
        .filter(item => item.label)
    : [];
}

function normalizeReceiverSequence(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const originalToken = String(item.originalToken || '').trim();
      const label = String(item.label || originalToken).trim();
      const requestedMatchType = String(item.matchType || '').trim();
      const matchType = normalizeReceiverMatchType(requestedMatchType);
      const rawConfidence = Number(item.confidence);
      const confidence = Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, rawConfidence))
        : getReceiverMatchConfidence(matchType);

      return {
        pictogramId: item.pictogramId ? String(item.pictogramId).trim() : null,
        label,
        source: String(item.source || '').trim(),
        boardId: String(item.boardId || '').trim(),
        matchType,
        confidence,
        originalToken
      };
    })
    .filter(item => item.originalToken || item.label);
}

function preserveContractVersion(target, entry) {
  if (
    Number.isInteger(entry && entry.contractVersion) &&
    entry.contractVersion > 0
  ) {
    target.contractVersion = entry.contractVersion;
  }

  return target;
}

function normalizeSavedPhraseEntry(entry) {
  if (!entry || !entry.sentence) {
    return null;
  }

  const output = normalizeOutputList(entry.output);

  if (!output.length) {
    return null;
  }

  return preserveContractVersion(
    {
      sentence: String(entry.sentence).trim(),
      output,
      createdAt: normalizeTimestamp(entry.createdAt)
    },
    entry
  );
}

function normalizeHistoryEntry(entry) {
  if (!entry || !entry.direction) {
    return null;
  }

  const labels = normalizeLabelList(entry.labels);
  const output = normalizeOutputList(entry.output);
  const pictogramSequence = normalizeReceiverSequence(entry.pictogramSequence);
  const candidateSentences = normalizeLabelList(entry.candidateSentences);
  const sentence = entry.sentence ? String(entry.sentence).trim() : '';
  const inputText = entry.inputText ? String(entry.inputText).trim() : '';

  if (!labels.length && !sentence && !inputText) {
    return null;
  }

  const normalized = {
    direction: String(entry.direction),
    sentence,
    inputText,
    labels,
    createdAt: normalizeTimestamp(entry.createdAt)
  };

  if (output.length) {
    normalized.output = output;
  }

  if (pictogramSequence.length) {
    normalized.pictogramSequence = pictogramSequence;
  }

  if (candidateSentences.length) {
    normalized.candidateSentences = candidateSentences;
  }

  return preserveContractVersion(normalized, entry);
}

function dedupeBy(list, getKey) {
  const seen = new Set();

  return list.filter(item => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sortByCreatedAtDesc(list) {
  return list.sort((left, right) => right.createdAt - left.createdAt);
}

export function normalizeCommunicationSavedPhrases(value) {
  return sortByCreatedAtDesc(
    dedupeBy(
      (Array.isArray(value) ? value : [])
        .map(normalizeSavedPhraseEntry)
        .filter(Boolean),
      item => item.sentence
    )
  ).slice(0, MAX_COMMUNICATION_ITEMS);
}

export function normalizeCommunicationHistory(value) {
  return sortByCreatedAtDesc(
    dedupeBy(
      (Array.isArray(value) ? value : [])
        .map(normalizeHistoryEntry)
        .filter(Boolean),
      item =>
        [
          item.direction,
          item.sentence,
          item.inputText,
          item.labels.join('|')
        ].join('::')
    )
  ).slice(0, MAX_COMMUNICATION_ITEMS);
}

export function buildCommunicationSupportSettings(savedPhrases, history) {
  return {
    savedPhrases: normalizeCommunicationSavedPhrases(savedPhrases),
    history: normalizeCommunicationHistory(history)
  };
}

export function normalizeCommunicationSupportSettings(value) {
  const normalized = value || {};
  return buildCommunicationSupportSettings(
    normalized.savedPhrases,
    normalized.history
  );
}

export function mergeCommunicationSupportSettings(localValue, remoteValue) {
  const local = normalizeCommunicationSupportSettings(localValue);
  const remote = normalizeCommunicationSupportSettings(remoteValue);

  return buildCommunicationSupportSettings(
    [...local.savedPhrases, ...remote.savedPhrases],
    [...local.history, ...remote.history]
  );
}
