const mockBoard = {
  name: 'tewt',
  id: '12345678901234567',
  tiles: [{ id: '1234567890123456', loadBoard: '456456456456456456456' }],
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

const userData = {
  authToken: 'eyJhbGciOiJIUzcCI6IkpXVCJ9-Pifi0ZUKqyGcjTSLDV0UoPKUY99bo',
  birthdate: '2018-10-23T22:47:09.367Z',
  boards: [{}],
  communicators: [
    {
      author: 'martin bedouret',
      boards: ['5cd5af199f55b200154cab25', '5beedf1694ec83000fe79c68'],
      description: "Cboard's default communicator",
      email: 'anything@cboard.io',
      id: '5beedb9a94ec83000fe79c67',
      name: "Cboard's Communicator",
      rootBoard: '5c1d33d6ed721600157addb1'
    }
  ],
  email: 'anything@cboard.io',
  id: '5bcfa4ed494b20000f8ab98b',
  lastlogin: '2018-10-23T22:47:09.367Z',
  locale: 'en-US',
  name: 'martin bedouret',
  settings: {
    speech: {
      lang: 'en-GB',
      voiceURI:
        'urn:moz-tts:sapi:Microsoft Hazel Desktop - English (Great Britain)?en-GB'
    }
  }
};

class API {
  login(email, password) {
    return new Promise((resolve, reject) => {
      if (email === 'error') {
        reject(new Error({ message: 'not found' }));
      } else {
        resolve(userData);
      }
    });
  }

  loginWithPhone(phone, phoneVerificationToken) {
    return Promise.resolve(userData);
  }

  resetPasswordWithPhone(phone, phoneVerificationToken, password) {
    return Promise.resolve({
      success: 1,
      message: 'Password reset. Please sign in again.'
    });
  }

  getMyBoards({
    page = 1,
    limit = 10,
    offset = 0,
    sort = '-_id',
    search = ''
  }) {
    return new Promise((resolve, reject) => {
      if (search === 'error') {
        reject(new Error({ message: 'not found' }));
      } else {
        resolve(mockBoard);
      }
    });
  }

  getBoardsByIds(ids = []) {
    return Promise.resolve({
      total: ids.length,
      data: ids.map(id => ({ ...mockBoard, id }))
    });
  }

  getBoardsSync() {
    return Promise.resolve({
      total: 1,
      data: [{ id: mockBoard.id, lastEdited: mockBoard.lastEdited }]
    });
  }

  createBoard(board) {
    return new Promise((resolve, reject) => {
      if (board.hasOwnProperty('error')) {
        reject(new Error({ message: 'not found' }));
      } else {
        resolve(mockBoard);
      }
    });
  }

  updateBoard(board) {
    return new Promise((resolve, reject) => {
      if (board.hasOwnProperty('error')) {
        reject(new Error({ message: 'not found' }));
      } else {
        resolve(mockBoard);
      }
    });
  }

  deleteBoard(boardId) {
    return new Promise((resolve, reject) => {
      if (boardId === 'error') {
        reject(new Error({ message: 'not found' }));
      } else {
        resolve(mockBoard);
      }
    });
  }

  uploadFile(file, filename) {
    return new Promise((resolve, reject) => {
      if (file === 'error') {
        reject(new Error({ message: 'not found' }));
      } else {
        resolve('test');
      }
    });
  }

  async uploadBoardLocalMedia(board) {
    return { board, hadFailure: false };
  }

  async arasaacPictogramsSearch(locale, searchText) {
    return [];
  }

  oAuthLogin(type, query) {
    return new Promise((resolve, reject) => {
      if (email === 'error') {
        reject(new Error({ message: 'not found' }));
      } else {
        resolve(userData);
      }
    });
  }

  async getBoards({
    page = 1,
    limit = 10,
    offset = 0,
    sort = '-_id',
    search = ''
  } = {}) {
    return mockBoard;
  }

  async getCommunicators({
    page = 1,
    limit = 10,
    offset = 0,
    sort = '-_id',
    search = ''
  } = {}) {
    return [mockComm];
  }

  async getBoard(id) {
    return mockBoard;
  }

  async getPublicBoardBundle(id) {
    return {
      format: 'cboard-public-board-bundle',
      contractVersion: 1,
      rootBoardId: id,
      source: 'cboard-public',
      sourceUrl: 'https://github.com/cboard-org/cboard',
      licenseStatus: 'unknown',
      warnings: [],
      data: [mockBoard],
      diagnostics: {
        boardCount: 1,
        tileCount: mockBoard.tiles.length,
        unavailableLinkedBoardCount: 0
      }
    };
  }

  async updateSettings(newSettings = {}) {
    return {};
  }

  async generateCommunicationSentences() {
    return { candidates: [] };
  }

  async generateCommunicationPictogram() {
    return {
      imageBase64: '',
      mimeType: 'image/png',
      provider: 'none',
      model: '',
      generationId: '',
      useScope: 'device-private',
      sourceStored: false,
      publicLicenseDeclared: false,
      providerTermsApply: true,
      blob: new Blob([], { type: 'image/png' }),
      fileName: 'generated-pictogram.png'
    };
  }

  async getCommunicationAiHealth() {
    return {
      configured: false,
      provider: 'none',
      model: '',
      baseUrl: ''
    };
  }

  async getCommunicationAiUsage() {
    return {
      month: '2026-07',
      requestCount: 0,
      reportedRequestCount: 0,
      unreportedRequestCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      providerReported: false,
      breakdown: []
    };
  }

  async getCommunicationServiceHealth() {
    return {
      status: 'ok',
      database: 'connected',
      communicationIndexes: 'ready',
      privatePictureLibrary: 'unconfigured'
    };
  }

  async resegmentCommunicationText() {
    return { tokens: [] };
  }

  async normalizeCommunicationDialectText() {
    return {
      sourceText: '',
      normalizedText: '',
      dialect: 'cantonese',
      provider: 'none',
      sourceStored: false
    };
  }

  async recognizeCommunicationDialectAudio() {
    return {
      text: '',
      dialect: 'cantonese',
      engine: '16k_yue',
      provider: 'none',
      audioDurationMs: 0,
      audioStored: false,
      providerProcessing: true
    };
  }

  async recognizeCommunicationImageText() {
    return {
      text: '',
      provider: 'none',
      sourceStored: false
    };
  }

  async suggestCommunicationPictogramMetadata() {
    return {
      label: '',
      synonyms: [],
      category: '',
      provider: 'none',
      sourceStored: false
    };
  }

  async removeCommunicationImageBackground() {
    return {
      imageBase64: '',
      mimeType: 'image/png',
      width: 0,
      height: 0,
      provider: 'none',
      sourceStored: false,
      originalRetained: true,
      blob: new Blob([], { type: 'image/png' }),
      fileName: 'pictogram-no-background.png'
    };
  }

  async searchCommunicationPictograms() {
    return [];
  }

  async syncConfirmedReceiverRecords() {
    return { acceptedCount: 0, records: [], deletedRecordIds: [] };
  }

  async deleteConfirmedReceiverRecords() {
    return { deletedCount: 0, deletedRecordIds: [] };
  }

  async syncCommunicationSavedPhrases() {
    return {
      acceptedCount: 0,
      conflictCount: 0,
      phrases: [],
      deletedPhraseIds: [],
      deletedPhrases: []
    };
  }

  async deleteCommunicationSavedPhrases() {
    return {
      deletedCount: 0,
      deletedPhraseIds: [],
      deletedPhrases: []
    };
  }

  async getPrivateDeviceDataMetadata() {
    return null;
  }

  async uploadPrivateDeviceData() {
    return null;
  }

  async downloadPrivateDeviceData() {
    return new Blob([], { type: 'application/zip' });
  }

  async deletePrivateDeviceData() {
    return { deleted: false };
  }

  async createCommunicator(communicator) {
    return mockComm;
  }

  async updateCommunicator(communicator) {
    return mockComm;
  }
}

const API_INSTANCE = new API({});

export default API_INSTANCE;
