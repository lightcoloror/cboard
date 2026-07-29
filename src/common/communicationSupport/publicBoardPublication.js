import { isPersonalCommunicationBoard } from './boardManagement';
import { normalizePublicPictogramAttribution } from './pictogramAttribution';

export const PUBLIC_BOARD_PUBLICATION_LICENSE = {
  id: 'cc-by-4.0',
  name: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/'
};

export const MAX_PUBLICATION_BOARDS = 100;
export const MAX_PUBLICATION_TILES = 5000;

const CBOARD_PUBLIC_APP_URL = 'https://app.cboard.io/board/';
const CBOARD_COMMUNITY_PROVIDER = 'cboard';

function normalizeText(value, maxLength = 500) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function requireText(value, name, maxLength) {
  const normalized = normalizeText(value, maxLength);
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function publicationAssetKey(kind, source) {
  return `${kind}:${String(source || '').trim()}`;
}

function tileAssetEntries(tile) {
  const entries = [];
  const image = normalizeText(tile && tile.image, 4096);
  const video = normalizeText(tile && tile.video, 4096);
  const sound = normalizeText(tile && tile.sound, 4096);

  if (image) entries.push({ kind: 'image', source: image });
  if (video) entries.push({ kind: 'video', source: video });
  if (sound) entries.push({ kind: 'sound', source: sound });
  return entries;
}

function collectReachablePersonalBoards(boards, rootBoardId) {
  const boardMap = new Map(
    (Array.isArray(boards) ? boards : []).map(board => [board.id, board])
  );
  const root = boardMap.get(String(rootBoardId || '').trim());
  if (!isPersonalCommunicationBoard(root)) {
    throw new TypeError('Only a personal board can be published');
  }

  const reachable = [];
  const visited = new Set();
  const pending = [root.id];

  while (pending.length) {
    const boardId = pending.shift();
    if (visited.has(boardId)) continue;
    visited.add(boardId);

    const board = boardMap.get(boardId);
    if (!isPersonalCommunicationBoard(board)) {
      throw new TypeError(
        'Published board links must point to personal boards in the same library'
      );
    }
    reachable.push(board);

    for (const tile of board.tiles || []) {
      const targetId = normalizeText(
        tile && (tile.loadBoardId || tile.loadBoard),
        200
      );
      if (!targetId) continue;
      if (!boardMap.has(targetId)) {
        throw new TypeError('Published board contains a missing board link');
      }
      if (!isPersonalCommunicationBoard(boardMap.get(targetId))) {
        throw new TypeError(
          'Published board cannot link to a built-in or imported board'
        );
      }
      pending.push(targetId);
    }
  }

  return reachable;
}

function validatePublicationDeclaration(value) {
  const declaration = value || {};
  if (declaration.rightsConfirmed !== true) {
    throw new TypeError('Publication rights must be confirmed');
  }
  if (declaration.privacyConfirmed !== true) {
    throw new TypeError('Publication privacy must be confirmed');
  }
  if (
    declaration.licenseId &&
    declaration.licenseId !== PUBLIC_BOARD_PUBLICATION_LICENSE.id
  ) {
    throw new TypeError('Unsupported public board license');
  }

  return {
    author: requireText(declaration.author, 'Publication author', 100),
    description: normalizeText(declaration.description, 500),
    licenseId: PUBLIC_BOARD_PUBLICATION_LICENSE.id,
    rightsConfirmed: true,
    privacyConfirmed: true
  };
}

export function createPublicBoardPublicationPlan(
  boards,
  rootBoardId,
  declaration
) {
  const normalizedDeclaration = validatePublicationDeclaration(declaration);
  const publicationBoards = collectReachablePersonalBoards(boards, rootBoardId);
  const tileCount = publicationBoards.reduce(
    (count, board) =>
      count + (Array.isArray(board.tiles) ? board.tiles.length : 0),
    0
  );

  if (publicationBoards.length > MAX_PUBLICATION_BOARDS) {
    throw new TypeError(
      `Public board cannot contain more than ${MAX_PUBLICATION_BOARDS} boards`
    );
  }
  if (tileCount > MAX_PUBLICATION_TILES) {
    throw new TypeError(
      `Public board cannot contain more than ${MAX_PUBLICATION_TILES} tiles`
    );
  }

  const assets = new Map();
  publicationBoards.forEach(board => {
    (board.tiles || []).forEach(tile => {
      const targetId = normalizeText(
        tile && (tile.loadBoardId || tile.loadBoard),
        200
      );
      if (!targetId && !normalizeText(tile && tile.image, 4096)) {
        throw new TypeError('Every public pictogram must include an image');
      }
      tileAssetEntries(tile).forEach(asset => {
        const key = publicationAssetKey(asset.kind, asset.source);
        if (!assets.has(key)) assets.set(key, { ...asset, key });
      });
    });
  });

  return {
    version: 1,
    rootBoardId: publicationBoards[0].id,
    boards: publicationBoards,
    boardCount: publicationBoards.length,
    tileCount,
    assets: Array.from(assets.values()),
    declaration: normalizedDeclaration
  };
}

export function buildPrivatePublicBoardDraft(board, declaration, email) {
  return {
    name: requireText(board && board.name, 'Board name', 160),
    author: requireText(declaration && declaration.author, 'Board author', 100),
    email: requireText(email, 'Board owner email', 254),
    tiles: [],
    isPublic: false,
    locale: 'zh-CN',
    description: normalizeText(declaration && declaration.description, 500)
  };
}

function requirePublicationMapValue(values, key, name) {
  const value = values instanceof Map ? values.get(key) : values && values[key];
  return requireText(value, name, 4096);
}

function buildCommunityAttribution(plan, boardId, tile) {
  const existing = normalizePublicPictogramAttribution(
    tile && tile.pictogramAttribution
  );
  if (existing) return existing;

  return {
    provider: CBOARD_COMMUNITY_PROVIDER,
    originalId: `${boardId}:${tile.id}`,
    name: 'CBoard community',
    license: PUBLIC_BOARD_PUBLICATION_LICENSE.name,
    licenseUrl: PUBLIC_BOARD_PUBLICATION_LICENSE.url,
    author: plan.declaration.author,
    authorUrl: '',
    sourceUrl: CBOARD_PUBLIC_APP_URL + boardId,
    repoKey: 'cboard-community'
  };
}

function buildPublishedTile(plan, board, tile, boardIds, assetUrls) {
  const serverBoardId = requirePublicationMapValue(
    boardIds,
    board.id,
    'Published board id'
  );
  const targetId = normalizeText(
    tile && (tile.loadBoardId || tile.loadBoard),
    200
  );
  const image = normalizeText(tile && tile.image, 4096);
  const video = normalizeText(tile && tile.video, 4096);
  const sound = normalizeText(tile && tile.sound, 4096);
  const published = {
    id: requireText(tile && tile.id, 'Tile id', 200),
    label: requireText(tile && tile.label, 'Tile label', 160),
    vocalization: normalizeText(tile && tile.vocalization, 160),
    backgroundColor: normalizeText(tile && tile.backgroundColor, 80),
    communication: tile && tile.communication ? tile.communication : undefined
  };

  if (targetId) {
    published.loadBoard = requirePublicationMapValue(
      boardIds,
      targetId,
      'Published linked board id'
    );
  }
  if (image) {
    published.image = requirePublicationMapValue(
      assetUrls,
      publicationAssetKey('image', image),
      'Published image URL'
    );
  }
  if (video) {
    published.mediaType = 'video';
    published.video = requirePublicationMapValue(
      assetUrls,
      publicationAssetKey('video', video),
      'Published video URL'
    );
  } else if (tile.mediaType === 'gif') {
    published.mediaType = 'gif';
  }
  if (sound) {
    published.sound = requirePublicationMapValue(
      assetUrls,
      publicationAssetKey('sound', sound),
      'Published sound URL'
    );
  }
  if (!targetId) {
    published.pictogramAttribution = buildCommunityAttribution(
      plan,
      serverBoardId,
      tile
    );
  }

  return published;
}

export function buildPublishedPublicBoards(
  plan,
  { boardIds, assetUrls, email } = {}
) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.boards)) {
    throw new TypeError('Invalid public board publication plan');
  }

  return plan.boards.map(board => {
    const serverBoardId = requirePublicationMapValue(
      boardIds,
      board.id,
      'Published board id'
    );
    return {
      id: serverBoardId,
      name: requireText(board.name, 'Board name', 160),
      author: plan.declaration.author,
      email: requireText(email, 'Board owner email', 254),
      tiles: (board.tiles || []).map(tile =>
        buildPublishedTile(plan, board, tile, boardIds, assetUrls)
      ),
      isPublic: true,
      locale: 'zh-CN',
      description: plan.declaration.description
    };
  });
}
