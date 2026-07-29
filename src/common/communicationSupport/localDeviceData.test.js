import {
  LOCAL_DEVICE_DATA_CATEGORIES,
  LOCAL_DEVICE_DATA_EXPRESSIONS,
  LOCAL_DEVICE_DATA_MANIFEST,
  LOCAL_DEVICE_DATA_PICTOGRAMS,
  LOCAL_DEVICE_DATA_PURPOSES,
  buildLocalDeviceDataFiles,
  buildPrivatePictogramClearPlan,
  mergeLocalDeviceDataRestore,
  normalizeLocalDeviceDataArchiveFiles
} from './localDeviceData';
import {
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
  createPictureLibraryArchivePlan
} from './pictureLibraryArchive';

const privateSource = {
  provider: 'device-private',
  originalId: 'private-1',
  name: '当前设备私有图片',
  license: '用户提供，仅限本机使用',
  sourceUrl: 'device-private://private-1'
};

const publicSource = {
  provider: 'arasaac',
  originalId: 'water',
  name: 'ARASAAC',
  license: 'CC BY-NC-SA 4.0',
  sourceUrl: 'https://arasaac.org/'
};

function createFullManifest() {
  return createPictureLibraryArchivePlan({
    scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
    boards: [
      {
        id: 'home',
        name: '首页',
        tiles: [
          {
            id: 'water',
            boardId: 'home',
            label: '水',
            image: '/water.png',
            pictogramAttribution: publicSource
          }
        ]
      }
    ],
    personalImagePreferences: [
      {
        scope: 'device-private',
        tileId: 'family',
        boardId: 'home',
        labelSnapshot: '家人',
        image: '/family.png',
        pictogramAttribution: privateSource,
        patientId: 'patient',
        workspaceId: 'workspace',
        createdAt: 1,
        updatedAt: 2
      }
    ],
    missingTokens: [],
    orderingState: null,
    sourcePlatform: 'test',
    createdAt: 10
  }).manifest;
}

describe('local device data core', () => {
  test('builds explicit JSON sidecars for library and expression records', () => {
    const result = buildLocalDeviceDataFiles({
      libraryManifest: createFullManifest(),
      savedPhrases: [
        {
          id: 'phrase-1',
          sentence: '我要喝水',
          output: [{ id: 'water', label: '水' }],
          createdAt: 1,
          updatedAt: 1
        }
      ],
      savedPhraseTombstones: [
        {
          id: 'phrase-deleted',
          deletedAt: 2,
          deletedBy: 'local',
          serverVersion: 1,
          pending: true
        }
      ],
      history: [
        {
          id: 'history-1',
          direction: 'express',
          sentence: '我要喝水',
          labels: ['水'],
          sessionId: 'session-1',
          createdAt: 1,
          updatedAt: 1
        }
      ],
      sourcePlatform: 'cboard-web',
      createdAt: 20
    });

    expect(Object.keys(result.files).sort()).toEqual(
      [
        LOCAL_DEVICE_DATA_MANIFEST,
        LOCAL_DEVICE_DATA_PICTOGRAMS,
        LOCAL_DEVICE_DATA_CATEGORIES,
        LOCAL_DEVICE_DATA_EXPRESSIONS
      ].sort()
    );
    expect(result.files[LOCAL_DEVICE_DATA_PICTOGRAMS].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'water',
          scope: 'public'
        }),
        expect.objectContaining({
          id: 'personal:home:family',
          scope: 'device-private'
        })
      ])
    );
    expect(result.files[LOCAL_DEVICE_DATA_EXPRESSIONS].history).toEqual([
      expect.objectContaining({
        id: 'history-1',
        sentence: '我要喝水'
      })
    ]);
    expect(result.manifest.stats).toEqual(
      expect.objectContaining({
        pictogramCount: 2,
        categoryCount: 1,
        expressionCount: 1,
        savedPhraseCount: 1,
        savedPhraseTombstoneCount: 1
      })
    );
  });

  test('normalizes every restorable full-device sidecar', () => {
    const built = buildLocalDeviceDataFiles({
      libraryManifest: createFullManifest(),
      savedPhrases: [
        {
          id: 'phrase-1',
          sentence: '我要喝水',
          output: [{ id: 'water', label: '水' }],
          createdAt: 1,
          updatedAt: 1
        }
      ],
      savedPhraseTombstones: [
        {
          id: 'phrase-deleted',
          deletedAt: 2,
          deletedBy: 'local',
          serverVersion: 1,
          pending: true
        }
      ],
      history: [
        {
          id: 'history-1',
          direction: 'express',
          sentence: '我要喝水',
          labels: ['水'],
          sessionId: 'session-1',
          createdAt: 1,
          updatedAt: 1
        }
      ],
      sourcePlatform: 'cboard-web',
      createdAt: 20
    });

    const normalized = normalizeLocalDeviceDataArchiveFiles({
      manifest: built.files[LOCAL_DEVICE_DATA_MANIFEST],
      pictograms: built.files[LOCAL_DEVICE_DATA_PICTOGRAMS],
      categories: built.files[LOCAL_DEVICE_DATA_CATEGORIES],
      expressions: built.files[LOCAL_DEVICE_DATA_EXPRESSIONS]
    });

    expect(normalized.expressions.savedPhrases[0].id).toBe('phrase-1');
    expect(normalized.expressions.savedPhraseTombstones[0].id).toBe(
      'phrase-deleted'
    );
    expect(normalized.expressions.history[0].sentence).toBe('我要喝水');
  });

  test('rejects a complete-device archive with inconsistent sidecars', () => {
    const built = buildLocalDeviceDataFiles({
      libraryManifest: createFullManifest()
    });

    expect(() =>
      normalizeLocalDeviceDataArchiveFiles({
        manifest: built.files[LOCAL_DEVICE_DATA_MANIFEST],
        pictograms: {
          ...built.files[LOCAL_DEVICE_DATA_PICTOGRAMS],
          items: []
        },
        categories: built.files[LOCAL_DEVICE_DATA_CATEGORIES],
        expressions: built.files[LOCAL_DEVICE_DATA_EXPRESSIONS]
      })
    ).toThrow(/pictogramCount/);
  });

  test('rejects a custom-only library for a full device backup', () => {
    const manifest = createPictureLibraryArchivePlan({
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.custom
    }).manifest;

    expect(() =>
      buildLocalDeviceDataFiles({ libraryManifest: manifest })
    ).toThrow(/purpose does not match/);
  });

  test('allows a compact account snapshot only with its explicit purpose', () => {
    const manifest = createPictureLibraryArchivePlan({
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.custom
    }).manifest;
    const built = buildLocalDeviceDataFiles({
      libraryManifest: manifest,
      purpose: LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot,
      savedPhrases: [
        {
          id: 'phrase-1',
          sentence: '我要喝水',
          output: [],
          createdAt: 1,
          updatedAt: 1
        }
      ]
    });

    const normalized = normalizeLocalDeviceDataArchiveFiles({
      manifest: built.files[LOCAL_DEVICE_DATA_MANIFEST],
      pictograms: built.files[LOCAL_DEVICE_DATA_PICTOGRAMS],
      categories: built.files[LOCAL_DEVICE_DATA_CATEGORIES],
      expressions: built.files[LOCAL_DEVICE_DATA_EXPRESSIONS],
      libraryManifest: manifest
    });

    expect(normalized.manifest.purpose).toBe(
      LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot
    );
    expect(normalized.expressions.savedPhrases[0].sentence).toBe('我要喝水');
  });

  test('rejects an account snapshot purpose paired with a full library', () => {
    expect(() =>
      buildLocalDeviceDataFiles({
        libraryManifest: createFullManifest(),
        purpose: LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot
      })
    ).toThrow(/purpose does not match/);
  });

  test('merges every restorable record by stable ID and rebinds identity', () => {
    const restored = mergeLocalDeviceDataRestore({
      current: {
        savedPhrases: [
          {
            id: 'phrase-shared',
            sentence: '本机冲突常用语',
            output: [],
            createdAt: 1,
            updatedAt: 1
          },
          {
            id: 'phrase-local',
            sentence: '仅本机常用语',
            output: [],
            createdAt: 1,
            updatedAt: 1
          }
        ],
        history: [
          {
            id: 'history-local',
            direction: 'express',
            sentence: '仅本机历史',
            createdAt: 1,
            updatedAt: 1
          }
        ]
      },
      imported: {
        savedPhrases: [
          {
            id: 'phrase-shared',
            sentence: '归档冲突常用语',
            output: [],
            createdAt: 2,
            updatedAt: 2
          }
        ],
        savedPhraseTombstones: [
          {
            id: 'phrase-deleted',
            deletedAt: 3,
            serverVersion: 1
          }
        ],
        history: [
          {
            id: 'history-backup',
            direction: 'express',
            sentence: '归档历史',
            patientId: 'patient-old',
            workspaceId: 'workspace-old',
            createdAt: 4,
            updatedAt: 4
          }
        ],
        receiverRecords: [
          {
            id: 'receiver-backup',
            direction: 'receive',
            sentence: '归档接收记录',
            recordStatus: 'confirmed',
            sessionId: 'session-backup',
            patientId: 'patient-old',
            workspaceId: 'workspace-old',
            createdAt: 5,
            updatedAt: 5
          }
        ],
        receiverCorrections: [
          {
            id: 'correction-backup',
            expressionId: 'receiver-backup',
            sessionId: 'session-backup',
            patientId: 'patient-old',
            workspaceId: 'workspace-old',
            action: 'replace_pictogram',
            originalToken: '旧词',
            normalizedToken: '新词',
            createdAt: 6
          }
        ],
        expressionCandidateFeedbackDrafts: [
          {
            id: 'feedback-backup',
            sessionId: 'session-backup',
            outputSignature: 'output-backup',
            candidates: [{ sentence: '归档候选句。', feedback: 'up' }],
            createdAt: 7,
            updatedAt: 7
          }
        ]
      },
      identity: {
        patientId: 'patient-current',
        workspaceId: 'workspace-current'
      },
      conflictStrategy: 'merge'
    });

    expect(restored.savedPhrases.map(item => item.sentence)).toEqual([
      '归档冲突常用语',
      '仅本机常用语'
    ]);
    expect(restored.savedPhraseTombstones[0].id).toBe('phrase-deleted');
    expect(restored.history.map(item => item.id)).toEqual([
      'history-backup',
      'history-local'
    ]);
    expect(restored.receiverRecords[0]).toEqual(
      expect.objectContaining({
        id: 'receiver-backup',
        patientId: 'patient-current',
        workspaceId: 'workspace-current'
      })
    );
    expect(restored.receiverCorrections[0]).toEqual(
      expect.objectContaining({
        id: 'correction-backup',
        patientId: 'patient-current',
        workspaceId: 'workspace-current'
      })
    );
    expect(restored.expressionCandidateFeedbackDrafts[0].id).toBe(
      'feedback-backup'
    );
  });

  test('keeps the local conflict while still adding unique archive records', () => {
    const restored = mergeLocalDeviceDataRestore({
      current: {
        savedPhrases: [
          {
            id: 'phrase-shared',
            sentence: '保留本机版本',
            output: [],
            createdAt: 1,
            updatedAt: 1
          }
        ]
      },
      imported: {
        savedPhrases: [
          {
            id: 'phrase-shared',
            sentence: '归档冲突版本',
            output: [],
            createdAt: 2,
            updatedAt: 2
          },
          {
            id: 'phrase-new',
            sentence: '归档新增版本',
            output: [],
            createdAt: 2,
            updatedAt: 2
          }
        ]
      },
      conflictStrategy: 'skip'
    });

    expect(restored.savedPhrases.map(item => item.sentence)).toEqual([
      '保留本机版本',
      '归档新增版本'
    ]);
  });

  test('clears only device-private pictograms and preserves public resolutions', () => {
    const privateRecord = {
      id: 'private-record',
      normalizedToken: '家人',
      status: 'resolved',
      occurrenceCount: 1,
      scenes: ['receiver'],
      rawTextSamples: ['找家人'],
      resolvedPictogramId: 'private-1',
      resolvedPictogram: {
        id: 'private-1',
        label: '家人',
        image: '/private.png',
        source: privateSource
      },
      source: 'device-private',
      reviewedByCaregiver: true,
      patientId: 'patient',
      workspaceId: 'workspace',
      createdAt: 1,
      updatedAt: 2
    };
    const publicRecord = {
      ...privateRecord,
      id: 'public-record',
      normalizedToken: '水',
      resolvedPictogramId: 'water',
      resolvedPictogram: {
        id: 'water',
        label: '水',
        image: '/water.png',
        source: publicSource
      },
      source: 'online'
    };
    const preferences = [
      {
        scope: 'device-private',
        tileId: 'family',
        boardId: 'home',
        labelSnapshot: '家人',
        image: '/family.png',
        pictogramAttribution: privateSource,
        patientId: 'patient',
        workspaceId: 'workspace',
        createdAt: 1,
        updatedAt: 2
      }
    ];

    const plan = buildPrivatePictogramClearPlan({
      personalImagePreferences: preferences,
      missingTokens: [privateRecord, publicRecord],
      now: 50
    });

    expect(plan.personalImagePreferences).toEqual([]);
    expect(plan.imageSources.sort()).toEqual(
      ['/family.png', '/private.png'].sort()
    );
    expect(plan.removedPreferenceCount).toBe(1);
    expect(plan.removedRuntimePictogramCount).toBe(1);
    expect(
      plan.missingTokens.find(item => item.id === 'private-record')
    ).toEqual(
      expect.objectContaining({
        status: 'new',
        resolvedPictogramId: null,
        resolvedPictogram: null,
        reviewedByCaregiver: false,
        updatedAt: 50
      })
    );
    expect(
      plan.missingTokens.find(item => item.id === 'public-record')
    ).toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'water'
      })
    );
    expect(preferences).toHaveLength(1);
    expect(privateRecord.resolvedPictogramId).toBe('private-1');
  });
});
