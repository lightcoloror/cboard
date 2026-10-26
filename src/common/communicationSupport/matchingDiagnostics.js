import { matchTextToCommunicationTiles } from './symbolMatching';
import { buildCommunicationTileCatalog } from './symbolMatching';
import { getLocalPictogramCandidates } from './pictogramSemantics';
import { isReceiverPunctuation, buildReceiverMeaningAssessment } from './receiverContract';

export const COMMUNICATION_MATCHING_DIAGNOSTIC_MAX_LENGTH = 120;

export const COMMUNICATION_MATCHING_DIAGNOSTIC_EXAMPLES = [
  '我想吃饭',
  '我想喝水谢谢',
  '我要去厕所',
  '妈妈我肚子饿了',
  '今天我很开心',
  '我头痛不舒服',
  '我感冒了很累',
  '我发烧了咳嗽',
  '肚子疼需要吃药',
  '帮我叫医生',
  '我需要休息',
  '你想喝水还是上厕所'
];

function normalizeDiagnosticText(value) {
  return Array.from(String(value || '').trim())
    .slice(0, COMMUNICATION_MATCHING_DIAGNOSTIC_MAX_LENGTH)
    .join('');
}

function readNow(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Date.now();
}

function createDiagnosticItem(match) {
  const catalogItem = match && match.tile;
  const tile = catalogItem && catalogItem.tile;
  const label = catalogItem
    ? catalogItem.displayLabel || tile.label || tile.vocalization
    : '';

  return {
    token: String((match && match.token) || ''),
    sourceSpan: (match && match.sourceSpan) || null,
    personalReference: Boolean(match && match.personalReference),
    matched: Boolean(catalogItem),
    matchType: (match && match.matchType) || 'none',
    pictogramId: catalogItem ? catalogItem.id : null,
    boardId: catalogItem ? catalogItem.boardId : null,
    boardName: catalogItem ? catalogItem.boardName : '',
    label,
    image: tile ? tile.image || '' : '',
    keyPath: tile ? tile.keyPath || '' : '',
    backgroundColor: tile ? tile.backgroundColor || '' : ''
  };
}

export function analyzeCommunicationMatching(text, boards, options = {}) {
  const inputText = normalizeDiagnosticText(text);
  const startedAt = readNow(options.now);
  const result = matchTextToCommunicationTiles(inputText, boards, {
    intl: options.intl,
    correctionMemory: options.correctionMemory,
    ...(Array.isArray(options.preSegmented)
      ? { preSegmented: options.preSegmented }
      : {})
  });
  const elapsedMs = Math.max(0, readNow(options.now) - startedAt);
  const catalog = buildCommunicationTileCatalog(boards, options.intl);
  const items = result.matches.map(match => {
    const item = createDiagnosticItem(match);
    const candidates = match.personalReference ? [] : getLocalPictogramCandidates(match.token, catalog);
    return { ...item, candidateCount: candidates.length,
      candidates: candidates.map(value => ({ sourceId: value.sourceId, relation: value.relation, reason: value.hint })),
      diagnosticCategory: isReceiverPunctuation(match.token) ? 'punctuation'
        : match.personalReference && !match.tile ? 'person-choice'
        : match.tile && match.tile.textOnly ? 'text-reference'
        : !match.tile ? candidates.length ? 'candidate-needs-review' : 'no-reviewed-candidate-in-checked-catalog'
        : 'matched-needs-meaning-check',
      imageAvailability: match.tile && !match.tile.textOnly ? (options.imageStates && options.imageStates[item.pictogramId]) || 'unverified' : 'not-applicable'
    };
  });
  const matchedCount = items.filter(item => item.matched).length;

  return {
    inputText,
    segmentation: result.segmentation,
    items,
    matchedCount,
    totalCount: items.length,
    matchRate: result.matchRate,
    unmatchedTokens: items
      .filter(item => !item.matched)
      .map(item => item.token),
    elapsedMs,
    sourcePreserved: result.segmentation.segments.join('') === inputText,
    meaning: buildReceiverMeaningAssessment(inputText, result.matches),
    correctionCount: Array.isArray(options.corrections) ? options.corrections.length : null
  };
}

// Diagnostic export is opt-in and never includes local image addresses or IDs.
export function redactCommunicationMatchingDiagnostic(report) {
  let text = report.inputText;
  const names = report.items.filter(item => item.personalReference).map(item => item.token).filter(Boolean);
  const redact = value => names.reduce((result, name) => result.split(name).join('[本机人物]'), String(value || ''));
  return {
    inputText: redact(text), engine: report.segmentation.engine, sourcePreserved: report.sourcePreserved,
    elapsedMs: report.elapsedMs, correctionCount: report.correctionCount,
    items: report.items.map(item => ({ token: redact(item.token), category: item.diagnosticCategory,
      sourceSpan: item.sourceSpan, candidateCount: item.candidateCount, imageAvailability: item.imageAvailability }))
  };
}
