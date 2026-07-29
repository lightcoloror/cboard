import {
  PICTURE_LIBRARY_ARCHIVE_FORMAT,
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
  PICTURE_LIBRARY_CONFLICT_STRATEGIES,
  PICTURE_LIBRARY_PROGRESS_PHASES,
  createPictureLibraryArchivePlan,
  createPictureLibraryProgress,
  normalizePictureLibraryArchiveManifest,
  restorePictureLibraryArchive,
  updatePictureLibraryArchiveAssetMetadata
} from './pictureLibraryArchive';

const SHARED_IMAGE = 'data:image/png;base64,c2hhcmVk';
const PERSONAL_IMAGE = 'data:image/jpeg;base64,cGVyc29uYWw=';
const RUNTIME_IMAGE = 'data:image/png;base64,cnVudGltZQ==';
const WATER_SOUND = 'data:audio/mpeg;base64,SUQzBA==';
const WATER_VIDEO = 'data:video/mp4;base64,AAAAHGZ0eXBpc29t';

function createSource(originalId) {
  return {
    provider: 'device-private',
    originalId,
    name: '当前设备私有图片',
    license: '用户提供，仅限本机使用',
    licenseUrl: null,
    author: null,
    authorUrl: null,
    sourceUrl: `device-private://missing-token/${originalId}`
  };
}

function createInput() {
  return {
    boards: [
      {
        id: 'food',
        name: '饮食',
        isFixed: true,
        grid: {
          rows: 1,
          columns: 2,
          order: [['water', 'cup']]
        },
        tiles: [
          {
            id: 'water',
            label: '水',
            vocalization: '喝水',
            image: SHARED_IMAGE,
            sound: WATER_SOUND,
            mediaType: 'video',
            video: WATER_VIDEO,
            communicationSynonyms: ['饮水'],
            communicationCategory: '饮品'
          },
          {
            id: 'cup',
            label: '杯子',
            image: SHARED_IMAGE,
            communication: {
              synonyms: ['水杯'],
              relatedTerms: ['喝水'],
              excludeTokens: ['奖杯'],
              category: '餐具'
            }
          }
        ]
      }
    ],
    personalImagePreferences: [
      {
        scope: 'device-private',
        tileId: 'water',
        boardId: 'food',
        labelSnapshot: '家里的水杯',
        image: PERSONAL_IMAGE,
        pictogramAttribution: {
          ...createSource('personal-water'),
          name: '家里的水杯照片',
          license: '家属提供，仅用于当前设备沟通',
          author: '家属'
        },
        patientId: 'patient-a',
        workspaceId: 'workspace-a',
        createdAt: 10,
        updatedAt: 20
      }
    ],
    missingTokens: [
      {
        id: 'missing-1',
        normalizedToken: '急救包',
        status: 'resolved',
        occurrenceCount: 3,
        source: 'device-private',
        reviewedByCaregiver: true,
        resolvedPictogramId: 'device_private_missing_missing-1',
        resolvedPictogram: {
          id: 'device_private_missing_missing-1',
          label: '急救包',
          vocalization: '急救包',
          image: RUNTIME_IMAGE,
          backgroundColor: '#ffffff',
          source: createSource('missing-1')
        },
        patientId: 'patient-a',
        workspaceId: 'workspace-a',
        createdAt: 30,
        updatedAt: 40
      }
    ],
    orderingState: {
      schemaVersion: 1,
      manualOrderByBoard: {
        food: ['cup', 'water']
      },
      usageByTileKey: {
        'food:water': {
          count: 7,
          lastUsedAt: 50
        },
        'food:cup': {
          count: 2,
          lastUsedAt: 60
        }
      }
    }
  };
}

function createAssetLocations(plan) {
  return Object.fromEntries(
    plan.assets.map(asset => [asset.path, `restored://${asset.path}`])
  );
}

describe('picture library archive', () => {
  test('creates a full portable plan with metadata, usage and deduplicated images', () => {
    const plan = createPictureLibraryArchivePlan({
      ...createInput(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      sourcePlatform: 'cboard-web',
      createdAt: 123
    });

    expect(plan.manifest).toEqual(
      expect.objectContaining({
        format: PICTURE_LIBRARY_ARCHIVE_FORMAT,
        version: 1,
        scope: 'full',
        createdAt: 123,
        sourcePlatform: 'cboard-web',
        stats: {
          boardCount: 1,
          tileCount: 2,
          customPictureCount: 2,
          assetCount: 5,
          pictureAssetCount: 3,
          soundAssetCount: 1,
          videoAssetCount: 1
        }
      })
    );
    expect(plan.assets).toHaveLength(5);
    expect(plan.manifest.boards[0].tiles[0]).toEqual(
      expect.objectContaining({
        id: 'water',
        label: '水',
        vocalization: '喝水',
        mediaType: 'video',
        usageCount: 7,
        communicationSynonyms: ['饮水'],
        communicationCategory: '饮品'
      })
    );
    expect(plan.manifest.boards[0].tiles[0].image).toEqual(
      plan.manifest.boards[0].tiles[1].image
    );
    expect(plan.manifest.boards[0].tiles[0].sound.path).toMatch(
      /^sounds\/boards\/.+\.mp3$/
    );
    expect(plan.manifest.boards[0].tiles[0].video.path).toMatch(
      /^videos\/boards\/.+\.mp4$/
    );
    expect(JSON.stringify(plan.manifest)).not.toContain('patient-a');
    expect(JSON.stringify(plan.manifest)).not.toContain('workspace-a');
  });

  test('limits a custom archive to private pictures and their usage metadata', () => {
    const plan = createPictureLibraryArchivePlan({
      ...createInput(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.custom
    });

    expect(plan.manifest.boards).toEqual([]);
    expect(plan.manifest.personalImagePreferences).toHaveLength(1);
    expect(
      plan.manifest.personalImagePreferences[0].pictogramAttribution
    ).toEqual(
      expect.objectContaining({
        provider: 'device-private',
        author: '家属',
        license: '家属提供，仅用于当前设备沟通'
      })
    );
    expect(plan.manifest.missingTokenResolutions).toHaveLength(1);
    expect(plan.manifest.orderingState).toEqual({
      schemaVersion: 1,
      manualOrderByBoard: {},
      usageByTileKey: {
        'food:water': {
          count: 7,
          lastUsedAt: 50
        }
      }
    });
    expect(plan.assets).toHaveLength(2);
  });

  test('preserves BoardDTO layout and category across a full archive', () => {
    const dtoBoards = [
      {
        dtoType: 'BoardDTO',
        version: 1,
        id: 'daily',
        name: '日常',
        nameKey: 'board.daily',
        category: 'needs',
        layout: {
          columns: 2,
          rows: 1,
          tileIds: ['water', 'cup']
        },
        tiles: [
          {
            dtoType: 'TileDTO',
            version: 1,
            id: 'water',
            boardId: 'daily',
            label: '水',
            vocalization: '水',
            image: SHARED_IMAGE,
            backgroundColor: '',
            keyPath: '',
            loadBoardId: '',
            communication: {
              synonyms: [],
              relatedTerms: [],
              excludeTokens: [],
              category: ''
            }
          },
          {
            dtoType: 'TileDTO',
            version: 1,
            id: 'cup',
            boardId: 'daily',
            label: '杯子',
            vocalization: '杯子',
            image: PERSONAL_IMAGE,
            backgroundColor: '',
            keyPath: '',
            loadBoardId: '',
            communication: {
              synonyms: [],
              relatedTerms: [],
              excludeTokens: [],
              category: ''
            }
          }
        ]
      }
    ];
    const plan = createPictureLibraryArchivePlan({
      boards: dtoBoards,
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full
    });
    const restored = restorePictureLibraryArchive({
      manifest: plan.manifest,
      assetLocations: createAssetLocations(plan),
      existingBoards: [],
      identity: {}
    });

    expect(restored.boards[0]).toEqual(
      expect.objectContaining({
        dtoType: 'BoardDTO',
        version: 1,
        category: 'needs',
        layout: {
          columns: 2,
          rows: 1,
          tileIds: ['water', 'cup']
        }
      })
    );
  });

  test('normalizes asset metadata and rejects path traversal or missing references', () => {
    const plan = createPictureLibraryArchivePlan({
      ...createInput(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full
    });
    const firstAsset = plan.assets[0];
    const normalized = updatePictureLibraryArchiveAssetMetadata(plan.manifest, [
      {
        path: firstAsset.path,
        mediaType: 'image/png',
        size: 12
      }
    ]);

    expect(normalized.assets[0]).toEqual({
      path: firstAsset.path,
      mediaType: 'image/png',
      size: 12
    });
    expect(() =>
      normalizePictureLibraryArchiveManifest({
        ...plan.manifest,
        assets: [
          {
            path: '../secret.png'
          }
        ]
      })
    ).toThrow('missing image');
  });

  test('restores assets and applies deterministic merge and skip conflict policies', () => {
    const plan = createPictureLibraryArchivePlan({
      ...createInput(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full
    });
    const existingBoards = [
      {
        id: 'food',
        name: '本机饮食',
        tiles: [
          {
            id: 'local-water',
            label: '本机水',
            image: 'local://water'
          }
        ]
      },
      {
        id: 'local-only',
        name: '仅本机',
        tiles: []
      }
    ];
    const existingPreferences = [
      {
        scope: 'device-private',
        tileId: 'water',
        boardId: 'food',
        labelSnapshot: '本机图片',
        image: 'local://personal',
        patientId: 'patient-b',
        workspaceId: 'workspace-b',
        createdAt: 1,
        updatedAt: 2
      }
    ];
    const base = {
      manifest: plan.manifest,
      assetLocations: createAssetLocations(plan),
      existingBoards,
      existingPersonalImagePreferences: existingPreferences,
      existingMissingTokens: [],
      existingOrderingState: {
        schemaVersion: 1,
        manualOrderByBoard: {
          local: ['tile']
        },
        usageByTileKey: {
          'food:water': {
            count: 1,
            lastUsedAt: 1
          }
        }
      },
      identity: {
        patientId: 'patient-b',
        workspaceId: 'workspace-b'
      }
    };
    const merged = restorePictureLibraryArchive({
      ...base,
      conflictStrategy: PICTURE_LIBRARY_CONFLICT_STRATEGIES.merge
    });
    const skipped = restorePictureLibraryArchive({
      ...base,
      conflictStrategy: PICTURE_LIBRARY_CONFLICT_STRATEGIES.skip
    });

    expect(merged.boards.map(board => board.id)).toEqual([
      'food',
      'local-only'
    ]);
    expect(merged.boards[0].name).toBe('饮食');
    expect(merged.boards[0].tiles[0].image).toContain(
      'restored://images/boards/'
    );
    expect(merged.boards[0].tiles[0].sound).toContain(
      'restored://sounds/boards/'
    );
    expect(merged.boards[0].tiles[0]).toEqual(
      expect.objectContaining({
        mediaType: 'video',
        video: expect.stringContaining('restored://videos/boards/')
      })
    );
    expect(skipped.boards[0].name).toBe('本机饮食');
    expect(merged.personalImagePreferences[0]).toEqual(
      expect.objectContaining({
        patientId: 'patient-b',
        workspaceId: 'workspace-b',
        labelSnapshot: '家里的水杯',
        pictogramAttribution: expect.objectContaining({
          provider: 'device-private',
          author: '家属',
          license: '家属提供，仅用于当前设备沟通'
        })
      })
    );
    expect(skipped.personalImagePreferences[0].labelSnapshot).toBe('本机图片');
    expect(merged.missingTokens[0].resolvedPictogram.image).toContain(
      'restored://images/runtime/'
    );
    expect(merged.orderingState.usageByTileKey['food:water'].count).toBe(7);
    expect(skipped.orderingState.usageByTileKey['food:water'].count).toBe(1);
    expect(merged.orderingState.manualOrderByBoard.local).toEqual(['tile']);
  });

  test('reports bounded progress for large-library operations', () => {
    expect(
      createPictureLibraryProgress(
        PICTURE_LIBRARY_PROGRESS_PHASES.collecting,
        5,
        20,
        '正在读取图片'
      )
    ).toEqual({
      phase: 'collecting',
      completed: 5,
      total: 20,
      percent: 25,
      detail: '正在读取图片'
    });
    expect(
      createPictureLibraryProgress(
        PICTURE_LIBRARY_PROGRESS_PHASES.complete,
        0,
        0
      ).percent
    ).toBe(100);
  });

  test('plans a full backup for a vocabulary larger than 10000 tiles', () => {
    const tiles = Array.from({ length: 12000 }, (_, index) => ({
      id: `tile-${index + 1}`,
      label: `词语 ${index + 1}`
    }));
    const plan = createPictureLibraryArchivePlan({
      boards: [{ id: 'large', name: '大型词库', tiles }],
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full
    });

    expect(plan.manifest.stats.boardCount).toBe(1);
    expect(plan.manifest.stats.tileCount).toBe(12000);
  });
});
