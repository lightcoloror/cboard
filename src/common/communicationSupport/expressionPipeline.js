import { generateCommunicationCandidateSentences } from './phraseSuggestions';

export const EXPRESSION_PIPELINE_CONTRACT_VERSION = 1;
export const DEFAULT_EXPRESSION_CANDIDATE_COUNT = 4;

function normalizeExpressionOutput(output) {
  return (Array.isArray(output) ? output : [])
    .filter(item => item && String(item.label || '').trim())
    .map(item => ({
      ...item,
      label: String(item.label).trim()
    }));
}

function normalizeSelectedIndex(candidateSentences, selectedIndex) {
  if (
    Number.isInteger(selectedIndex) &&
    selectedIndex >= 0 &&
    selectedIndex < candidateSentences.length
  ) {
    return selectedIndex;
  }

  return 0;
}

function normalizeCandidateCount(value) {
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_EXPRESSION_CANDIDATE_COUNT;
}

function assertContractVersion(value) {
  const version =
    value === undefined || value === null
      ? EXPRESSION_PIPELINE_CONTRACT_VERSION
      : value;

  if (version !== EXPRESSION_PIPELINE_CONTRACT_VERSION) {
    throw new TypeError('Unsupported expression pipeline version: ' + version);
  }

  return version;
}

export function buildExpressionOutputSignature(output) {
  return JSON.stringify(
    normalizeExpressionOutput(output).map(item => [
      String(item.id || item.keyPath || ''),
      item.label
    ])
  );
}

export function createExpressionPipelineInput(
  output,
  candidateCount = DEFAULT_EXPRESSION_CANDIDATE_COUNT
) {
  return {
    contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
    output: normalizeExpressionOutput(output),
    candidateCount: normalizeCandidateCount(candidateCount)
  };
}

export function runExpressionPipeline(input = {}) {
  const contractVersion = assertContractVersion(input.contractVersion);
  const outputSnapshot = normalizeExpressionOutput(input.output);
  const labels = outputSnapshot.map(item => item.label);
  const candidateCount = normalizeCandidateCount(input.candidateCount);

  return {
    contractVersion,
    outputSignature: buildExpressionOutputSignature(outputSnapshot),
    outputSnapshot,
    candidateSentences: labels.length
      ? generateCommunicationCandidateSentences(labels, candidateCount)
      : [],
    selectedIndex: 0
  };
}

export function buildExpressionLoopState(
  output,
  candidateCount = DEFAULT_EXPRESSION_CANDIDATE_COUNT
) {
  return runExpressionPipeline(
    createExpressionPipelineInput(output, candidateCount)
  );
}

export function buildExpressionLoopStateFromSavedPhrase(
  entry,
  candidateCount = DEFAULT_EXPRESSION_CANDIDATE_COUNT
) {
  assertContractVersion(entry && entry.contractVersion);
  const normalizedCandidateCount = normalizeCandidateCount(candidateCount);
  const state = buildExpressionLoopState(
    entry && entry.output,
    normalizedCandidateCount
  );
  const sentence = String((entry && entry.sentence) || '').trim();

  if (!sentence) {
    return state;
  }

  return {
    ...state,
    candidateSentences: [
      sentence,
      ...state.candidateSentences.filter(candidate => candidate !== sentence)
    ].slice(0, normalizedCandidateCount)
  };
}

export function selectExpressionCandidate(state, selectedIndex) {
  assertContractVersion(state && state.contractVersion);
  const candidateSentences = state.candidateSentences || [];

  return {
    ...state,
    contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
    selectedIndex: normalizeSelectedIndex(candidateSentences, selectedIndex)
  };
}

export function getSelectedExpressionSentence(state) {
  assertContractVersion(state && state.contractVersion);
  const candidateSentences = state.candidateSentences || [];

  if (!candidateSentences.length) {
    return '';
  }

  return candidateSentences[
    normalizeSelectedIndex(candidateSentences, state.selectedIndex)
  ];
}

export function buildExpressionSavedPhraseEntry(state) {
  const sentence = getSelectedExpressionSentence(state);
  const output = normalizeExpressionOutput(state.outputSnapshot);

  if (!sentence || !output.length) {
    return null;
  }

  return {
    contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
    sentence,
    output
  };
}

export function buildExpressionHistoryEntry(state) {
  const savedPhrase = buildExpressionSavedPhraseEntry(state);

  if (!savedPhrase) {
    return null;
  }

  return {
    contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
    direction: 'express',
    sentence: savedPhrase.sentence,
    labels: savedPhrase.output.map(item => item.label),
    output: savedPhrase.output,
    candidateSentences: [...state.candidateSentences]
  };
}
