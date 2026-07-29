import API from '../../../api';
import { ExportContainer } from './Export.container';
import * as PictureLibraryArchive from './PictureLibraryArchive.helpers';
import { blobToBytes } from './PrivateArchiveEncryption.browser';

const PASSPHRASE = 'correct-horse-battery-staple';

beforeAll(() => {
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(value) {
        value.forEach((_item, index) => {
          value[index] = (index * 23 + 11) % 256;
        });
        return value;
      }
    }
  });
});

jest.mock('./Export.messages', () => ({
  __esModule: true,
  default: {
    privatePictureLibraryUploaded: {
      id: 'privatePictureLibraryUploaded',
      defaultMessage: 'Private backup stored'
    },
    privatePictureLibraryError: {
      id: 'privatePictureLibraryError',
      defaultMessage: 'Private backup failed'
    },
    privatePictureLibraryUnavailable: {
      id: 'privatePictureLibraryUnavailable',
      defaultMessage: 'Private storage not configured'
    },
    privateDeviceDataUploaded: {
      id: 'privateDeviceDataUploaded',
      defaultMessage: 'Complete private backup stored'
    },
    privateDeviceDataError: {
      id: 'privateDeviceDataError',
      defaultMessage: 'Complete private backup failed'
    }
  }
}));

jest.mock('../../../api', () => ({
  __esModule: true,
  isPrivatePictureLibraryUnavailableError: error =>
    Boolean(error && error.response && error.response.status === 503),
  default: {
    uploadPrivatePictureLibrary: jest.fn(),
    uploadPrivateDeviceData: jest.fn()
  }
}));

function createProps() {
  return {
    boards: [{ id: 'root', name: 'Home', tiles: [] }],
    history: { goBack: jest.fn() },
    intl: {
      locale: 'zh-CN',
      formatMessage: message => message.defaultMessage || message.id
    },
    userData: { email: 'care@example.test' },
    showNotification: jest.fn()
  };
}

describe('ExportContainer private picture library', () => {
  test('builds only the custom archive before authenticated upload', async () => {
    const props = createProps();
    const archive = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
      type: 'application/zip'
    });
    jest
      .spyOn(PictureLibraryArchive, 'buildPictureLibraryArchive')
      .mockResolvedValue({ content: archive });
    API.uploadPrivatePictureLibrary.mockResolvedValue({
      format: 'picinterpreter-private-picture-library-encrypted',
      contractVersion: 2
    });
    const container = new ExportContainer(props);
    const done = jest.fn();

    await container.handlePrivateLibraryUpload(done, jest.fn(), PASSPHRASE);

    expect(
      PictureLibraryArchive.buildPictureLibraryArchive
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        boards: props.boards,
        scope: 'custom'
      })
    );
    expect(API.uploadPrivatePictureLibrary).toHaveBeenCalledWith(
      expect.any(Blob)
    );
    const uploaded = API.uploadPrivatePictureLibrary.mock.calls[0][0];
    expect(Array.from((await blobToBytes(uploaded)).slice(0, 8))).toEqual([
      0x50,
      0x49,
      0x45,
      0x32,
      0x45,
      0x45,
      0x30,
      0x31
    ]);
    expect(done).toHaveBeenCalled();
  });

  test('shows the configuration message for a 503 upload', async () => {
    const props = createProps();
    const archive = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
      type: 'application/zip'
    });
    jest
      .spyOn(PictureLibraryArchive, 'buildPictureLibraryArchive')
      .mockResolvedValue({ content: archive });
    API.uploadPrivatePictureLibrary.mockRejectedValueOnce({
      response: { status: 503 }
    });
    const container = new ExportContainer(props);

    await container.handlePrivateLibraryUpload(
      jest.fn(),
      jest.fn(),
      PASSPHRASE
    );

    expect(props.showNotification).toHaveBeenCalledWith(
      'Private storage not configured'
    );
  });

  test('uploads the compact complete-data archive through its own endpoint', async () => {
    const props = createProps();
    const archive = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 2])], {
      type: 'application/zip'
    });
    jest
      .spyOn(PictureLibraryArchive, 'buildPrivateDeviceDataArchive')
      .mockResolvedValue({ content: archive });
    API.uploadPrivateDeviceData.mockResolvedValue({
      format: 'picinterpreter-private-device-data-encrypted',
      contractVersion: 2
    });
    const container = new ExportContainer(props);
    const done = jest.fn();

    await container.handlePrivateDeviceDataUpload(done, jest.fn(), PASSPHRASE);

    expect(
      PictureLibraryArchive.buildPrivateDeviceDataArchive
    ).toHaveBeenCalledWith({ onProgress: expect.any(Function) });
    expect(API.uploadPrivateDeviceData).toHaveBeenCalledWith(expect.any(Blob));
    const uploaded = API.uploadPrivateDeviceData.mock.calls[0][0];
    expect(Array.from((await blobToBytes(uploaded)).slice(0, 8))).toEqual([
      0x50,
      0x49,
      0x45,
      0x32,
      0x45,
      0x45,
      0x30,
      0x31
    ]);
    expect(done).toHaveBeenCalled();
  });
});
