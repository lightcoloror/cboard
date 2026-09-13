import { createBoardDTO } from './dto';

export function projectCareBoards(
  snapshot,
  image = asset => `data:${asset.type};base64,${asset.data}`
) {
  if (snapshot.locked) return [];
  const resources = Object.values(snapshot.resources || {}).filter(
    r => !r.deleted
  );
  const tiles = new Map(
    resources.filter(r => r.kind === 'tile').map(r => [r.id, r])
  );
  return resources
    .filter(r => r.kind === 'board')
    .map(board =>
      createBoardDTO({
        id: board.id,
        name: board.value.name || '患者图板',
        tiles: (board.value.tileIds || [])
          .map(id => tiles.get(id))
          .filter(Boolean)
          .map(tile => ({
            id: tile.id,
            label: tile.value.label,
            vocalization: tile.value.label,
            image: snapshot.media[tile.value.mediaId]
              ? image(snapshot.media[tile.value.mediaId])
              : '',
            pictogramAttribution: tile.value.pictogramAttribution || null
          })),
        orderedTileIds: board.value.tileIds
      })
    );
}

// Called against the cached base before fetching new server revisions. Thus an
// offline edit cannot silently acquire the newest version and overwrite it.
export async function queueCareBoards(engine, boards, readImage) {
  const wantedBoards = new Set(),
    wantedTiles = new Set();
  for (const board of boards) {
    wantedBoards.add(board.id);
    for (const tile of board.tiles || []) {
      wantedTiles.add(tile.id);
      const current = engine.view().resources[`tile:${tile.id}`];
      const value = {
        ...(current?.value || {}),
        label: tile.label || tile.vocalization || '图卡'
      };
      if (tile.pictogramAttribution)
        value.pictogramAttribution = tile.pictogramAttribution;
      if (tile.image && readImage) {
        const asset = await readImage(tile.image);
        if (asset) {
          const existing = Object.values(engine.view().media).find(
            m => m.sha256 === asset.sha256
          );
          const mediaId = existing ? existing.mediaId : `image-${asset.sha256}`;
          if (!engine.view().media[mediaId])
            await engine.addMedia({ ...asset, mediaId });
          value.mediaId = mediaId;
        }
      }
      if (!current || JSON.stringify(current.value) !== JSON.stringify(value))
        await engine.edit('tile', tile.id, value);
    }
    const current = engine.view().resources[`board:${board.id}`];
    const tileIds =
      board.layout?.tileIds ||
      board.orderedTileIds ||
      board.tiles.map(t => t.id);
    const value = { name: board.name || '患者图板', tileIds };
    if (!current || JSON.stringify(current.value) !== JSON.stringify(value))
      await engine.edit('board', board.id, value);
  }
  for (const r of Object.values(engine.view().resources)) {
    if (r.deleted) continue;
    if (
      (r.kind === 'board' && !wantedBoards.has(r.id)) ||
      (r.kind === 'tile' && !wantedTiles.has(r.id))
    )
      await engine.edit(r.kind, r.id, null, 'delete');
  }
}
