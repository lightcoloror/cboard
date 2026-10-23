import {
  applyCommunicationContextGuards,
  buildCommunicationTileCatalog,
  createCommunicationOutputFromMatches,
  createTextCommunicationCatalogItem,
  matchTextToCommunicationTiles
} from './symbolMatching';
import {
  applyMissingTokenResolutions,
  filterMissingTokenResolutionsByCorrectionMemory
} from './missingTokens';

import {
  RECEIVER_PIPELINE_CONTRACT_VERSION,
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';
import {
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER,
  getPictogramAttribution
} from './pictogramAttribution';
import { isAutomaticCommunicationCandidateAllowed } from './chineseLexicon';

export {
  RECEIVER_LOW_CONFIDENCE_THRESHOLD,
  RECEIVER_PIPELINE_CONTRACT_VERSION,
  buildReceiverMatchQuality,
  getReceiverMatchConfidence,
  normalizeReceiverMatchType
} from './receiverContract';

function getReceiverItemDisplayLabel(item) {
  if (!item || !item.tile) {
    return '';
  }

  return (
    item.tile.displayLabel ||
    (item.tile.tile && (item.tile.tile.label || item.tile.tile.vocalization)) ||
    ''
  );
}
export function createReceiverReviewId(prefix = 'review') {
  return (
    prefix +
    '_' +
    Math.random()
      .toString(36)
      .slice(2, 10)
  );
}

export function buildReceiverReviewItems(
  matches,
  createId = createReceiverReviewId
) {
  return (matches || []).map(match => ({
    id: createId('review'),
    token: match.token,
    tile: match.tile,
    matchType: match.matchType,
    ...(match.personalReference
      ? { personalReference: true, personCandidates: match.personCandidates }
      : {}),
    ...(match.lookupToken ? { lookupToken: match.lookupToken } : {}),
    ...(match.sourceSpan ? { sourceSpan: match.sourceSpan } : {}),
    ...(match.source ? { source: match.source } : {})
  }));
}

export function buildReceiverLoopState(text, boards, options = {}) {
  const result = matchTextToCommunicationTiles(text, boards, options);
  const initialReviewItems = buildReceiverReviewItems(
    result.matches,
    options.createId
  );
  const missingTokenRecords = Array.isArray(options.missingTokenRecords)
    ? options.missingTokenRecords
    : [];
  const applicableMissingTokenRecords = filterMissingTokenResolutionsByCorrectionMemory(
    missingTokenRecords,
    options.correctionMemory
  );
  const catalog = missingTokenRecords.length
    ? buildCommunicationTileCatalog(boards, options.intl)
    : [];
  const reviewItems = missingTokenRecords.length
    ? applyCommunicationContextGuards(
        applyMissingTokenResolutions(
          initialReviewItems,
          applicableMissingTokenRecords,
          catalog
        ),
        catalog
      )
    : initialReviewItems;
  const matchedCount = reviewItems.filter(item => item.tile).length;

  return {
    inputText: result.inputText,
    segmentation: result.segmentation,
    matches: result.matches,
    reviewItems,
    missingTokens: reviewItems
      .filter(item => !item.tile && !item.personalReference)
      .map(item => item.token),
    outputPreview: buildReceiverOutputPreview(reviewItems),
    matchRate: reviewItems.length
      ? matchedCount / reviewItems.length
      : result.matchRate
  };
}

function createPersistedCatalogItem(sequenceItem, outputItem) {
  const pictogramId = String(sequenceItem.pictogramId || '').trim();
  if (!pictogramId || !outputItem || !outputItem.image) return null;
  const pictogramAttribution =
    getPictogramAttribution(sequenceItem) ||
    getPictogramAttribution(outputItem);

  const displayLabel = String(
    sequenceItem.label ||
      outputItem.label ||
      sequenceItem.originalToken ||
      pictogramId
  ).trim();
  const tile = {
    id: pictogramId,
    label: displayLabel,
    vocalization: String(outputItem.vocalization || displayLabel).trim(),
    image: outputItem.image,
    ...(outputItem.mediaType ? { mediaType: outputItem.mediaType } : {}),
    ...(outputItem.video ? { video: outputItem.video } : {}),
    ...(pictogramAttribution ? { pictogramAttribution } : {})
  };
  if (outputItem.personId) tile.semanticDomain = 'people';
  if (outputItem.keyPath) tile.keyPath = outputItem.keyPath;
  if (outputItem.backgroundColor) {
    tile.backgroundColor = outputItem.backgroundColor;
  }

  return {
    id: pictogramId,
    tile,
    persistedOutput: { ...outputItem },
    ...(pictogramAttribution ? { pictogramAttribution } : {}),
    boardId: String(sequenceItem.boardId || ''),
    boardName: '已保存图片',
    displayLabel,
    labels: [displayLabel],
    synonyms: [],
    excludeTokens: [],
    semanticDomain: outputItem.personId ? 'people' : null
  };
}

export function restoreReceiverLoopState(entry, boards, options = {}) {
  if (
    !entry ||
    entry.direction !== 'receive' ||
    (!Array.isArray(entry.pictogramSequence) && entry.recordStatus !== 'draft')
  ) {
    return null;
  }

  const inputText = String(entry.inputText || '');
  // Storage omits empty sequences: an unfinished text-only draft is still resumable.
  const sequence = (Array.isArray(entry.pictogramSequence)
    ? entry.pictogramSequence
    : []
  ).filter(item => item && (item.originalToken || item.label));
  if (!inputText || (!sequence.length && entry.recordStatus !== 'draft'))
    return null;

  const catalogById = new Map(
    buildCommunicationTileCatalog(boards, options.intl).map(item => [
      item.id,
      item
    ])
  );
  const savedOutput = Array.isArray(entry.output) ? entry.output : [];
  let outputCursor = 0;
  const createId =
    typeof options.createId === 'function'
      ? options.createId
      : createReceiverReviewId;
  let reviewItems = sequence.map(item => {
    const pictogramId = String(item.pictogramId || '').trim();
    const token = String(item.originalToken || item.label || '');
    const outputIndex = Number.isInteger(item.preparedOutputIndex) ? item.preparedOutputIndex : outputCursor;
    const saved = savedOutput[outputIndex];
    if (pictogramId || item.textOnly) outputCursor += 1;
    const aligned = saved && (item.textOnly
      ? saved.textOnly && saved.label === token
      : String(saved.id) === pictogramId);
    let tile =
      item.textOnly === true
        ? createTextCommunicationCatalogItem(
            token,
            aligned ? saved.id : `text-restored-${createId('text')}`
          )
        : pictogramId
        ? (aligned ? createPersistedCatalogItem(item, saved)
          : savedOutput.length ? null : catalogById.get(pictogramId))
        : null;
    if (tile && item.textOnly && aligned) tile.persistedOutput = { ...saved };

    // Drafts may outlive a dictionary repair. Recheck automatic choices while
    // preserving manual order, explicit choices, text and completed history.
    const matchType = normalizeReceiverMatchType(item.matchType);
    const explicitChoice = ['manual', 'corrected'].includes(item.source);
    const automatic =
      !explicitChoice &&
      ['exact', 'synonym', 'lexicon', 'partial', 'ai'].includes(matchType);
    if (
      entry.recordStatus === 'draft' &&
      tile &&
      !tile.textOnly &&
      automatic &&
      (matchType === 'partial' ||
        !isAutomaticCommunicationCandidateAllowed(
          token,
          tile.displayLabel,
          tile.tile.vocalization || tile.displayLabel,
          tile.tile
        ))
    ) {
      tile = null;
    }

    return {
      id: createId('review'),
      token,
      tile: tile || null,
      matchType: tile ? matchType : 'none',
      ...(item.lookupToken ? { lookupToken: item.lookupToken } : {}),
      ...(item.sourceSpan ? { sourceSpan: item.sourceSpan } : {}),
      ...(item.source ? { source: String(item.source) } : {}),
      ...(Number.isInteger(item.preparedOutputIndex) ? { preparedOutputIndex: item.preparedOutputIndex } : {})
    };
  });
  if (entry.recordStatus === 'draft') {
    reviewItems = applyCommunicationContextGuards(
      reviewItems,
      Array.from(catalogById.values()),
      { preserveExplicitChoices: true }
    );
  }
  const outputPreview = buildReceiverOutputPreview(reviewItems);
  const matchedCount = reviewItems.filter(item => item.tile).length;

  return {
    inputText,
    segmentation: {
      segments: reviewItems.map(item => item.token).filter(Boolean),
      engine: 'persisted-receiver-record'
    },
    matches: reviewItems,
    reviewItems,
    missingTokens: reviewItems
      .filter(item => !item.tile && !item.personalReference)
      .map(item => item.token),
    outputPreview,
    matchRate: reviewItems.length ? matchedCount / reviewItems.length : 0
  };
}

export function moveReceiverReviewItem(reviewItems, itemId, offset) {
  const currentIndex = reviewItems.findIndex(item => item.id === itemId);
  const targetIndex = currentIndex + offset;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= reviewItems.length
  ) {
    return reviewItems;
  }

  const nextItems = reviewItems.slice();
  const currentItem = nextItems[currentIndex];
  nextItems.splice(currentIndex, 1);
  nextItems.splice(targetIndex, 0, currentItem);
  return nextItems;
}

export function deleteReceiverReviewItem(reviewItems, itemId) {
  return reviewItems.filter(item => item.id !== itemId);
}

export function insertReceiverReviewItem(
  reviewItems,
  afterItemId,
  candidate,
  { itemId = createReceiverReviewId('review') } = {}
) {
  if (!candidate || !candidate.tile) {
    return reviewItems;
  }

  const nextItems = reviewItems.slice();
  const targetIndex = nextItems.findIndex(item => item.id === afterItemId);
  const displayLabel =
    candidate.displayLabel ||
    candidate.tile.label ||
    candidate.tile.vocalization ||
    '';
  const insertedItem = {
    id: itemId,
    token: String(displayLabel).trim(),
    tile: candidate,
    matchType: 'manual',
    source: 'manual'
  };

  nextItems.splice(
    targetIndex >= 0 ? targetIndex + 1 : nextItems.length,
    0,
    insertedItem
  );
  return nextItems;
}

export function replaceReceiverReviewItem(reviewItems, itemId, candidate) {
  return reviewItems.map(item => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      tile: candidate,
      personCandidates: [],
      matchType: 'manual',
      source: candidate && candidate.textOnly ? 'text' : 'corrected'
    };
  });
}

export function retainReceiverReviewItemAsText(reviewItems, itemId) {
  const item = reviewItems.find(value => value.id === itemId);
  if (!item) return reviewItems;
  return replaceReceiverReviewItem(
    reviewItems,
    itemId,
    createTextCommunicationCatalogItem(item.token, `text-${itemId}`)
  );
}

export function buildReceiverOutputPreview(reviewItems) {
  return reviewItems.flatMap(item => item.tile && item.tile.persistedOutput
    ? [{ ...item.tile.persistedOutput }]
    : createCommunicationOutputFromMatches([item], { preserveAutomaticSource: true }));
}

export function buildReceiverHistoryEntry(inputText, reviewItems) {
  const safeReviewItems = Array.isArray(reviewItems)
    ? reviewItems.filter(item => item && typeof item === 'object')
    : [];
  const outputItems = buildReceiverOutputPreview(safeReviewItems);
  let outputIndex = 0;
  const pictogramSequence = safeReviewItems.map(item => {
    const matchType = normalizeReceiverMatchType(item && item.matchType);
    const tile = item && item.tile;
    // Unresolved cards are not present in output. Index snapshots by the
    // emitted occurrence, not by the review row (or by a repeated tile ID).
    const emitsOutput = tile && !(tile.textOnly && !String(item.token || '').trim());
    const preparedOutputIndex = emitsOutput ? outputIndex++ : -1;
    const explicitSource = String((item && item.source) || '').trim();
    const attribution = getPictogramAttribution(tile);
    const provider = String((attribution && attribution.provider) || '').trim();
    const source = !tile
      ? 'unresolved'
      : provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
      ? 'user'
      : matchType === 'online' &&
        (provider === 'arasaac' || provider === 'opensymbols')
      ? provider
      : explicitSource || (matchType === 'online' ? 'online' : 'local_dict');

    return {
      pictogramId: tile && !tile.textOnly ? tile.id : null,
      label: getReceiverItemDisplayLabel(item) || String(item.token || ''),
      source,
      boardId: (tile && tile.boardId) || '',
      matchType,
      confidence: getReceiverMatchConfidence(matchType),
      originalToken: String((item && item.token) || ''),
      ...(tile && tile.textOnly ? { textOnly: true } : {}),
      ...(item.lookupToken ? { lookupToken: item.lookupToken } : {}),
      ...(item.sourceSpan ? { sourceSpan: item.sourceSpan } : {}),
      ...(emitsOutput ? { preparedOutputIndex } : {}),
      ...(attribution ? { attribution } : {})
    };
  });

  return {
    contractVersion: RECEIVER_PIPELINE_CONTRACT_VERSION,
    direction: 'receive',
    inputText,
    labels: outputItems.map(item => item.label).filter(Boolean),
    output: outputItems,
    pictogramSequence
  };
}
