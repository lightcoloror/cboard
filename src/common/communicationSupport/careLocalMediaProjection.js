import { preserveLocalPhraseLifeContext } from './savedPhraseManagement';

function sameCareScope(left, right) {
  return (
    left.accountId === right.accountId &&
    left.familyId === right.familyId &&
    left.profileId === right.profileId
  );
}

/**
 * Preserve device-local tile media references when a cloud projection replaces
 * the Care library. Only cloud-present boards/tiles are eligible, so remote
 * deletions are never restored. The caller must pass the library from the
 * current Care-scoped store and its matching scope.
 */
export function preserveCareLocalTileMedia(
  cloudBoards,
  localBoards,
  localScope,
  projectionScope
) {
  if (!sameCareScope(localScope, projectionScope)) return cloudBoards;

  const localByBoard = new Map(localBoards.map(board => [board.id, board]));
  return cloudBoards.map(board => {
    const localBoard = localByBoard.get(board.id);
    if (!localBoard) return board;

    const localByTile = new Map(localBoard.tiles.map(tile => [tile.id, tile]));
    let changed = false;
    const tiles = board.tiles.map(tile => {
      const localTile = localByTile.get(tile.id);
      if (!localTile) return tile;

      const next = { ...tile };
      if (Object.prototype.hasOwnProperty.call(localTile, 'mediaType')) {
        next.mediaType = localTile.mediaType;
      }
      if (Object.prototype.hasOwnProperty.call(localTile, 'video')) {
        next.video = localTile.video;
      }
      if (Object.prototype.hasOwnProperty.call(localTile, 'sound')) {
        next.sound = localTile.sound;
      }
      if (
        next.mediaType !== tile.mediaType ||
        next.video !== tile.video ||
        next.sound !== tile.sound
      ) {
        changed = true;
        return next;
      }
      return tile;
    });
    return changed ? { ...board, tiles } : board;
  });
}

// Favorites keep their own captured output even if the source tile is removed.
// Match both board and tile identity, never the label or another family's item.
export function preserveCareLocalFavoriteMedia(
  cloudItems,
  localItems,
  localScope,
  projectionScope
) {
  if (!sameCareScope(localScope, projectionScope)) {
    return cloudItems.some(item => Object.prototype.hasOwnProperty.call(item, 'lifeContext'))
      ? cloudItems.map(item => preserveLocalPhraseLifeContext(item)) : cloudItems;
  }
  const localById = new Map(localItems.map(item => [item.id, item]));
  return cloudItems.map(item => {
    const local = localById.get(item.id);
    const contextualItem = preserveLocalPhraseLifeContext(item, local);
    if (!local || !Array.isArray(item.output)) return contextualItem;
    const key = tile => `${tile.boardId || ''}:${tile.id || ''}`;
    const localByTile = new Map(
      (local.output || []).map(tile => [key(tile), tile])
    );
    return {
      ...contextualItem,
      output: item.output.map(tile => {
        const previous = localByTile.get(key(tile));
        if (!previous) return tile;
        const next = { ...tile };
        for (const field of ['sound', 'video', 'mediaType']) {
          if (Object.prototype.hasOwnProperty.call(previous, field))
            next[field] = previous[field];
        }
        return next;
      })
    };
  });
}
