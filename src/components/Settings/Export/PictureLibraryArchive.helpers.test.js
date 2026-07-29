import JSZip from 'jszip';

import {
  LOCAL_DEVICE_DATA_CATEGORIES,
  LOCAL_DEVICE_DATA_EXPRESSIONS,
  LOCAL_DEVICE_DATA_MANIFEST,
  LOCAL_DEVICE_DATA_PICTOGRAMS
} from '../../../common/communicationSupport/localDeviceData';
import {
  PICTURE_LIBRARY_ARCHIVE_NOT_FOUND,
  buildPrivateDeviceDataArchive,
  buildPictureLibraryArchive,
  persistPictureLibraryRestore,
  readPictureLibraryArchive
} from './PictureLibraryArchive.helpers';
import {
  PICTURE_LIBRARY_ARCHIVE_MANIFEST,
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
  createPictureLibraryArchivePlan
} from '../../../common/communicationSupport/pictureLibraryArchive';
import {
  loadCommunicationHistory,
  loadCommunicationSavedPhrases,
  loadCommunicationSavedPhraseTombstones,
  loadExpressionCandidateFeedbackDrafts,
  loadPersonalImageRuntime,
  loadReceiverCorrections,
  loadReceiverRecords
} from '../../../common/communicationSupport/localData';

const IMAGE_SOURCE = 'fixture://water.png';
const IMAGE_BYTES = new Uint8Array([1, 2, 3, 4]);
const SOUND_SOURCE = 'fixture://water.mp3';
const SOUND_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
const VIDEO_SOURCE = 'fixture://water.mp4';
const VIDEO_BYTES = new Uint8Array([
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70,
  0x69,
  0x73,
  0x6f,
  0x6d
]);

function createBoards() {
  return [
    {
      id: 'food',
      name: '饮食',
      tiles: [
        {
          id: 'water',
          label: '水',
          image: IMAGE_SOURCE,
          communicationSynonyms: ['饮水']
        }
      ]
    }
  ];
}

function createMediaBoards(mediaKind, count) {
  return [
    {
      id: `${mediaKind}-board`,
      name: mediaKind,
      tiles: Array.from({ length: count }, (_, index) => ({
        id: `${mediaKind}-${index}`,
        label: `${mediaKind} ${index}`,
        image: IMAGE_SOURCE,
        ...(mediaKind === 'sound'
          ? { sound: `fixture://${mediaKind}-${index}.mp3` }
          : {
              mediaType: 'video',
              video: `fixture://${mediaKind}-${index}.mp4`
            })
      }))
    }
  ];
}

async function createMediaArchive(mediaKind, count, bytes) {
  return buildPictureLibraryArchive({
    boards: createMediaBoards(mediaKind, count),
    scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
    personalImagePreferences: [],
    missingTokens: [],
    orderingState: null,
    zipType: 'uint8array',
    readImage: async (source, kind) => ({
      data: kind === 'image' ? IMAGE_BYTES : bytes,
      mediaType:
        kind === 'image'
          ? 'image/png'
          : kind === 'sound'
          ? 'audio/mpeg'
          : 'video/mp4',
      size: kind === 'image' ? IMAGE_BYTES.byteLength : bytes.byteLength
    })
  });
}

function asFile(content) {
  const start = content.byteOffset;
  const end = start + content.byteLength;
  return {
    arrayBuffer: async () => content.buffer.slice(start, end)
  };
}

describe('web picture library ZIP adapter', () => {
  test('builds a compact account snapshot with device sidecars but no complete board set', async () => {
    const built = await buildPrivateDeviceDataArchive({
      createdAt: 1700000000000,
      zipType: 'uint8array'
    });
    const zip = await JSZip.loadAsync(built.content);
    const manifest = JSON.parse(
      await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST).async('text')
    );

    expect(manifest.scope).toBe(PICTURE_LIBRARY_ARCHIVE_SCOPES.custom);
    expect(manifest.boards).toEqual([]);
    expect(zip.file(LOCAL_DEVICE_DATA_MANIFEST)).not.toBeNull();
    expect(zip.file(LOCAL_DEVICE_DATA_EXPRESSIONS)).not.toBeNull();
    expect(built.deviceDataManifest).not.toBeNull();
  });

  test('writes a valid ZIP and restores its metadata and image bytes', async () => {
    const progress = [];
    const built = await buildPictureLibraryArchive({
      boards: createBoards(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: {
        schemaVersion: 1,
        manualOrderByBoard: {},
        usageByTileKey: {
          'food:water': {
            count: 4,
            lastUsedAt: 10
          }
        }
      },
      createdAt: 100,
      zipType: 'uint8array',
      readImage: async source => {
        expect(source).toBe(IMAGE_SOURCE);
        return {
          data: IMAGE_BYTES,
          mediaType: 'image/png',
          size: IMAGE_BYTES.byteLength
        };
      },
      onProgress: value => progress.push(value)
    });
    const zip = await JSZip.loadAsync(built.content);
    const manifest = JSON.parse(
      await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST).async('text')
    );
    const imagePath = manifest.assets[0].path;

    expect(manifest.stats).toEqual({
      boardCount: 1,
      tileCount: 1,
      customPictureCount: 0,
      assetCount: 1,
      pictureAssetCount: 1,
      soundAssetCount: 0,
      videoAssetCount: 0
    });
    expect(manifest.boards[0].tiles[0].usageCount).toBe(4);
    expect(await zip.file(imagePath).async('uint8array')).toEqual(IMAGE_BYTES);
    expect(progress.some(item => item.phase === 'collecting')).toBe(true);
    expect(progress[progress.length - 1].percent).toBe(100);

    const restored = await readPictureLibraryArchive({
      file: asFile(built.content),
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      identity: {
        patientId: 'patient-local',
        workspaceId: 'workspace-local'
      },
      conflictStrategy: 'merge'
    });

    expect(restored.boards[0]).toEqual(
      expect.objectContaining({
        id: 'food',
        name: '饮食'
      })
    );
    expect(restored.boards[0].tiles[0]).toEqual(
      expect.objectContaining({
        id: 'water',
        label: '水',
        image: 'data:image/png;base64,AQIDBA=='
      })
    );
  });

  test('rejects a generic ZIP without a picture library manifest', async () => {
    const zip = new JSZip();
    zip.file('other.json', '{}');
    const content = await zip.generateAsync({ type: 'uint8array' });

    await expect(
      readPictureLibraryArchive({
        file: asFile(content),
        existingPersonalImagePreferences: [],
        existingMissingTokens: [],
        identity: {
          patientId: 'patient-local',
          workspaceId: 'workspace-local'
        }
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: PICTURE_LIBRARY_ARCHIVE_NOT_FOUND
      })
    );
  });

  test('stores tile recordings and videos as playable media data', async () => {
    const boards = createBoards();
    boards[0].tiles[0].sound = SOUND_SOURCE;
    boards[0].tiles[0].mediaType = 'video';
    boards[0].tiles[0].video = VIDEO_SOURCE;
    const built = await buildPictureLibraryArchive({
      boards,
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null,
      zipType: 'uint8array',
      readImage: async (source, mediaKind) => {
        if (mediaKind === 'sound') {
          expect(source).toBe(SOUND_SOURCE);
          return {
            data: SOUND_BYTES,
            mediaType: 'audio/mpeg',
            size: SOUND_BYTES.byteLength
          };
        }
        if (mediaKind === 'video') {
          expect(source).toBe(VIDEO_SOURCE);
          return {
            data: VIDEO_BYTES,
            mediaType: 'video/mp4',
            size: VIDEO_BYTES.byteLength
          };
        }
        return {
          data: IMAGE_BYTES,
          mediaType: 'image/png',
          size: IMAGE_BYTES.byteLength
        };
      }
    });
    const zip = await JSZip.loadAsync(built.content);
    const manifest = JSON.parse(
      await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST).async('text')
    );
    const soundPath = manifest.boards[0].tiles[0].sound.path;
    const videoPath = manifest.boards[0].tiles[0].video.path;

    expect(manifest.stats.soundAssetCount).toBe(1);
    expect(manifest.stats.videoAssetCount).toBe(1);
    expect(soundPath).toMatch(/^sounds\/boards\/.+\.mp3$/);
    expect(videoPath).toMatch(/^videos\/boards\/.+\.mp4$/);
    expect(await zip.file(soundPath).async('uint8array')).toEqual(SOUND_BYTES);
    expect(await zip.file(videoPath).async('uint8array')).toEqual(VIDEO_BYTES);

    const restored = await readPictureLibraryArchive({
      file: asFile(built.content),
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      identity: {
        patientId: 'patient-local',
        workspaceId: 'workspace-local'
      },
      conflictStrategy: 'merge'
    });

    expect(restored.boards[0].tiles[0].sound).toBe(
      'data:audio/mpeg;base64,SUQzBA=='
    );
    expect(restored.boards[0].tiles[0]).toEqual(
      expect.objectContaining({
        mediaType: 'video',
        video: 'data:video/mp4;base64,AAAAGGZ0eXBpc29t'
      })
    );
  });

  test('rejects recordings above the aggregate export limit', async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024 + 1);

    await expect(createMediaArchive('sound', 5, bytes)).rejects.toThrow(
      'recordings exceed'
    );
  });

  test('rejects recordings above the aggregate restore limit', async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024 + 1);
    const boards = createMediaBoards('sound', 5);
    const plan = createPictureLibraryArchivePlan({
      boards,
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null
    });
    const zip = new JSZip();
    const assets = plan.manifest.assets.map(asset => ({
      path: asset.path,
      mediaType: asset.path.startsWith('sounds/') ? 'audio/mpeg' : 'image/png',
      size: asset.path.startsWith('sounds/')
        ? bytes.byteLength
        : IMAGE_BYTES.byteLength
    }));
    assets.forEach(asset => {
      zip.file(
        asset.path,
        asset.path.startsWith('sounds/') ? bytes : IMAGE_BYTES
      );
    });
    zip.file(
      PICTURE_LIBRARY_ARCHIVE_MANIFEST,
      JSON.stringify({ ...plan.manifest, assets })
    );
    const content = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE'
    });

    await expect(
      readPictureLibraryArchive({
        file: asFile(content),
        existingBoards: [],
        existingPersonalImagePreferences: [],
        existingMissingTokens: [],
        existingOrderingState: null,
        identity: {
          patientId: 'patient-local',
          workspaceId: 'workspace-local'
        }
      })
    ).rejects.toThrow('recordings exceed');
  });

  test('does not count videos against the recording limit', async () => {
    const bytes = new Uint8Array(7 * 1024 * 1024);
    const built = await createMediaArchive('video', 3, bytes);
    const restored = await readPictureLibraryArchive({
      file: asFile(built.content),
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      identity: {
        patientId: 'patient-local',
        workspaceId: 'workspace-local'
      }
    });

    expect(restored.boards[0].tiles).toHaveLength(3);
  });

  test('adds explicit device-data JSON files only when requested', async () => {
    const built = await buildPictureLibraryArchive({
      boards: createBoards(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null,
      createdAt: 100,
      zipType: 'uint8array',
      readImage: async () => ({
        data: IMAGE_BYTES,
        mediaType: 'image/png',
        size: IMAGE_BYTES.byteLength
      }),
      deviceData: {
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
        createdAt: 100
      }
    });
    const zip = await JSZip.loadAsync(built.content);
    const names = Object.keys(zip.files);
    const expressions = JSON.parse(
      await zip.file(LOCAL_DEVICE_DATA_EXPRESSIONS).async('text')
    );

    expect(names).toEqual(
      expect.arrayContaining([
        PICTURE_LIBRARY_ARCHIVE_MANIFEST,
        LOCAL_DEVICE_DATA_MANIFEST,
        LOCAL_DEVICE_DATA_PICTOGRAMS,
        LOCAL_DEVICE_DATA_CATEGORIES,
        LOCAL_DEVICE_DATA_EXPRESSIONS
      ])
    );
    expect(expressions.history).toEqual([
      expect.objectContaining({ sentence: '我要喝水' })
    ]);
    expect(built.deviceDataManifest.stats.expressionCount).toBe(1);
  });

  test('restores and persists every complete-device sidecar', async () => {
    window.localStorage.clear();
    const identity = loadPersonalImageRuntime().identity;
    const built = await buildPictureLibraryArchive({
      boards: createBoards(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null,
      createdAt: 100,
      zipType: 'uint8array',
      readImage: async () => ({
        data: IMAGE_BYTES,
        mediaType: 'image/png',
        size: IMAGE_BYTES.byteLength
      }),
      deviceData: {
        savedPhrases: [
          {
            id: 'phrase-backup',
            sentence: '备份常用语',
            output: [],
            createdAt: 1,
            updatedAt: 1
          }
        ],
        savedPhraseTombstones: [
          {
            id: 'phrase-deleted',
            deletedAt: 2,
            serverVersion: 1
          }
        ],
        history: [
          {
            id: 'history-backup',
            direction: 'express',
            sentence: '备份历史',
            patientId: 'patient-old',
            workspaceId: 'workspace-old',
            createdAt: 3,
            updatedAt: 3
          }
        ],
        receiverRecords: [
          {
            id: 'receiver-backup',
            direction: 'receive',
            sentence: '备份接收记录',
            recordStatus: 'confirmed',
            sessionId: 'session-backup',
            patientId: 'patient-old',
            workspaceId: 'workspace-old',
            createdAt: 4,
            updatedAt: 4
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
            createdAt: 5
          }
        ],
        expressionCandidateFeedbackDrafts: [
          {
            id: 'feedback-backup',
            sessionId: 'session-backup',
            outputSignature: 'output-backup',
            candidates: [{ sentence: '备份候选句。', feedback: 'up' }],
            createdAt: 6,
            updatedAt: 6
          }
        ]
      }
    });
    const restored = await readPictureLibraryArchive({
      file: asFile(built.content),
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      existingLocalDeviceData: {
        savedPhrases: [
          {
            id: 'phrase-local',
            sentence: '本机常用语',
            output: [],
            createdAt: 7,
            updatedAt: 7
          }
        ]
      },
      identity,
      conflictStrategy: 'merge'
    });

    expect(restored.summary.deviceDataStats).toEqual(
      expect.objectContaining({
        savedPhraseCount: 1,
        savedPhraseTombstoneCount: 1,
        expressionCount: 2,
        correctionCount: 1,
        draftCount: 1
      })
    );
    expect(restored.localDeviceData.savedPhrases.map(item => item.id)).toEqual(
      expect.arrayContaining(['phrase-backup', 'phrase-local'])
    );
    expect(restored.localDeviceData.receiverRecords[0]).toEqual(
      expect.objectContaining({
        patientId: identity.patientId,
        workspaceId: identity.workspaceId
      })
    );

    persistPictureLibraryRestore(restored);

    expect(loadCommunicationSavedPhrases().map(item => item.id)).toEqual(
      expect.arrayContaining(['phrase-backup', 'phrase-local'])
    );
    expect(loadCommunicationSavedPhraseTombstones()[0].id).toBe(
      'phrase-deleted'
    );
    expect(loadCommunicationHistory().map(item => item.id)).toContain(
      'history-backup'
    );
    expect(loadReceiverRecords()[0].id).toBe('receiver-backup');
    expect(loadReceiverCorrections()[0].id).toBe('correction-backup');
    expect(loadExpressionCandidateFeedbackDrafts()[0].id).toBe(
      'feedback-backup'
    );
    window.localStorage.clear();
  });

  test('rejects an archive whose manifest references a missing image file', async () => {
    const plan = createPictureLibraryArchivePlan({
      boards: createBoards(),
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null
    });
    const zip = new JSZip();
    zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST, JSON.stringify(plan.manifest));
    const content = await zip.generateAsync({ type: 'uint8array' });

    await expect(
      readPictureLibraryArchive({
        file: asFile(content),
        existingPersonalImagePreferences: [],
        existingMissingTokens: [],
        identity: {
          patientId: 'patient-local',
          workspaceId: 'workspace-local'
        }
      })
    ).rejects.toThrow('archive is missing');
  });
});
