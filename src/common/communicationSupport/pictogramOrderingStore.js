import {
  movePictogramManualOrder,
  normalizePictogramOrderingState,
  recordPictogramUsage
} from './pictogramOrdering';

export const PICTOGRAM_ORDERING_STORAGE_KEY =
  'cboard_communication_pictogram_ordering_v1';

function assertStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new TypeError(
      'Pictogram ordering requires a synchronous key-value store'
    );
  }
}

export function createPictogramOrderingStore(storage) {
  assertStorage(storage);

  function load() {
    const raw = storage.getItem(PICTOGRAM_ORDERING_STORAGE_KEY);
    if (!raw) return normalizePictogramOrderingState(null);
    try {
      return normalizePictogramOrderingState(JSON.parse(raw));
    } catch (error) {
      return normalizePictogramOrderingState(null);
    }
  }

  function save(value) {
    const normalized = normalizePictogramOrderingState(value);
    storage.setItem(PICTOGRAM_ORDERING_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  return {
    load,
    save,
    recordUsage(boardId, tileId, now) {
      return save(recordPictogramUsage(load(), boardId, tileId, now));
    },
    moveManualOrder(tiles, boardId, tileId, direction) {
      return save(
        movePictogramManualOrder(tiles, load(), boardId, tileId, direction)
      );
    }
  };
}
