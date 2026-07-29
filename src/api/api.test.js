import API, {
  isPrivatePictureLibraryReencryptionRequiredError,
  isPrivatePictureLibraryUnavailableError
} from './api';
import { API_URL } from '../constants';
import { getStore } from '../store';
import { isAndroid } from '../cordova-util';

jest.mock('../store');
jest.mock('../cordova-util', () => ({
  ...jest.requireActual('../cordova-util'),
  isAndroid: jest.fn(() => false)
}));

const axiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
};
const expectAuthConfig = () => ({
  headers: {
    Authorization: expect.stringMatching(/^Bearer /)
  }
});

const mockBoard = {
  name: 'tewt',
  id: '12345678901234567',
  tiles: [{ id: '1234', loadBoard: '456456456456456456456' }],
  isPublic: false,
  email: 'asd@qwe.com',
  markToUpdate: true
};
const mockComm = {
  id: 'cboard_default',
  name: "Cboard's Communicator",
  description: "Cboard's default communicator",
  author: 'Cboard Team',
  email: 'support@cboard.io',
  rootBoard: 'root',
  boards: ['root']
};

describe('Cboard API calls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    API.axiosInstance = axiosInstance;
  });

  it('uploads authenticated AAC files for transient server conversion', async () => {
    axiosInstance.post.mockResolvedValueOnce({
      data: {
        format: 'picinterpreter-aac-conversion',
        contractVersion: 1,
        sourceFormat: 'snap',
        documents: [{ path: 'boards/home.obf', board: { id: 'home' } }]
      }
    });
    const file = new File(['SQLite format 3\0'], 'patient.sps', {
      type: 'application/octet-stream'
    });

    const result = await API.convertCommunicationAacFile(file, 'snap', 'zh-CN');

    expect(result.sourceFormat).toBe('snap');
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/communication/aac-import/convert',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /)
        }),
        params: { format: 'snap', locale: 'zh-CN' }
      })
    );
  });

  it('fetches results from get language api', async () => {
    axiosInstance.get.mockResolvedValue({ status: 200, data: 'fake!' });

    await expect(API.getLanguage('es-ES')).resolves.toBe('fake!');
    expect(axiosInstance.get).toHaveBeenCalledWith('/languages/es-ES');
  });
  it('returns null from get language api on a non-success response', async () => {
    axiosInstance.get.mockResolvedValue({ status: 500, data: 'fake!' });

    await expect(API.getLanguage('es-ES')).resolves.toBeNull();
  });
  it('checks the public communication service health without authentication', async () => {
    const health = {
      status: 'degraded',
      database: 'connected',
      communicationIndexes: 'building',
      privatePictureLibrary: 'unconfigured'
    };
    axiosInstance.get.mockResolvedValue({ status: 503, data: health });

    await expect(API.getCommunicationServiceHealth()).resolves.toEqual(health);
    expect(axiosInstance.get).toHaveBeenCalledWith('/health', {
      validateStatus: expect.any(Function)
    });
    const options = axiosInstance.get.mock.calls[0][1];
    expect(options.validateStatus(200)).toBe(true);
    expect(options.validateStatus(503)).toBe(true);
    expect(options.validateStatus(500)).toBe(false);
  });
  it('reads the authenticated current-month communication AI usage', async () => {
    const usage = {
      month: '2026-07',
      requestCount: 2,
      reportedRequestCount: 2,
      unreportedRequestCount: 0,
      promptTokens: 30,
      completionTokens: 8,
      totalTokens: 38,
      providerReported: true,
      breakdown: []
    };
    axiosInstance.get.mockResolvedValue({ data: usage });

    await expect(API.getCommunicationAiUsage()).resolves.toEqual(usage);
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/gpt/communication/usage',
      expectAuthConfig()
    );
  });
  it('fetches results from get my boards api', async () => {
    axiosInstance.get.mockResolvedValue({ data: [mockBoard] });

    await expect(API.getMyBoards({ page: 1, limit: 10 })).resolves.toEqual([
      mockBoard
    ]);
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/board/byemail/anything@cboard.io?page=1&limit=10&offset=0&sort=-_id&search=',
      expectAuthConfig()
    );
  });
  it('fetches results from get boards api', async () => {
    axiosInstance.get.mockResolvedValue({ data: [mockBoard] });

    await expect(API.getBoards()).resolves.toEqual([mockBoard]);
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/board?page=1&limit=10&offset=0&sort=-_id&search='
    );
  });
  it('fetches results from get board api', async () => {
    axiosInstance.get.mockResolvedValue({ data: mockBoard });

    await expect(API.getBoard(mockBoard.id)).resolves.toEqual(mockBoard);
    expect(axiosInstance.get).toHaveBeenCalledWith(`/board/${mockBoard.id}`);
  });
  it('fetches a public board graph through the safe bundle api', async () => {
    const bundle = {
      format: 'cboard-public-board-bundle',
      rootBoardId: mockBoard.id,
      data: [mockBoard]
    };
    axiosInstance.get.mockResolvedValue({ data: bundle });

    await expect(API.getPublicBoardBundle(mockBoard.id)).resolves.toEqual(
      bundle
    );
    expect(axiosInstance.get).toHaveBeenCalledWith(
      `/board/public/${mockBoard.id}/bundle`
    );
  });
  it('fetches results from get communicators api', async () => {
    axiosInstance.get.mockResolvedValue({ data: [mockComm] });

    await expect(API.getCommunicators()).resolves.toEqual([mockComm]);
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/communicator/byemail/anything@cboard.io?page=1&limit=10&offset=0&sort=-_id&search=',
      expectAuthConfig()
    );
  });
  it('updates settings through the authenticated api', async () => {
    const settings = { communicationSupport: { enabled: true } };
    axiosInstance.post.mockResolvedValue({ data: settings });

    await expect(API.updateSettings(settings)).resolves.toEqual(settings);
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/settings',
      settings,
      expectAuthConfig()
    );
  });
  it('uploads and downloads the authenticated private picture library', async () => {
    const archive = new Blob([new Uint8Array([0x50, 0x49, 0x45, 0x32, 1])], {
      type: 'application/octet-stream'
    });
    axiosInstance.post.mockResolvedValue({
      data: {
        format: 'picinterpreter-private-picture-library-encrypted',
        contractVersion: 2,
        size: archive.size
      }
    });
    axiosInstance.get.mockResolvedValue({ data: archive });

    await expect(
      API.uploadPrivatePictureLibrary(archive)
    ).resolves.toMatchObject({
      format: 'picinterpreter-private-picture-library-encrypted',
      contractVersion: 2,
      size: archive.size
    });
    const uploadCall = axiosInstance.post.mock.calls[0];
    expect(uploadCall[0]).toBe('/communication/private-library');
    const uploadedPictureArchive = uploadCall[1].get('file');
    expect(uploadedPictureArchive.size).toBe(archive.size);
    expect(uploadedPictureArchive.type).toBe('application/octet-stream');
    expect(uploadCall[2]).toEqual({
      headers: {
        Authorization: expect.stringMatching(/^Bearer /),
        'Content-Type': 'multipart/form-data'
      }
    });

    await expect(API.downloadPrivatePictureLibrary()).resolves.toBe(archive);
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/communication/private-library/download',
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /)
        },
        responseType: 'blob'
      }
    );
  });
  it('reads metadata and deletes the authenticated private picture library', async () => {
    const metadata = {
      format: 'picinterpreter-private-picture-library-encrypted',
      contractVersion: 2,
      size: 10
    };
    axiosInstance.get.mockResolvedValue({ data: metadata });
    axiosInstance.delete.mockResolvedValue({
      data: { deleted: true }
    });

    await expect(API.getPrivatePictureLibraryMetadata()).resolves.toEqual(
      metadata
    );
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/communication/private-library',
      expectAuthConfig()
    );
    await expect(API.deletePrivatePictureLibrary()).resolves.toEqual({
      deleted: true
    });
    expect(axiosInstance.delete).toHaveBeenCalledWith(
      '/communication/private-library',
      expectAuthConfig()
    );
  });
  it('keeps complete device data on separate authenticated archive routes', async () => {
    const archive = new Blob([new Uint8Array([0x50, 0x49, 0x45, 0x32, 2])], {
      type: 'application/octet-stream'
    });
    const metadata = {
      format: 'picinterpreter-private-device-data-encrypted',
      contractVersion: 2,
      size: archive.size
    };
    axiosInstance.post.mockResolvedValue({ data: metadata });
    axiosInstance.get.mockResolvedValueOnce({ data: metadata });
    axiosInstance.get.mockResolvedValueOnce({ data: archive });
    axiosInstance.delete.mockResolvedValue({ data: { deleted: true } });

    await expect(API.getPrivateDeviceDataMetadata()).resolves.toEqual(metadata);
    expect(axiosInstance.get).toHaveBeenNthCalledWith(
      1,
      '/communication/private-device-data',
      expectAuthConfig()
    );

    await expect(API.uploadPrivateDeviceData(archive)).resolves.toEqual(
      metadata
    );
    const uploadCall = axiosInstance.post.mock.calls[0];
    expect(uploadCall[0]).toBe('/communication/private-device-data');
    const uploadedDeviceArchive = uploadCall[1].get('file');
    expect(uploadedDeviceArchive.size).toBe(archive.size);
    expect(uploadedDeviceArchive.type).toBe('application/octet-stream');

    await expect(API.downloadPrivateDeviceData()).resolves.toBe(archive);
    expect(axiosInstance.get).toHaveBeenNthCalledWith(
      2,
      '/communication/private-device-data/download',
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /)
        },
        responseType: 'blob'
      }
    );

    await expect(API.deletePrivateDeviceData()).resolves.toEqual({
      deleted: true
    });
    expect(axiosInstance.delete).toHaveBeenCalledWith(
      '/communication/private-device-data',
      expectAuthConfig()
    );
  });
  it('recognizes only the private storage unavailable response', () => {
    expect(
      isPrivatePictureLibraryUnavailableError({
        response: { status: 503 }
      })
    ).toBe(true);
    expect(
      isPrivatePictureLibraryUnavailableError({
        response: { status: 500 }
      })
    ).toBe(false);
    expect(isPrivatePictureLibraryUnavailableError(null)).toBe(false);
  });
  it('recognizes the private picture legacy re-encryption response', () => {
    expect(
      isPrivatePictureLibraryReencryptionRequiredError({
        response: {
          status: 409,
          data: {
            code: 'PRIVATE_PICTURE_LIBRARY_REENCRYPTION_REQUIRED'
          }
        }
      })
    ).toBe(true);
    expect(
      isPrivatePictureLibraryReencryptionRequiredError({
        response: { status: 500 }
      })
    ).toBe(false);
  });
  it('creates a board through the authenticated api', async () => {
    axiosInstance.post.mockResolvedValue({ data: mockBoard });

    await expect(API.createBoard(mockBoard)).resolves.toEqual(mockBoard);
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/board',
      mockBoard,
      expectAuthConfig()
    );
  });
  it('creates a communicator with the authenticated user identity', async () => {
    axiosInstance.post.mockResolvedValue({
      data: { communicator: mockComm }
    });

    await expect(API.createCommunicator(mockComm)).resolves.toEqual(mockComm);
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/communicator',
      {
        ...mockComm,
        id: undefined,
        email: 'anything@cboard.io',
        author: 'martin bedouret'
      },
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /),
          'Idempotency-Key': 'cboard_default'
        }
      }
    );
  });
  it('keeps legacy communicator creation when no local id is available', async () => {
    const communicatorWithoutId = { ...mockComm };
    delete communicatorWithoutId.id;
    axiosInstance.post.mockResolvedValue({
      data: { communicator: communicatorWithoutId }
    });

    await API.createCommunicator(communicatorWithoutId);

    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/communicator',
      {
        ...communicatorWithoutId,
        email: 'anything@cboard.io',
        author: 'martin bedouret'
      },
      expectAuthConfig()
    );
  });
  it('fetches results from arasaac pictogram search api', async () => {
    axiosInstance.get.mockResolvedValue({ status: 200, data: 'fake!' });

    await expect(API.arasaacPictogramsSearch('es', 'perro')).resolves.toBe(
      'fake!'
    );
    expect(axiosInstance.get).toHaveBeenCalledWith(
      expect.stringContaining('pictograms/es/search/perro')
    );
  });
  it('returns no arasaac results on a non-success response', async () => {
    axiosInstance.get.mockResolvedValue({ status: 500, data: 'fake!' });

    await expect(API.arasaacPictogramsSearch('es', 'perro')).resolves.toEqual(
      []
    );
  });
  it('searches Global Symbols through cboard-api and resolves trusted proxy images', async () => {
    const attribution = {
      provider: 'globalsymbols',
      originalId: '314',
      name: 'Global Symbols / Mulberry Symbols',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://globalsymbols.com/uploads/apple.svg'
    };
    axiosInstance.post.mockResolvedValue({
      status: 200,
      data: {
        results: [
          {
            id: 42,
            text: 'apple',
            picto: {
              id: 314,
              image_url: '/pictograms/globalsymbols/signed.image/image'
            },
            pictogramAttribution: attribution
          },
          {
            id: 43,
            text: 'unsafe',
            picto: {
              id: 315,
              image_url: 'https://evil.example/unsafe.svg'
            }
          }
        ]
      }
    });

    const results = await API.globalsymbolsPictogramsSearch('en', 'apple');

    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/pictograms/globalsymbols/search',
      { query: 'apple', language: 'eng', limit: 20 }
    );
    expect(results).toHaveLength(1);
    expect(results[0].picto.image_url).toBe(
      new URL(
        '/pictograms/globalsymbols/signed.image/image',
        new URL(API_URL, window.location.href)
      ).href
    );
    expect(results[0].pictogramAttribution).toEqual(attribution);
    expect(axiosInstance.get).not.toHaveBeenCalled();
  });
  it('retains direct Global Symbols v1 search for older API deployments', async () => {
    axiosInstance.post.mockRejectedValue(new Error('route unavailable'));
    axiosInstance.get.mockResolvedValue({
      status: 200,
      data: [{ id: 9, text: 'apple', picto: { id: 10 } }]
    });

    const results = await API.globalsymbolsPictogramsSearch('en', 'apple');

    expect(results).toHaveLength(1);
    expect(axiosInstance.get).toHaveBeenCalledWith(
      expect.stringContaining(
        'globalsymbols.com/api/v1/labels/search/?query=apple&language=eng'
      )
    );
  });
  it('deletes a board through the authenticated api', async () => {
    axiosInstance.delete.mockResolvedValue({ data: mockBoard });

    await expect(API.deleteBoard(mockBoard.id)).resolves.toEqual(mockBoard);
    expect(axiosInstance.delete).toHaveBeenCalledWith(
      `/board/${mockBoard.id}`,
      expectAuthConfig()
    );
  });
  it('logs in with an email and password', async () => {
    const user = {
      email: 'email@qwe.com',
      password: '123456'
    };
    axiosInstance.post.mockResolvedValue({ data: user });

    await expect(API.login(user.email, user.password)).resolves.toEqual(user);
    expect(axiosInstance.post).toHaveBeenCalledWith('/user/login', user);
  });
  it('logs in with a purpose-bound phone verification token', async () => {
    const credentials = {
      phone: '13800138000',
      phoneVerificationToken: 'a'.repeat(64)
    };
    axiosInstance.post.mockResolvedValue({ data: { id: 'phone-user' } });

    await expect(
      API.loginWithPhone(credentials.phone, credentials.phoneVerificationToken)
    ).resolves.toEqual({ id: 'phone-user' });
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/user/login/phone',
      credentials
    );
  });
  it('resets a password with a purpose-bound phone verification token', async () => {
    const credentials = {
      phone: '13800138000',
      phoneVerificationToken: 'b'.repeat(64),
      password: 'new-password'
    };
    axiosInstance.post.mockResolvedValue({
      data: {
        success: 1,
        message: 'Password reset. Please sign in again.'
      }
    });

    await expect(
      API.resetPasswordWithPhone(
        credentials.phone,
        credentials.phoneVerificationToken,
        credentials.password
      )
    ).resolves.toEqual({
      success: 1,
      message: 'Password reset. Please sign in again.'
    });
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/user/store-password/phone',
      credentials
    );
  });
  it('updates a board through the authenticated api', async () => {
    axiosInstance.put.mockResolvedValue({ data: mockBoard });

    await expect(API.updateBoard(mockBoard)).resolves.toEqual(mockBoard);
    expect(axiosInstance.put).toHaveBeenCalledWith(
      `/board/${mockBoard.id}`,
      mockBoard,
      expectAuthConfig()
    );
  });
  it('recreates the local communicator when it is updated', async () => {
    axiosInstance.post.mockResolvedValue({
      data: { communicator: mockComm }
    });

    await expect(API.updateCommunicator(mockComm)).resolves.toEqual(mockComm);
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/communicator',
      {
        ...mockComm,
        id: undefined,
        email: 'anything@cboard.io',
        author: 'martin bedouret'
      },
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /),
          'Idempotency-Key': 'cboard_default'
        }
      }
    );
  });
  it('uploads a data url as multipart media', async () => {
    const dataUrl = 'data:text/plain;charset=utf-8;base64,dGVzdGluZw==';
    const mediaUrl = 'https://example.com/test.txt';
    axiosInstance.post.mockResolvedValue({ data: { url: mediaUrl } });

    await expect(API.uploadFromDataURL(dataUrl, 'test.txt')).resolves.toBe(
      mediaUrl
    );
    expect(axiosInstance.post).toHaveBeenCalledWith(
      'media',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'Content-Type': 'multipart/form-data'
        })
      })
    );
  });
  it('uploads a transient OCR image through the authenticated multipart endpoint', async () => {
    const file = new File(['image'], 'notice.png', { type: 'image/png' });
    const result = {
      text: '请喝水',
      provider: 'cboard-api-ai',
      sourceStored: false
    };
    axiosInstance.post.mockResolvedValue({ data: result });

    await expect(API.recognizeCommunicationImageText(file)).resolves.toEqual(
      result
    );

    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/gpt/communication/ocr',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'Content-Type': 'multipart/form-data'
        })
      })
    );
    const uploadedImage = axiosInstance.post.mock.calls[0][1].get('image');
    expect(uploadedImage).toEqual(
      expect.objectContaining({
        name: 'notice.png',
        type: 'image/png',
        size: file.size
      })
    );
  });
  it('normalizes dialect text through the authenticated API without changing the request', async () => {
    const request = {
      text: '我想饮水',
      dialect: 'cantonese',
      pictogramVocabulary: ['我', '想', '喝水']
    };
    const result = {
      sourceText: '我想饮水',
      normalizedText: '我想喝水',
      dialect: 'cantonese',
      provider: 'cboard-api-ai',
      sourceStored: false
    };
    axiosInstance.post.mockResolvedValue({ data: result });

    await expect(
      API.normalizeCommunicationDialectText(request)
    ).resolves.toEqual(result);
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/gpt/communication/dialect-normalization',
      request,
      expectAuthConfig()
    );
  });
  it('uploads transient Cantonese audio through the authenticated multipart endpoint', async () => {
    const file = new File(['ID3audio'], 'caregiver.mp3', {
      type: 'audio/mpeg'
    });
    const result = {
      text: '我想饮水',
      dialect: 'cantonese',
      engine: '16k_yue',
      provider: 'tencentcloud-asr',
      audioDurationMs: 1200,
      audioStored: false,
      providerProcessing: true
    };
    axiosInstance.post.mockResolvedValue({ data: result });

    await expect(API.recognizeCommunicationDialectAudio(file)).resolves.toEqual(
      result
    );
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/gpt/communication/dialect-asr',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'Content-Type': 'multipart/form-data'
        })
      })
    );
    const uploadedAudio = axiosInstance.post.mock.calls[0][1].get('audio');
    expect(uploadedAudio).toEqual(
      expect.objectContaining({
        name: 'caregiver.mp3',
        type: 'audio/mpeg',
        size: file.size
      })
    );
  });
  it('uploads a transient image for editable pictogram metadata suggestions', async () => {
    const file = new File(['image'], 'apple.jpg', { type: 'image/jpeg' });
    const result = {
      label: '苹果',
      synonyms: ['水果'],
      category: '饮食',
      provider: 'cboard-api-ai',
      sourceStored: false
    };
    axiosInstance.post.mockResolvedValue({ data: result });

    await expect(
      API.suggestCommunicationPictogramMetadata(file)
    ).resolves.toEqual(result);

    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/gpt/communication/pictogram-metadata',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'Content-Type': 'multipart/form-data'
        })
      })
    );
    const uploadedImage = axiosInstance.post.mock.calls[0][1].get('image');
    expect(uploadedImage).toEqual(
      expect.objectContaining({
        name: 'apple.jpg',
        type: 'image/jpeg',
        size: file.size
      })
    );
  });
  it('converts an authenticated AI pictogram response into a private PNG blob', async () => {
    const request = { label: '紧急求助' };
    const imageBase64 = 'Z2VuZXJhdGVkLXBuZw==';
    axiosInstance.post.mockResolvedValue({
      data: {
        imageBase64,
        mimeType: 'image/png',
        provider: 'openai-compatible',
        model: 'gpt-image-1',
        generationId: 'generation-1',
        useScope: 'device-private',
        sourceStored: false,
        publicLicenseDeclared: false,
        providerTermsApply: true
      }
    });

    const result = await API.generateCommunicationPictogram(request);

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'openai-compatible',
        model: 'gpt-image-1',
        generationId: 'generation-1',
        useScope: 'device-private',
        blob: expect.any(Blob),
        fileName: 'generated-pictogram-generation-1.png'
      })
    );
    expect(result.blob.type).toBe('image/png');
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/gpt/communication/pictogram-generation',
      request,
      expectAuthConfig()
    );
  });
  it('rejects generated pictograms that claim a public license', async () => {
    axiosInstance.post.mockResolvedValue({
      data: {
        imageBase64: 'Z2VuZXJhdGVkLXBuZw==',
        mimeType: 'image/png',
        provider: 'unexpected',
        model: 'image-model',
        generationId: 'generation-2',
        useScope: 'device-private',
        sourceStored: false,
        publicLicenseDeclared: true,
        providerTermsApply: true
      }
    });

    await expect(
      API.generateCommunicationPictogram({ label: '紧急求助' })
    ).rejects.toThrow('Invalid pictogram generation response');
  });
  it('converts an authenticated background removal response into a local PNG blob', async () => {
    const file = new File(['image'], 'cup.jpg', { type: 'image/jpeg' });
    const imageBase64 = 'dHJhbnNwYXJlbnQtcG5n';
    axiosInstance.post.mockResolvedValue({
      data: {
        imageBase64,
        mimeType: 'image/png',
        width: 320,
        height: 240,
        provider: 'rembg',
        sourceStored: false,
        originalRetained: true
      }
    });

    const result = await API.removeCommunicationImageBackground(file);

    expect(result).toEqual(
      expect.objectContaining({
        mimeType: 'image/png',
        width: 320,
        height: 240,
        provider: 'rembg',
        sourceStored: false,
        originalRetained: true,
        blob: expect.any(Blob),
        fileName: 'pictogram-no-background.png'
      })
    );
    expect(result.blob.type).toBe('image/png');
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/gpt/communication/background-removal',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'Content-Type': 'multipart/form-data'
        })
      })
    );
  });
  it('rejects a background removal response that claims the source was stored', async () => {
    const file = new File(['image'], 'cup.jpg', { type: 'image/jpeg' });
    axiosInstance.post.mockResolvedValue({
      data: {
        imageBase64: 'dHJhbnNwYXJlbnQtcG5n',
        mimeType: 'image/png',
        width: 320,
        height: 240,
        provider: 'unexpected',
        sourceStored: true,
        originalRetained: true
      }
    });

    await expect(API.removeCommunicationImageBackground(file)).rejects.toThrow(
      'Invalid background removal response'
    );
  });
  describe('uploadBoardLocalMedia', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      isAndroid.mockReturnValue(false);
    });

    it('returns the board untouched when no tiles have local images', async () => {
      const board = {
        id: 'b1',
        tiles: [
          { id: 't1', image: 'https://cdn.example.com/a.png' },
          { id: 't2' }
        ]
      };
      const uploadFromDataURL = jest.spyOn(API, 'uploadFromDataURL');
      const uploadFile = jest.spyOn(API, 'uploadFile');

      const result = await API.uploadBoardLocalMedia(board);

      expect(result).toEqual({ board, hadFailure: false });
      expect(uploadFromDataURL).not.toHaveBeenCalled();
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('replaces base64 and file images with uploaded urls on success', async () => {
      isAndroid.mockReturnValue(true);
      const file = new File(['x'], 'img.png');
      window.resolveLocalFileSystemURL = jest.fn((url, success) =>
        success({ file: cb => cb(file) })
      );
      jest.spyOn(API, 'tryUploadDataURL').mockResolvedValue({
        url: 'https://cdn.example.com/base64.png',
        unrecoverable: false
      });
      jest
        .spyOn(API, 'uploadFile')
        .mockResolvedValue('https://cdn.example.com/file.png');

      const board = {
        id: 'b1',
        tiles: [
          { id: 't1', image: 'data:image/png;base64,iVBORw0KGgo=' },
          { id: 't2', image: 'file:///storage/emulated/0/img.png' },
          { id: 't3', image: 'https://cdn.example.com/keep.png' }
        ]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(sanitized.tiles[0].image).toBe(
        'https://cdn.example.com/base64.png'
      );
      expect(sanitized.tiles[1].image).toBe('https://cdn.example.com/file.png');
      expect(sanitized.tiles[2].image).toBe('https://cdn.example.com/keep.png');
    });

    it('commits successes and flags hadFailure on partial failure', async () => {
      jest
        .spyOn(API, 'tryUploadDataURL')
        .mockResolvedValueOnce({
          url: 'https://cdn.example.com/ok.png',
          unrecoverable: false
        })
        .mockResolvedValueOnce({ url: null, unrecoverable: false });

      const board = {
        id: 'b1',
        tiles: [
          { id: 't1', image: 'data:image/png;base64,AAAA' },
          { id: 't2', image: 'data:image/png;base64,BBBB' }
        ]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(true);
      expect(sanitized.tiles[0].image).toBe('https://cdn.example.com/ok.png');
      expect(sanitized.tiles[1].image).toBe('data:image/png;base64,BBBB');
    });

    it('leaves file images untouched on non-android platforms', async () => {
      isAndroid.mockReturnValue(false);
      const uploadFile = jest.spyOn(API, 'uploadFile');

      const board = {
        id: 'b1',
        tiles: [{ id: 't1', image: 'file:///storage/emulated/0/img.png' }]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(sanitized.tiles[0].image).toBe(
        'file:///storage/emulated/0/img.png'
      );
    });

    it('replaces base64 sounds with uploaded urls on success', async () => {
      jest.spyOn(API, 'tryUploadDataURL').mockResolvedValue({
        url: 'https://cdn.example.com/sound.mp3',
        unrecoverable: false
      });

      const board = {
        id: 'b1',
        tiles: [
          { id: 't1', sound: 'data:audio/mp3;base64,AAAA' },
          { id: 't2', sound: 'https://cdn.example.com/keep.mp3' }
        ]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(API.tryUploadDataURL).toHaveBeenCalledWith(
        'data:audio/mp3;base64,AAAA',
        't1.mp3'
      );
      expect(sanitized.tiles[0].sound).toBe(
        'https://cdn.example.com/sound.mp3'
      );
      expect(sanitized.tiles[1].sound).toBe('https://cdn.example.com/keep.mp3');
    });

    it('replaces both image and sound on the same tile', async () => {
      jest
        .spyOn(API, 'tryUploadDataURL')
        .mockResolvedValueOnce({
          url: 'https://cdn.example.com/img.png',
          unrecoverable: false
        })
        .mockResolvedValueOnce({
          url: 'https://cdn.example.com/sound.mp3',
          unrecoverable: false
        });

      const board = {
        id: 'b1',
        tiles: [
          {
            id: 't1',
            image: 'data:image/png;base64,AAAA',
            sound: 'data:audio/mp3;base64,BBBB'
          }
        ]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(sanitized.tiles[0].image).toBe('https://cdn.example.com/img.png');
      expect(sanitized.tiles[0].sound).toBe(
        'https://cdn.example.com/sound.mp3'
      );
    });

    it('commits successes and flags hadFailure when a sound upload fails', async () => {
      jest
        .spyOn(API, 'tryUploadDataURL')
        .mockResolvedValue({ url: null, unrecoverable: false });

      const board = {
        id: 'b1',
        tiles: [{ id: 't1', sound: 'data:audio/mp3;base64,AAAA' }]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(true);
      expect(sanitized.tiles[0].sound).toBe('data:audio/mp3;base64,AAAA');
    });

    it('clears media and does not flag failure when it cannot be retrieved', async () => {
      jest
        .spyOn(API, 'tryUploadDataURL')
        .mockResolvedValue({ url: null, unrecoverable: true });

      const board = {
        id: 'b1',
        tiles: [
          { id: 't1', image: 'data:image/png;base64,@@@' },
          { id: 't2', sound: 'data:audio/mp3;base64,@@@' }
        ]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(sanitized.tiles[0].image).toBe('');
      expect(sanitized.tiles[1].sound).toBe('');
    });

    it('clears a not-found file image and does not flag failure', async () => {
      isAndroid.mockReturnValue(true);
      window.resolveLocalFileSystemURL = jest.fn((url, success, error) =>
        error({ code: 1 })
      );
      const uploadFile = jest.spyOn(API, 'uploadFile');

      const board = {
        id: 'b1',
        tiles: [{ id: 't1', image: 'file:///storage/emulated/0/gone.png' }]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(sanitized.tiles[0].image).toBe('');
    });

    it('keeps a file image and flags failure on a transient resolve error', async () => {
      isAndroid.mockReturnValue(true);
      window.resolveLocalFileSystemURL = jest.fn((url, success, error) =>
        error({ code: 2 })
      );
      const uploadFile = jest.spyOn(API, 'uploadFile');

      const board = {
        id: 'b1',
        tiles: [{ id: 't1', image: 'file:///storage/emulated/0/img.png' }]
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(true);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(sanitized.tiles[0].image).toBe(
        'file:///storage/emulated/0/img.png'
      );
    });

    it('uploads a base64 caption and rewrites it to the url on success', async () => {
      jest.spyOn(API, 'tryUploadDataURL').mockResolvedValue({
        url: 'https://cdn.example.com/caption.png',
        unrecoverable: false
      });

      const board = {
        id: 'b1',
        tiles: [],
        caption: 'data:image/png;base64,iVBORw0KGgo='
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(API.tryUploadDataURL).toHaveBeenCalledWith(
        'data:image/png;base64,iVBORw0KGgo=',
        'b1',
        true
      );
      expect(sanitized.caption).toBe('https://cdn.example.com/caption.png');
    });

    it('leaves a non-data-url caption untouched and does not upload', async () => {
      const uploadFile = jest.spyOn(API, 'uploadFile');
      const tryUploadDataURL = jest.spyOn(API, 'tryUploadDataURL');

      const board = {
        id: 'b1',
        tiles: [],
        caption: 'https://cdn.example.com/existing.png'
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(tryUploadDataURL).not.toHaveBeenCalled();
      expect(sanitized.caption).toBe('https://cdn.example.com/existing.png');
    });

    it('clears a caption and does not flag failure when it is unrecoverable', async () => {
      jest
        .spyOn(API, 'tryUploadDataURL')
        .mockResolvedValue({ url: null, unrecoverable: true });

      const board = {
        id: 'b1',
        tiles: [],
        caption: 'data:image/png;base64,@@@'
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(sanitized.caption).toBe('');
    });

    it('keeps the caption and flags hadFailure on a transient caption upload failure', async () => {
      jest
        .spyOn(API, 'tryUploadDataURL')
        .mockResolvedValue({ url: null, unrecoverable: false });

      const board = {
        id: 'b1',
        tiles: [],
        caption: 'data:image/png;base64,AAAA'
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(true);
      expect(sanitized.caption).toBe('data:image/png;base64,AAAA');
    });

    it('uploads both a base64 tile image and a base64 caption', async () => {
      jest.spyOn(API, 'tryUploadDataURL').mockImplementation(async dataURL => ({
        url:
          dataURL === 'data:image/png;base64,AAAA'
            ? 'https://cdn.example.com/tile.png'
            : 'https://cdn.example.com/caption.png',
        unrecoverable: false
      }));

      const board = {
        id: 'b1',
        tiles: [{ id: 't1', image: 'data:image/png;base64,AAAA' }],
        caption: 'data:image/png;base64,BBBB'
      };

      const { board: sanitized, hadFailure } = await API.uploadBoardLocalMedia(
        board
      );

      expect(hadFailure).toBe(false);
      expect(API.tryUploadDataURL).toHaveBeenCalledTimes(2);
      expect(sanitized.tiles[0].image).toBe('https://cdn.example.com/tile.png');
      expect(sanitized.caption).toBe('https://cdn.example.com/caption.png');
    });
  });

  it('rejects protected api calls before sending when unauthorized', async () => {
    const store = getStore();
    const userData = store.getState().app.userData;
    store.getState().app.userData = null;

    try {
      const protectedCalls = [
        API.getMyBoards(),
        API.updateBoard(mockBoard),
        API.createBoard(mockBoard),
        API.deleteBoard(mockBoard.id),
        API.getCommunicators(),
        API.updateSettings(),
        API.updateCommunicator(mockComm),
        API.createCommunicator(mockComm)
      ];
      const results = await Promise.allSettled(protectedCalls);

      expect(results).toHaveLength(protectedCalls.length);
      results.forEach(result => {
        expect(result.status).toBe('rejected');
        expect(result.reason).toEqual(
          new Error('Need to be authenticated to perform this request')
        );
      });
      expect(axiosInstance.get).not.toHaveBeenCalled();
      expect(axiosInstance.post).not.toHaveBeenCalled();
      expect(axiosInstance.put).not.toHaveBeenCalled();
      expect(axiosInstance.delete).not.toHaveBeenCalled();
    } finally {
      store.getState().app.userData = userData;
    }
  });
});
