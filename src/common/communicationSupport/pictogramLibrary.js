import { createBoardDTO, getBoardDTOTilesInDisplayOrder } from './dto';
import { normalizePictogramAttribution } from './pictogramAttribution';

export const PICTOGRAM_LIBRARY_DTO_TYPE = 'PictogramLibraryDTO';
export const PICTOGRAM_LIBRARY_DTO_VERSION = 1;

const MAX_BOARDS = 500;
const MAX_BOARD_ITEMS = 20000;
const MAX_CONCEPTS = 20000;
const MAX_SYMBOL_ASSETS = 20000;

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(normalizeText)
    .filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function stableHash(value) {
  let hash = 2166136261;
  const text = normalizeText(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createConceptId(tile, locale) {
  if (tile.keyPath) return `concept:${tile.keyPath}`;
  const category =
    tile.communication && tile.communication.category
      ? tile.communication.category
      : '';
  return `concept:label:${stableHash(
    [locale, tile.label, category].join('\u0000')
  )}`;
}

function createSymbolAssetId(tile, attribution) {
  const sourceIdentity = attribution
    ? [attribution.provider, attribution.originalId].join('\u0000')
    : tile.image;
  return `asset:${stableHash(sourceIdentity)}`;
}

function createBoardItemId(boardId, tileId) {
  return `board-item:${boardId}:${tileId}`;
}

function createConceptSymbolLinkId(conceptId, symbolAssetId) {
  return `concept-symbol:${stableHash(
    [conceptId, symbolAssetId].join('\u0000')
  )}`;
}

function mergeConcept(existing, next) {
  return {
    ...existing,
    canonicalLabelEn: existing.canonicalLabelEn || next.canonicalLabelEn,
    semanticDomain: existing.semanticDomain || next.semanticDomain,
    category: existing.category || next.category,
    synonyms: uniqueStrings([...existing.synonyms, ...next.synonyms]),
    relatedTerms: uniqueStrings([
      ...existing.relatedTerms,
      ...next.relatedTerms
    ]),
    excludeTokens: uniqueStrings([
      ...existing.excludeTokens,
      ...next.excludeTokens
    ]),
    keywords: uniqueStrings([...existing.keywords, ...next.keywords]),
    tags: uniqueStrings([...existing.tags, ...next.tags])
  };
}

function createConcept(tile, locale, resolveEnglishName) {
  const communication = tile.communication || {};
  const canonicalLabelEn = normalizeText(
    typeof resolveEnglishName === 'function' ? resolveEnglishName(tile) : ''
  );
  const synonyms = uniqueStrings(communication.synonyms);
  const relatedTerms = uniqueStrings(communication.relatedTerms);
  const category = normalizeText(communication.category);

  return {
    id: createConceptId(tile, locale),
    canonicalLabel: normalizeText(tile.label),
    canonicalLabelEn,
    language: locale,
    keyPath: normalizeText(tile.keyPath),
    semanticDomain: category,
    category,
    synonyms,
    relatedTerms,
    excludeTokens: uniqueStrings(communication.excludeTokens),
    keywords: uniqueStrings([...synonyms, ...relatedTerms]),
    tags: uniqueStrings([category]),
    reviewStatus: 'approved'
  };
}

function createSymbolAsset(tile, attribution) {
  const sourceProvider = attribution ? attribution.provider : 'unattributed';
  const sourceAssetId = attribution
    ? attribution.originalId
    : normalizeText(tile.id);
  const isDevicePrivate = sourceProvider === 'device-private';

  return {
    id: createSymbolAssetId(tile, attribution),
    image: normalizeText(tile.image),
    sourceProvider,
    sourceAssetId,
    sourceUrl: attribution ? attribution.sourceUrl : '',
    license: attribution ? attribution.license : '未提供逐图许可信息',
    licenseUrl: attribution ? attribution.licenseUrl : null,
    attributionText: attribution ? attribution.name : '来源待补充',
    author: attribution ? attribution.author : null,
    authorUrl: attribution ? attribution.authorUrl : null,
    repoKey: attribution ? attribution.repoKey : null,
    imageType: isDevicePrivate ? 'custom' : 'symbol',
    scope: isDevicePrivate ? 'device-private' : 'public',
    reviewStatus: isDevicePrivate ? 'draft' : 'approved'
  };
}

function normalizeBoards(boards, options) {
  if (!Array.isArray(boards)) {
    throw new TypeError('Pictogram library boards must be an array');
  }
  if (boards.length > MAX_BOARDS) {
    throw new TypeError('Pictogram library has too many boards');
  }

  return boards.map(board =>
    createBoardDTO(board, {
      resolveName: options.resolveBoardName,
      resolveTileLabel: options.resolveTileLabel,
      conceptProfileLabelKeys: options.conceptProfileLabelKeys
    })
  );
}

export function createPictogramLibraryDTO(boards, options = {}) {
  const locale = normalizeText(options.locale) || 'zh-CN';
  const normalizedBoards = normalizeBoards(boards, options);
  const conceptsById = new Map();
  const assetsById = new Map();
  const linksById = new Map();
  const boardItems = [];

  const libraryBoards = normalizedBoards.map(board => {
    const orderedTiles = getBoardDTOTilesInDisplayOrder(board);
    orderedTiles.forEach((tile, positionIndex) => {
      const concept = createConcept(tile, locale, options.resolveEnglishName);
      const previousConcept = conceptsById.get(concept.id);
      conceptsById.set(
        concept.id,
        previousConcept ? mergeConcept(previousConcept, concept) : concept
      );

      const attribution = normalizePictogramAttribution(
        tile.pictogramAttribution
      );
      const symbolAsset = tile.image
        ? createSymbolAsset(tile, attribution)
        : null;
      if (symbolAsset && !assetsById.has(symbolAsset.id)) {
        assetsById.set(symbolAsset.id, symbolAsset);
      }
      if (symbolAsset) {
        const linkId = createConceptSymbolLinkId(concept.id, symbolAsset.id);
        if (!linksById.has(linkId)) {
          const hasDefault = Array.from(linksById.values()).some(
            link => link.conceptId === concept.id && link.role === 'default'
          );
          linksById.set(linkId, {
            id: linkId,
            conceptId: concept.id,
            symbolAssetId: symbolAsset.id,
            role: hasDefault ? 'alternate' : 'default',
            rank: hasDefault ? 2 : 1
          });
        }
      }

      boardItems.push({
        id: createBoardItemId(board.id, tile.id),
        boardId: board.id,
        tileId: tile.id,
        conceptId: concept.id,
        symbolAssetId: symbolAsset ? symbolAsset.id : '',
        positionIndex,
        vocalization: normalizeText(tile.vocalization) || tile.label,
        backgroundColor: normalizeText(tile.backgroundColor),
        loadBoardId: normalizeText(tile.loadBoardId)
      });
    });

    return {
      id: board.id,
      name: board.name,
      nameKey: board.nameKey,
      category: board.category,
      layout: {
        columns: board.layout.columns,
        rows: board.layout.rows,
        tileIds: board.layout.tileIds.slice()
      }
    };
  });

  const dto = {
    dtoType: PICTOGRAM_LIBRARY_DTO_TYPE,
    version: PICTOGRAM_LIBRARY_DTO_VERSION,
    locale,
    concepts: Array.from(conceptsById.values()),
    symbolAssets: Array.from(assetsById.values()),
    conceptSymbolLinks: Array.from(linksById.values()),
    boards: libraryBoards,
    boardItems
  };

  return assertPictogramLibraryDTO(dto);
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  items.forEach(item => {
    const id = normalizeText(item && item.id);
    if (!id || ids.has(id)) {
      throw new TypeError(`${label} must use unique non-empty ids`);
    }
    ids.add(id);
  });
  return ids;
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new TypeError(`${label} must be a string array`);
  }
}

function validatePictogramLibraryDTO(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.dtoType !== PICTOGRAM_LIBRARY_DTO_TYPE ||
    value.version !== PICTOGRAM_LIBRARY_DTO_VERSION ||
    !normalizeText(value.locale) ||
    !Array.isArray(value.concepts) ||
    !Array.isArray(value.symbolAssets) ||
    !Array.isArray(value.conceptSymbolLinks) ||
    !Array.isArray(value.boards) ||
    !Array.isArray(value.boardItems)
  ) {
    throw new TypeError('Invalid or unsupported PictogramLibraryDTO');
  }
  if (
    value.concepts.length > MAX_CONCEPTS ||
    value.symbolAssets.length > MAX_SYMBOL_ASSETS ||
    value.boards.length > MAX_BOARDS ||
    value.boardItems.length > MAX_BOARD_ITEMS
  ) {
    throw new TypeError('PictogramLibraryDTO exceeds supported limits');
  }

  const conceptIds = assertUniqueIds(value.concepts, 'Concepts');
  const assetIds = assertUniqueIds(value.symbolAssets, 'Symbol assets');
  const boardIds = assertUniqueIds(value.boards, 'Boards');
  assertUniqueIds(value.conceptSymbolLinks, 'Concept-symbol links');
  assertUniqueIds(value.boardItems, 'Board items');

  value.concepts.forEach(concept => {
    if (
      !normalizeText(concept.canonicalLabel) ||
      !normalizeText(concept.language)
    ) {
      throw new TypeError('Concept label and language are required');
    }
    ['synonyms', 'relatedTerms', 'excludeTokens', 'keywords', 'tags'].forEach(
      key => assertStringArray(concept[key], `Concept.${key}`)
    );
  });

  value.symbolAssets.forEach(asset => {
    if (
      !normalizeText(asset.image) ||
      !normalizeText(asset.sourceProvider) ||
      !normalizeText(asset.sourceAssetId) ||
      !normalizeText(asset.license) ||
      !normalizeText(asset.attributionText)
    ) {
      throw new TypeError(
        'Symbol assets require image, source, license, and attribution'
      );
    }
  });

  value.conceptSymbolLinks.forEach(link => {
    if (!conceptIds.has(link.conceptId) || !assetIds.has(link.symbolAssetId)) {
      throw new TypeError('Concept-symbol link references missing data');
    }
  });

  value.boards.forEach(board => {
    if (
      !normalizeText(board.name) ||
      !board.layout ||
      !Number.isInteger(board.layout.columns) ||
      board.layout.columns <= 0 ||
      !Number.isInteger(board.layout.rows) ||
      board.layout.rows <= 0
    ) {
      throw new TypeError('Board metadata or layout is invalid');
    }
    assertStringArray(board.layout.tileIds, 'Board.layout.tileIds');
  });

  value.boardItems.forEach(item => {
    if (
      !boardIds.has(item.boardId) ||
      !conceptIds.has(item.conceptId) ||
      (item.symbolAssetId && !assetIds.has(item.symbolAssetId)) ||
      !normalizeText(item.tileId) ||
      !Number.isInteger(item.positionIndex) ||
      item.positionIndex < 0
    ) {
      throw new TypeError('Board item references missing or invalid data');
    }
  });

  value.boards.forEach(board => {
    const items = value.boardItems
      .filter(item => item.boardId === board.id)
      .sort((left, right) => left.positionIndex - right.positionIndex);
    const tileIds = items.map(item => item.tileId);
    const uniqueTileIds = new Set(tileIds);
    if (
      uniqueTileIds.size !== tileIds.length ||
      tileIds.length !== board.layout.tileIds.length ||
      board.layout.tileIds.some((tileId, index) => tileId !== tileIds[index]) ||
      board.layout.rows * board.layout.columns < tileIds.length
    ) {
      throw new TypeError('Board items do not match the board layout');
    }
  });
}

export function isPictogramLibraryDTO(value) {
  try {
    validatePictogramLibraryDTO(value);
    return true;
  } catch (error) {
    return false;
  }
}

export function assertPictogramLibraryDTO(value) {
  validatePictogramLibraryDTO(value);
  return value;
}

function buildPictogramAttribution(asset) {
  return normalizePictogramAttribution({
    provider: asset.sourceProvider,
    originalId: asset.sourceAssetId,
    name: asset.attributionText,
    license: asset.license,
    licenseUrl: asset.licenseUrl,
    author: asset.author,
    authorUrl: asset.authorUrl,
    sourceUrl: asset.sourceUrl,
    repoKey: asset.repoKey
  });
}

export function pictogramLibraryDTOToBoards(value) {
  const library = assertPictogramLibraryDTO(value);
  const conceptsById = new Map(
    library.concepts.map(concept => [concept.id, concept])
  );
  const assetsById = new Map(
    library.symbolAssets.map(asset => [asset.id, asset])
  );

  return library.boards.map(board => {
    const items = library.boardItems
      .filter(item => item.boardId === board.id)
      .sort((left, right) => left.positionIndex - right.positionIndex);
    const tiles = items.map(item => {
      const concept = conceptsById.get(item.conceptId);
      const asset = item.symbolAssetId
        ? assetsById.get(item.symbolAssetId)
        : null;
      const attribution = asset ? buildPictogramAttribution(asset) : null;

      return {
        id: item.tileId,
        label: concept.canonicalLabel,
        vocalization: item.vocalization || concept.canonicalLabel,
        image: asset ? asset.image : '',
        backgroundColor: item.backgroundColor,
        keyPath: concept.keyPath,
        labelKey: concept.keyPath,
        loadBoard: item.loadBoardId,
        ...(attribution ? { pictogramAttribution: attribution } : {}),
        communicationSynonyms: concept.synonyms,
        communicationRelatedTerms: concept.relatedTerms,
        communicationExcludeTokens: concept.excludeTokens,
        communicationCategory: concept.semanticDomain || concept.category
      };
    });

    return createBoardDTO({
      id: board.id,
      name: board.name,
      nameKey: board.nameKey,
      communicationCategory: board.category,
      layout: {
        columns: board.layout.columns,
        rows: board.layout.rows,
        tileIds: board.layout.tileIds.slice()
      },
      tiles
    });
  });
}

export function getPictogramLibraryDTOStats(value) {
  const library = assertPictogramLibraryDTO(value);
  const attributedSymbolAssetCount = library.symbolAssets.filter(
    asset => asset.sourceProvider !== 'unattributed'
  ).length;
  return {
    boardCount: library.boards.length,
    boardItemCount: library.boardItems.length,
    conceptCount: library.concepts.length,
    symbolAssetCount: library.symbolAssets.length,
    attributedSymbolAssetCount,
    unattributedSymbolAssetCount:
      library.symbolAssets.length - attributedSymbolAssetCount,
    linkedConceptCount: new Set(
      library.conceptSymbolLinks.map(link => link.conceptId)
    ).size
  };
}
