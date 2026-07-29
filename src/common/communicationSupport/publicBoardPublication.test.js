import {
  PUBLIC_BOARD_PUBLICATION_LICENSE,
  buildPrivatePublicBoardDraft,
  buildPublishedPublicBoards,
  createPublicBoardPublicationPlan
} from './publicBoardPublication';

const personalBoard = (id, tiles = []) => ({
  dtoType: 'BoardDTO',
  version: 1,
  id,
  name: id,
  layout: {
    columns: 2,
    rows: Math.max(1, Math.ceil(tiles.length / 2)),
    tileIds: tiles.map(tile => tile.id)
  },
  tiles
});

const tile = (id, boardId, values = {}) => ({
  dtoType: 'TileDTO',
  version: 1,
  id,
  boardId,
  label: id,
  vocalization: id,
  image: `/assets/${id}.png`,
  mediaType: 'image',
  video: '',
  sound: '',
  backgroundColor: '#fff',
  keyPath: '',
  loadBoardId: '',
  communication: {
    synonyms: [],
    relatedTerms: [],
    excludeTokens: [],
    category: ''
  },
  ...values
});

const declaration = {
  author: '家庭贡献者',
  description: '日常沟通板',
  licenseId: PUBLIC_BOARD_PUBLICATION_LICENSE.id,
  rightsConfirmed: true,
  privacyConfirmed: true
};

describe('public board publication', () => {
  test('plans a reachable personal-board graph and deduplicates media', () => {
    const childId = 'device_private_board_child';
    const rootId = 'device_private_board_root';
    const sharedImage = '/assets/shared.png';
    const boards = [
      personalBoard(rootId, [
        tile('open-child', rootId, {
          image: sharedImage,
          loadBoardId: childId
        }),
        tile('drink', rootId, { image: sharedImage })
      ]),
      personalBoard(childId, [
        tile('wave', childId, {
          image: '/assets/wave-poster.png',
          mediaType: 'video',
          video: 'wxfile://wave.mp4',
          sound: 'wxfile://wave.mp3'
        })
      ])
    ];

    const plan = createPublicBoardPublicationPlan(boards, rootId, declaration);

    expect(plan.boardCount).toBe(2);
    expect(plan.tileCount).toBe(3);
    expect(plan.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'image', source: sharedImage }),
        expect.objectContaining({ kind: 'video', source: 'wxfile://wave.mp4' }),
        expect.objectContaining({ kind: 'sound', source: 'wxfile://wave.mp3' })
      ])
    );
    expect(
      plan.assets.filter(asset => asset.source === sharedImage)
    ).toHaveLength(1);
  });

  test('builds private placeholders before any board becomes public', () => {
    expect(
      buildPrivatePublicBoardDraft(
        personalBoard('device_private_board_root'),
        declaration,
        'caregiver@example.com'
      )
    ).toEqual(
      expect.objectContaining({
        author: '家庭贡献者',
        email: 'caregiver@example.com',
        tiles: [],
        isPublic: false
      })
    );
  });

  test('remaps board links and media while preserving public attribution', () => {
    const rootId = 'device_private_board_root';
    const childId = 'device_private_board_child';
    const publicAttribution = {
      provider: 'arasaac',
      originalId: '123',
      name: 'ARASAAC',
      license: 'CC BY-NC-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      author: 'Sergio Palao',
      authorUrl: 'https://arasaac.org/',
      sourceUrl: 'https://arasaac.org/pictograms/zh/123',
      repoKey: 'arasaac'
    };
    const boards = [
      personalBoard(rootId, [
        tile('open-child', rootId, { loadBoardId: childId }),
        tile('water', rootId, { pictogramAttribution: publicAttribution })
      ]),
      personalBoard(childId, [
        tile('family-photo', childId, {
          image: 'wxfile://family.png',
          pictogramAttribution: {
            provider: 'device-private',
            originalId: 'family-photo',
            name: '设备私有图片',
            license: '仅限设备私用',
            licenseUrl: '',
            author: '',
            authorUrl: '',
            sourceUrl: 'device-private://family-photo',
            repoKey: ''
          }
        })
      ])
    ];
    const plan = createPublicBoardPublicationPlan(boards, rootId, declaration);
    const boardIds = new Map([
      [rootId, 'server-root'],
      [childId, 'server-child']
    ]);
    const assetUrls = new Map(
      plan.assets.map(asset => [
        asset.key,
        `https://cdn.example.com/${encodeURIComponent(asset.source)}`
      ])
    );

    const published = buildPublishedPublicBoards(plan, {
      boardIds,
      assetUrls,
      email: 'caregiver@example.com'
    });

    expect(published[0].tiles[0].loadBoard).toBe('server-child');
    expect(published[0].tiles[1].pictogramAttribution).toEqual(
      publicAttribution
    );
    expect(published[1].tiles[0].pictogramAttribution).toEqual(
      expect.objectContaining({
        provider: 'cboard',
        license: 'CC BY 4.0',
        author: '家庭贡献者',
        sourceUrl: 'https://app.cboard.io/board/server-child'
      })
    );
  });

  test('rejects publication without explicit rights and privacy confirmations', () => {
    const boards = [
      personalBoard('device_private_board_root', [
        tile('water', 'device_private_board_root')
      ])
    ];

    expect(() =>
      createPublicBoardPublicationPlan(boards, 'device_private_board_root', {
        ...declaration,
        rightsConfirmed: false
      })
    ).toThrow('rights');
    expect(() =>
      createPublicBoardPublicationPlan(boards, 'device_private_board_root', {
        ...declaration,
        privacyConfirmed: false
      })
    ).toThrow('privacy');
  });

  test('rejects links outside the personal board graph', () => {
    const boards = [
      personalBoard('device_private_board_root', [
        tile('open-default', 'device_private_board_root', {
          loadBoardId: 'default-board'
        })
      ]),
      personalBoard('device_private_board_unused'),
      {
        ...personalBoard('default-board'),
        id: 'default-board'
      }
    ];

    expect(() =>
      createPublicBoardPublicationPlan(
        boards,
        'device_private_board_root',
        declaration
      )
    ).toThrow('built-in or imported');
  });
});
