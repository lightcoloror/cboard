import { assertBoardDTO } from './dto';

export function createCboardGridOrder(layout) {
  return Array.from({ length: layout.rows }, (_, rowIndex) =>
    Array.from({ length: layout.columns }, (_, columnIndex) => {
      const tileId = layout.tileIds[rowIndex * layout.columns + columnIndex];
      return tileId || null;
    })
  );
}

export function boardDTOToCboardBoard(board, sourceBoard = {}) {
  const dto = assertBoardDTO(board);
  const sourceTiles = new Map(
    (Array.isArray(sourceBoard.tiles) ? sourceBoard.tiles : []).map(tile => [
      tile.id,
      tile
    ])
  );

  return {
    ...sourceBoard,
    id: dto.id,
    name: dto.name,
    nameKey: dto.nameKey,
    communicationCategory: dto.category,
    isFixed: true,
    grid: {
      rows: dto.layout.rows,
      columns: dto.layout.columns,
      order: createCboardGridOrder(dto.layout)
    },
    tiles: dto.tiles.map(tile => ({
      ...(sourceTiles.get(tile.id) || {}),
      id: tile.id,
      label: tile.label,
      labelKey: tile.keyPath,
      vocalization: tile.vocalization,
      image: tile.image,
      sound: tile.sound,
      backgroundColor: tile.backgroundColor,
      loadBoard: tile.loadBoardId,
      ...(tile.pictogramAttribution
        ? { pictogramAttribution: tile.pictogramAttribution }
        : {}),
      communicationSynonyms: tile.communication.synonyms,
      communicationRelatedTerms: tile.communication.relatedTerms,
      communicationExcludeTokens: tile.communication.excludeTokens,
      communicationCategory: tile.communication.category
    }))
  };
}
