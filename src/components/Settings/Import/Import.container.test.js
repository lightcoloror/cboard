import { ImportContainer } from './Import.container';
import API from '../../../api';
import * as PictureLibraryArchive from '../Export/PictureLibraryArchive.helpers';
import { encryptPrivateArchiveBlob } from '../Export/PrivateArchiveEncryption.browser';

const PASSPHRASE = 'correct-horse-battery-staple';

function deterministicRandomBytes(length) {
  return Uint8Array.from({ length }, (_value, index) => (index * 19 + 5) % 256);
}

jest.mock('../../../api', () => ({
  __esModule: true,
  isPrivatePictureLibraryUnavailableError: error =>
    Boolean(error && error.response && error.response.status === 503),
  isPrivatePictureLibraryReencryptionRequiredError: error =>
    Boolean(error && error.response && error.response.status === 409),
  isPrivateDeviceDataReencryptionRequiredError: error =>
    Boolean(error && error.response && error.response.status === 409),
  default: {
    deletePrivatePictureLibrary: jest.fn(),
    downloadPrivatePictureLibrary: jest.fn(),
    deletePrivateDeviceData: jest.fn(),
    downloadPrivateDeviceData: jest.fn()
  }
}));

jest.mock('./Import.messages', () => ({
  __esModule: true,
  default: {
    success: { id: 'success', defaultMessage: 'Imported' },
    emptyImport: { id: 'emptyImport', defaultMessage: 'Nothing to import' },
    errorImport: { id: 'errorImport', defaultMessage: 'Import failed' },
    pictureLibrarySuccess: {
      id: 'pictureLibrarySuccess',
      defaultMessage: 'Picture library restored'
    },
    privatePictureLibraryDeleted: {
      id: 'privatePictureLibraryDeleted',
      defaultMessage: 'Private backup deleted'
    },
    privatePictureLibraryError: {
      id: 'privatePictureLibraryError',
      defaultMessage: 'Private backup unavailable'
    },
    privatePictureLibraryUnavailable: {
      id: 'privatePictureLibraryUnavailable',
      defaultMessage: 'Private storage not configured'
    },
    privateDeviceDataDeleted: {
      id: 'privateDeviceDataDeleted',
      defaultMessage: 'Complete private backup deleted'
    },
    privateDeviceDataError: {
      id: 'privateDeviceDataError',
      defaultMessage: 'Complete private backup unavailable'
    },
    privateDeviceDataReencryptionRequired: {
      id: 'privateDeviceDataReencryptionRequired',
      defaultMessage: 'Re-encryption required'
    },
    privateDeviceDataWrongPassphrase: {
      id: 'privateDeviceDataWrongPassphrase',
      defaultMessage: 'Wrong password'
    },
    privateDeviceDataUnsupportedBackup: {
      id: 'privateDeviceDataUnsupportedBackup',
      defaultMessage: 'Unsupported backup'
    }
  }
}));

function createProps() {
  return {
    boards: [],
    history: { goBack: jest.fn() },
    intl: {
      locale: 'zh-CN',
      formatMessage: message => message.defaultMessage || message.id
    },
    userData: {},
    currentCommunicator: { boards: [] },
    addBoards: jest.fn(),
    updateBoard: jest.fn(),
    switchBoard: jest.fn(),
    showNotification: jest.fn(),
    pushCommunicator: jest.fn()
  };
}

describe('ImportContainer review gate', () => {
  test('parses an OBF without syncing until the review is confirmed', async () => {
    const props = createProps();
    const container = new ImportContainer(props);
    container.syncBoardsWithAPI = jest.fn().mockResolvedValue();
    const file = new File(
      [
        JSON.stringify({
          format: 'open-board-0.1',
          id: 'daily-needs',
          name: '日常需求',
          buttons: [{ id: 'water', label: '水' }]
        })
      ],
      'daily-needs.obf',
      { type: 'application/json' }
    );
    const event = {
      target: {
        files: [file],
        value: 'daily-needs.obf'
      }
    };
    const onReview = jest.fn();
    const parseDone = jest.fn();

    await container.handleImportClick(
      event,
      parseDone,
      'merge',
      jest.fn(),
      onReview
    );

    expect(parseDone).toHaveBeenCalled();
    expect(event.target.value).toBe('');
    expect(container.syncBoardsWithAPI).not.toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'boards',
        canApply: true,
        summary: expect.objectContaining({
          boardCount: 1,
          tileCount: 1,
          conflictCount: 0
        })
      })
    );

    const review = onReview.mock.calls[0][0];
    const confirmDone = jest.fn();
    await container.handleConfirmImport(review, confirmDone);

    expect(container.syncBoardsWithAPI).toHaveBeenCalledWith(
      review.applicableBoards
    );
    expect(confirmDone).toHaveBeenCalledWith(true);
  });

  test('downloads a private archive into the existing review gate', async () => {
    const props = createProps();
    const archive = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
      type: 'application/zip'
    });
    const restored = {
      archive: {
        scope: 'custom',
        boards: [],
        personalImagePreferences: [{ tileId: 'water' }]
      },
      boards: [],
      summary: {
        boardCount: 0,
        tileCount: 0,
        customPictureCount: 1
      }
    };
    const encryptedArchive = await encryptPrivateArchiveBlob({
      archive,
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes
    });
    API.downloadPrivatePictureLibrary.mockResolvedValue(encryptedArchive);
    jest
      .spyOn(PictureLibraryArchive, 'readPictureLibraryArchive')
      .mockResolvedValue(restored);
    const container = new ImportContainer(props);
    const onReview = jest.fn();
    const done = jest.fn();

    await container.handlePrivateLibraryImport(
      done,
      'merge',
      jest.fn(),
      onReview,
      PASSPHRASE
    );

    expect(
      PictureLibraryArchive.readPictureLibraryArchive
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.any(Blob),
        existingBoards: props.boards,
        conflictStrategy: 'merge'
      })
    );
    expect(onReview).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'picture-library',
        canApply: true,
        summary: expect.objectContaining({
          customPictureCount: 1
        })
      })
    );
    expect(done).toHaveBeenCalled();
  });

  test('deletes only the private cloud snapshot', async () => {
    const props = createProps();
    API.deletePrivatePictureLibrary.mockResolvedValue({ deleted: true });
    const container = new ImportContainer(props);
    const done = jest.fn();

    await container.handlePrivateLibraryDelete(done);

    expect(API.deletePrivatePictureLibrary).toHaveBeenCalled();
    expect(props.updateBoard).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalled();
  });

  test('shows the configuration message for a 503 download', async () => {
    const props = createProps();
    API.downloadPrivatePictureLibrary.mockRejectedValueOnce({
      response: { status: 503 }
    });
    const container = new ImportContainer(props);

    await container.handlePrivateLibraryImport(
      jest.fn(),
      'merge',
      jest.fn(),
      jest.fn(),
      PASSPHRASE
    );

    expect(props.showNotification).toHaveBeenCalledWith(
      'Private storage not configured'
    );
  });

  test('downloads complete device data into the same review gate', async () => {
    const props = createProps();
    const archive = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 2])], {
      type: 'application/zip'
    });
    const restored = {
      archive: {
        scope: 'custom',
        boards: [],
        personalImagePreferences: []
      },
      boards: [],
      localDeviceData: {
        manifest: { stats: { expressionCount: 2 } },
        expressions: {
          savedPhrases: [{ id: 'phrase-1' }],
          receiverRecords: [{ id: 'receive-1' }],
          receiverCorrections: [{ id: 'correction-1' }],
          expressionCandidateFeedbackDrafts: []
        }
      },
      summary: {
        boardCount: 0,
        tileCount: 0,
        customPictureCount: 0,
        deviceDataStats: {
          expressionCount: 2,
          savedPhraseCount: 1,
          receiverRecordCount: 1,
          receiverCorrectionCount: 1,
          feedbackDraftCount: 0
        }
      }
    };
    const encryptedArchive = await encryptPrivateArchiveBlob({
      archive,
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes
    });
    API.downloadPrivateDeviceData.mockResolvedValue(encryptedArchive);
    jest
      .spyOn(PictureLibraryArchive, 'readPictureLibraryArchive')
      .mockResolvedValue(restored);
    const container = new ImportContainer(props);
    const onReview = jest.fn();
    const done = jest.fn();

    await container.handlePrivateDeviceDataImport(
      done,
      'merge',
      jest.fn(),
      onReview,
      PASSPHRASE
    );

    expect(API.downloadPrivateDeviceData).toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'picture-library',
        canApply: true,
        fileName: 'private-account-complete-data.zip'
      })
    );
    expect(done).toHaveBeenCalled();
  });

  test('deletes complete data without touching the separate picture snapshot', async () => {
    const props = createProps();
    API.deletePrivateDeviceData.mockResolvedValue({ deleted: true });
    const container = new ImportContainer(props);

    await container.handlePrivateDeviceDataDelete(jest.fn());

    expect(API.deletePrivateDeviceData).toHaveBeenCalled();
    expect(API.deletePrivatePictureLibrary).not.toHaveBeenCalled();
  });
});
