function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getBoardIds(board) {
  return [
    normalizeText(board && board.id),
    normalizeText(board && board.prevId)
  ].filter(Boolean);
}

function getTileCount(board) {
  return Array.isArray(board && board.tiles) ? board.tiles.length : 0;
}

function createExistingBoardIndex(boards) {
  const ids = new Set();
  const byId = new Map();
  (Array.isArray(boards) ? boards : []).forEach(board => {
    getBoardIds(board).forEach(id => {
      ids.add(id);
      if (!byId.has(id)) byId.set(id, board);
    });
  });
  return { ids, byId };
}

function getImportDiagnostics(boards) {
  const diagnostics =
    boards && boards.importDiagnostics ? boards.importDiagnostics : {};
  const normalized = {
    skippedMalformedBoardCount:
      Number(diagnostics.skippedMalformedBoardCount) || 0,
    skippedUnsupportedBoardCount:
      Number(diagnostics.skippedUnsupportedBoardCount) || 0
  };
  if (diagnostics.structuredLibrary) {
    normalized.structuredLibrary = true;
    normalized.conceptCount = Number(diagnostics.conceptCount) || 0;
    normalized.symbolAssetCount = Number(diagnostics.symbolAssetCount) || 0;
    normalized.attributedSymbolAssetCount =
      Number(diagnostics.attributedSymbolAssetCount) || 0;
    normalized.unattributedSymbolAssetCount =
      Number(diagnostics.unattributedSymbolAssetCount) || 0;
    normalized.linkedConceptCount = Number(diagnostics.linkedConceptCount) || 0;
  }
  return normalized;
}

export function createBoardImportReview({
  boards = [],
  existingBoards = [],
  fileName = '',
  format = ''
} = {}) {
  const importedBoards = Array.isArray(boards) ? boards : [];
  const existing = createExistingBoardIndex(existingBoards);
  const items = importedBoards.map((board, index) => {
    const ids = getBoardIds(board);
    return {
      key: ids[0] || `board-${index}`,
      name: normalizeText(board && board.name) || 'Unnamed board',
      tileCount: getTileCount(board),
      conflict: ids.some(id => existing.ids.has(id)),
      board
    };
  });
  const applicableBoards = items
    .filter(item => !item.conflict)
    .map(item => item.board);
  const diagnostics = getImportDiagnostics(importedBoards);
  const skippedCount =
    diagnostics.skippedMalformedBoardCount +
    diagnostics.skippedUnsupportedBoardCount;

  return {
    kind: 'boards',
    fileName,
    format,
    imported: importedBoards,
    applicableBoards,
    items,
    canApply: applicableBoards.length > 0,
    summary: {
      boardCount: items.length,
      importableBoardCount: applicableBoards.length,
      tileCount: items.reduce((total, item) => total + item.tileCount, 0),
      conflictCount: items.filter(item => item.conflict).length,
      skippedCount,
      customPictureCount: 0,
      ...(diagnostics.structuredLibrary
        ? {
            structuredLibrary: true,
            conceptCount: diagnostics.conceptCount,
            symbolAssetCount: diagnostics.symbolAssetCount,
            attributedSymbolAssetCount: diagnostics.attributedSymbolAssetCount,
            unattributedSymbolAssetCount:
              diagnostics.unattributedSymbolAssetCount,
            linkedConceptCount: diagnostics.linkedConceptCount
          }
        : {})
    }
  };
}

export function createPictureLibraryImportReview({
  restored,
  existingBoards = [],
  fileName = '',
  format = ''
} = {}) {
  const safeRestored = restored || {};
  const archiveBoards = Array.isArray(
    safeRestored.archive && safeRestored.archive.boards
  )
    ? safeRestored.archive.boards
    : [];
  const existing = createExistingBoardIndex(existingBoards);
  const finalBoards = Array.isArray(safeRestored.boards)
    ? safeRestored.boards
    : [];
  const changedBoardCount = finalBoards.filter(board => {
    const id = normalizeText(board && board.id);
    const current = id ? existing.byId.get(id) : null;
    return !current || JSON.stringify(current) !== JSON.stringify(board);
  }).length;
  const items = archiveBoards.map((board, index) => {
    const ids = getBoardIds(board);
    return {
      key: ids[0] || `board-${index}`,
      name: normalizeText(board && board.name) || 'Unnamed board',
      tileCount: getTileCount(board),
      conflict: ids.some(id => existing.ids.has(id)),
      board
    };
  });
  const sourceSummary = safeRestored.summary || {};
  const customPictureCount = Number(sourceSummary.customPictureCount) || 0;
  const deviceDataStats = sourceSummary.deviceDataStats || null;

  return {
    kind: 'picture-library',
    fileName,
    format,
    imported: safeRestored,
    applicableBoards: finalBoards,
    items,
    canApply:
      changedBoardCount > 0 ||
      customPictureCount > 0 ||
      Boolean(deviceDataStats),
    summary: {
      boardCount: Number(sourceSummary.boardCount) || archiveBoards.length,
      importableBoardCount: changedBoardCount,
      tileCount:
        Number(sourceSummary.tileCount) ||
        items.reduce((total, item) => total + item.tileCount, 0),
      conflictCount: items.filter(item => item.conflict).length,
      skippedCount: 0,
      customPictureCount,
      conflictStrategy: sourceSummary.conflictStrategy || 'merge',
      ...(deviceDataStats ? { deviceDataStats } : {})
    }
  };
}
