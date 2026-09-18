// Public, application-bundled symbols are identified by catalog entries, never
// by a server-supplied URL. Each client resolves the same IDs to its own assets.
export function createCareBuiltinImages(boards) {
  const catalog = 'cboard-default-v1';
  const byImage = new Map();
  const byId = new Map();
  for (const board of boards) {
    for (const tile of board.tiles || []) {
      if (!tile.image) continue;
      const reference = { catalog, boardId: board.id, tileId: tile.id };
      byId.set(JSON.stringify([board.id, tile.id]), tile.image);
      if (!byImage.has(tile.image)) byImage.set(tile.image, reference);
    }
  }
  return {
    reference(source) {
      const reference = byImage.get(source);
      return reference ? { ...reference } : null;
    },
    resolve(reference) {
      if (!reference || reference.catalog !== catalog) return '';
      return (
        byId.get(JSON.stringify([reference.boardId, reference.tileId])) || ''
      );
    }
  };
}
