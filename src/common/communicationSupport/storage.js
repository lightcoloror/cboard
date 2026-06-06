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

function normalizeSavedPhraseEntry(entry) {
  if (!entry || !entry.sentence) {
    return null;
  }

  const output = Array.isArray(entry.output)
    ? entry.output
        .filter(item => item && item.label)
        .map(item => ({
          ...item,
          label: String(item.label).trim()
        }))
    : [];

  if (!output.length) {
    return null;
  }

  return {
    sentence: String(entry.sentence).trim(),
    output,
    createdAt: normalizeTimestamp(entry.createdAt)
  };
}

function normalizeHistoryEntry(entry) {
  if (!entry || !entry.direction) {
    return null;
  }

  const labels = normalizeLabelList(entry.labels);
  const sentence = entry.sentence ? String(entry.sentence).trim() : '';
  const inputText = entry.inputText ? String(entry.inputText).trim() : '';

  if (!labels.length && !sentence && !inputText) {
    return null;
  }

  return {
    direction: String(entry.direction),
    sentence,
    inputText,
    labels,
    createdAt: normalizeTimestamp(entry.createdAt)
  };
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
