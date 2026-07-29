export const COMMUNICATION_FONT_SIZES = Object.freeze([
  'normal',
  'large',
  'extra-large'
]);
export const COMMUNICATION_GRID_COLUMNS = Object.freeze([2, 3, 4]);
export const COMMUNICATION_PICTOGRAM_SORT_MODES = Object.freeze([
  'manual',
  'popularity'
]);
export const COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS = Object.freeze([
  0,
  5,
  10,
  15,
  30
]);
export const DEFAULT_COMMUNICATION_PREFERENCES = Object.freeze({
  highContrast: false,
  fontSize: 'normal',
  gridColumns: 3,
  speechRate: 1,
  speechVoice: '',
  candidateAutoplayDelaySeconds: 15,
  onlinePictogramSearchEnabled: true,
  pictogramSortMode: 'manual',
  hiddenBoardIds: Object.freeze([]),
  onboardingComplete: false
});

function normalizeIdList(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map(item => String(item || '').trim())
    .filter(item => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 100);
}

function normalizeSpeechRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate))
    return DEFAULT_COMMUNICATION_PREFERENCES.speechRate;
  return Math.round(Math.max(0.5, Math.min(2, rate)) * 10) / 10;
}

function normalizeSpeechVoice(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

function normalizeCandidateAutoplayDelaySeconds(value) {
  const delay = Number(value);
  return COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS.includes(delay)
    ? delay
    : DEFAULT_COMMUNICATION_PREFERENCES.candidateAutoplayDelaySeconds;
}

export function normalizeCommunicationPreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const fontSize = COMMUNICATION_FONT_SIZES.includes(input.fontSize)
    ? input.fontSize
    : DEFAULT_COMMUNICATION_PREFERENCES.fontSize;
  const gridColumns = COMMUNICATION_GRID_COLUMNS.includes(
    Number(input.gridColumns)
  )
    ? Number(input.gridColumns)
    : DEFAULT_COMMUNICATION_PREFERENCES.gridColumns;

  return {
    highContrast: Boolean(input.highContrast),
    fontSize,
    gridColumns,
    speechRate: normalizeSpeechRate(input.speechRate),
    speechVoice: normalizeSpeechVoice(input.speechVoice),
    candidateAutoplayDelaySeconds: normalizeCandidateAutoplayDelaySeconds(
      input.candidateAutoplayDelaySeconds
    ),
    onlinePictogramSearchEnabled:
      typeof input.onlinePictogramSearchEnabled === 'boolean'
        ? input.onlinePictogramSearchEnabled
        : DEFAULT_COMMUNICATION_PREFERENCES.onlinePictogramSearchEnabled,
    pictogramSortMode: COMMUNICATION_PICTOGRAM_SORT_MODES.includes(
      input.pictogramSortMode
    )
      ? input.pictogramSortMode
      : DEFAULT_COMMUNICATION_PREFERENCES.pictogramSortMode,
    hiddenBoardIds: normalizeIdList(input.hiddenBoardIds),
    onboardingComplete: Boolean(input.onboardingComplete)
  };
}

export function updateCommunicationPreferences(current, changes) {
  return normalizeCommunicationPreferences({
    ...normalizeCommunicationPreferences(current),
    ...(changes && typeof changes === 'object' ? changes : {})
  });
}

export function toggleCommunicationBoardVisibility(current, boardId) {
  const preferences = normalizeCommunicationPreferences(current);
  const id = String(boardId || '').trim();
  if (!id) return preferences;
  const hidden = new Set(preferences.hiddenBoardIds);
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  return { ...preferences, hiddenBoardIds: [...hidden] };
}

function getCommunicationBoardNavigationTargetId(tile) {
  if (!tile || typeof tile !== 'object') return '';
  const target = tile.loadBoardId || tile.loadBoard;
  if (target && typeof target === 'object') {
    return String(target.id || '').trim();
  }
  return String(target || '').trim();
}

export function projectVisibleCommunicationBoards(boards, hiddenBoardIds) {
  if (!Array.isArray(boards)) return [];
  const hidden = new Set(normalizeIdList(hiddenBoardIds));
  if (!hidden.size) return boards;

  let changed = false;
  const visibleBoards = [];
  boards.forEach(board => {
    if (!board || typeof board !== 'object') {
      changed = true;
      return;
    }
    if (hidden.has(String(board.id || '').trim())) {
      changed = true;
      return;
    }
    if (!Array.isArray(board.tiles)) {
      visibleBoards.push(board);
      return;
    }

    const visibleTiles = board.tiles.filter(
      tile => !hidden.has(getCommunicationBoardNavigationTargetId(tile))
    );
    if (visibleTiles.length !== board.tiles.length) {
      changed = true;
      const visibleTileIds = new Set(
        visibleTiles
          .map(tile => String((tile && tile.id) || '').trim())
          .filter(Boolean)
      );
      const nextBoard = { ...board, tiles: visibleTiles };
      if (
        board.layout &&
        typeof board.layout === 'object' &&
        Array.isArray(board.layout.tileIds)
      ) {
        nextBoard.layout = {
          ...board.layout,
          tileIds: board.layout.tileIds.filter(tileId =>
            visibleTileIds.has(String(tileId || '').trim())
          )
        };
      }
      if (
        board.grid &&
        typeof board.grid === 'object' &&
        Array.isArray(board.grid.order)
      ) {
        nextBoard.grid = {
          ...board.grid,
          order: board.grid.order.map(row =>
            Array.isArray(row)
              ? row.filter(tileId =>
                  visibleTileIds.has(String(tileId || '').trim())
                )
              : row
          )
        };
      }
      visibleBoards.push(nextBoard);
      return;
    }
    visibleBoards.push(board);
  });

  return changed ? visibleBoards : boards;
}
