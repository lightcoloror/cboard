import { matchTextToCommunicationTiles } from './symbolMatching';

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
  const items = result.matches.map(createDiagnosticItem);
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
    elapsedMs
  };
}
