import axios from 'axios';
import history from '../history';
import { alpha2ToAlpha3T } from '@cospired/i18n-iso-languages';
import {
  API_URL,
  ARASAAC_BASE_PATH_API,
  GLOBALSYMBOLS_BASE_PATH_API,
  AZURE_VOICES_BASE_PATH_API,
  AZURE_SPEECH_SUBSCR_KEY
} from '../constants';
import { getStore } from '../store';
import {
  convertMediaUrlToCDN,
  dataURLtoBlob,
  isDataURL,
  isLocalFileURL
} from '../helpers';
import { logout } from '../components/Account/Login/Login.actions.js';
import { cvaFileToBlob, isAndroid } from '../cordova-util';
import { buildConfirmedReceiverSyncPayload } from '../common/communicationSupport/receiverSync';
import {
  buildCommunicationSavedPhraseSyncPayload,
  normalizeSavedPhraseTombstones
} from '../common/communicationSupport/savedPhraseSync';

const BASE_URL = API_URL;
const LOCAL_COMMUNICATOR_ID = 'cboard_default';

const FILE_NOT_FOUND_ERR = 1;
const FILE_ENCODING_ERR = 5;
const isUnrecoverableFileError = error =>
  !!error &&
  (error.code === FILE_NOT_FOUND_ERR || error.code === FILE_ENCODING_ERR);

const resolveTrustedApiMediaUrl = value => {
  try {
    const apiUrl = new URL(BASE_URL, window.location.href);
    const mediaUrl = new URL(String(value || ''), apiUrl);
    return mediaUrl.origin === apiUrl.origin ? mediaUrl.href : '';
  } catch (error) {
    return '';
  }
};
export const isPrivatePictureLibraryUnavailableError = error =>
  Boolean(error && error.response && Number(error.response.status) === 503);
export const isPrivatePictureLibraryReencryptionRequiredError = error =>
  Boolean(
    error &&
      error.response &&
      (Number(error.response.status) === 409 ||
        (error.response.data &&
          error.response.data.code ===
            'PRIVATE_PICTURE_LIBRARY_REENCRYPTION_REQUIRED'))
  );
export const isPrivateDeviceDataReencryptionRequiredError = error =>
  Boolean(
    error &&
      error.response &&
      (Number(error.response.status) === 409 ||
        (error.response.data &&
          error.response.data.code ===
            'PRIVATE_DEVICE_DATA_REENCRYPTION_REQUIRED'))
  );
export let improvePhraseAbortController;

const getUserData = () => {
  const store = getStore();
  const {
    app: { userData }
  } = store.getState();

  return userData;
};

const getSubscriberId = () => {
  const store = getStore();
  const {
    subscription: { subscriberId }
  } = store.getState();
  return subscriberId;
};

const getAuthToken = () => {
  const userData = getUserData() || {};
  return userData.authToken || null;
};

const getQueryParameters = (obj = {}) => {
  return Object.keys(obj)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`)
    .join('&');
};

class API {
  constructor(config = {}) {
    this.axiosInstance = axios.create({
      baseURL: BASE_URL,
      ...config
    });
    this.axiosInstance.interceptors.response.use(
      response => response,
      error => {
        if (
          error.response?.status === 403 &&
          error.config?.baseURL === BASE_URL
        ) {
          if (isAndroid()) {
            window.FirebasePlugin?.unregister?.();
            window.facebookConnectPlugin.logout(
              function(msg) {
                console.log('disconnect facebook msg' + msg);
              },
              function(msg) {
                console.log('error facebook disconnect msg' + msg);
              }
            );
          }
          getStore().dispatch(logout());
          history.push('/login-signup/');
        }
        return Promise.reject(error);
      }
    );
  }

  async getLanguage(lang) {
    try {
      const { status, data } = await this.axiosInstance.get(
        `/languages/${lang}`
      );
      if (status === 200) return data;
      return null;
    } catch (err) {
      return null;
    }
  }

  async getAzureVoices() {
    const azureVoicesListPath = `${AZURE_VOICES_BASE_PATH_API}list`;
    const headers = {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_SUBSCR_KEY
    };
    try {
      const { status, data } = await this.axiosInstance.get(
        azureVoicesListPath,
        { headers }
      );
      if (status === 200) return data;
      return [];
    } catch (err) {
      console.error(err.message);
      return [];
    }
  }

  async arasaacPictogramsSearch(locale, searchText) {
    const pictogSearchTextPath = `${ARASAAC_BASE_PATH_API}pictograms/${locale}/search/${searchText}`;
    try {
      const { status, data } = await this.axiosInstance.get(
        pictogSearchTextPath
      );
      if (status === 200) return data;
      return [];
    } catch (err) {
      return [];
    }
  }
  async arasaacPictogramsGetImageUrl(pictogGetTextPath) {
    try {
      const { status, data } = await this.axiosInstance.get(pictogGetTextPath);
      if (status === 200) return data.image;
      return '';
    } catch (err) {
      return '';
    }
  }

  async globalsymbolsPictogramsSearch(locale, searchText) {
    let language = 'eng';
    if (locale.length === 3) {
      language = locale;
    }
    if (locale.length === 2) {
      language = alpha2ToAlpha3T(locale);
    }
    try {
      const { status, data } = await this.axiosInstance.post(
        '/pictograms/globalsymbols/search',
        { query: searchText, language, limit: 20 }
      );
      if (status === 200 && Array.isArray(data && data.results)) {
        return data.results
          .map(result => {
            const imageUrl = resolveTrustedApiMediaUrl(
              result && result.picto && result.picto.image_url
            );
            return imageUrl
              ? {
                  ...result,
                  picto: { ...result.picto, image_url: imageUrl }
                }
              : null;
          })
          .filter(Boolean);
      }
    } catch (err) {
      // Older cboard-api deployments do not expose the v2 proxy yet.
    }

    const legacyPath = `${GLOBALSYMBOLS_BASE_PATH_API}labels/search/?query=${searchText}&language=${language}&language_iso_format=639-3&limit=20`;
    try {
      const { status, data } = await this.axiosInstance.get(legacyPath);
      return status === 200 && Array.isArray(data) ? data : [];
    } catch (err) {
      return [];
    }
  }

  async login(email, password) {
    const { data } = await this.axiosInstance.post('/user/login', {
      email,
      password
    });

    return data;
  }

  async loginWithPhone(phone, phoneVerificationToken) {
    const { data } = await this.axiosInstance.post('/user/login/phone', {
      phone,
      phoneVerificationToken
    });

    return data;
  }

  async forgot(email) {
    const { data } = await this.axiosInstance.post('/user/forgot', {
      email
    });

    return data;
  }

  async storePassword(userid, password, url) {
    const { data } = await this.axiosInstance.post('/user/store-password', {
      userid: userid,
      token: url,
      password: password
    });

    return data;
  }

  async resetPasswordWithPhone(phone, phoneVerificationToken, password) {
    const { data } = await this.axiosInstance.post(
      '/user/store-password/phone',
      {
        phone,
        phoneVerificationToken,
        password
      }
    );

    return data;
  }

  async oAuthLogin(type, query) {
    if (type === 'apple' || type === 'apple-web') {
      const authCode = query?.substring(1);
      const { data } = await this.axiosInstance.post(
        `/login/${type}/callback`,
        {
          state: 'cordova',
          code: authCode
        }
      );
      return data;
    }
    const { data } = await this.axiosInstance.get(
      `/login/${type}/callback${query}`
    );
    return data;
  }

  async getUserData(userId) {
    const authToken = getAuthToken();
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.get(`/user/${userId}`, {
      headers
    });
    return data;
  }

  async getBoards({
    page = 1,
    limit = 10,
    offset = 0,
    sort = '-_id',
    search = ''
  } = {}) {
    const query = getQueryParameters({ page, limit, offset, sort, search });
    const url = `/board?${query}`;
    const { data } = await this.axiosInstance.get(url);
    return data;
  }

  async getPublicBoards({
    page = 1,
    limit = 10,
    offset = 0,
    sort = '-_id',
    search = ''
  } = {}) {
    const query = getQueryParameters({ page, limit, offset, sort, search });
    const url = `/board/public?${query}`;
    const { data } = await this.axiosInstance.get(url);
    return data;
  }

  async getMyBoards({
    page = 1,
    limit = 10,
    offset = 0,
    sort = '-_id',
    search = ''
  } = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { email } = getUserData();
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const query = getQueryParameters({ page, limit, offset, sort, search });
    const url = `/board/byemail/${email}?${query}`;

    const { data } = await this.axiosInstance.get(url, { headers });
    return data;
  }

  // Fetch the full bodies of a specific set of boards in a single request.
  // POST (not GET) because the id list can be large enough to blow past URL
  // length limits on a fresh-device sync.
  async getBoardsByIds(ids = []) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.post(
      `/board/byids`,
      { ids },
      { headers }
    );
    return data;
  }

  async getBoardsSync() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { email } = getUserData();
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.get(`/board/sync/${email}`, {
      headers
    });
    return data;
  }

  async getCommunicators({
    page = 1,
    limit = 10,
    offset = 0,
    sort = '-_id',
    search = ''
  } = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { email } = getUserData();
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const query = getQueryParameters({ page, limit, offset, sort, search });
    const url = `/communicator/byemail/${email}?${query}`;

    const { data } = await this.axiosInstance.get(url, { headers });
    return data;
  }

  async getBoard(id) {
    const { data } = await this.axiosInstance.get(`/board/${id}`);
    return data;
  }

  async getCbuilderBoard(id) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request', {
        cause: 401
      });
    }
    const headers = {
      Authorization: `Bearer ${authToken}`
    };
    const { data } = await this.axiosInstance.get(`/board/cbuilder/${id}`, {
      headers
    });
    return data;
  }

  async getSettings() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.get(`/settings`, { headers });
    return data;
  }

  async updateSettings(newSettings = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.post(`/settings`, newSettings, {
      headers
    });

    return data;
  }

  async generateCommunicationSentences(request = {}, options = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const requestConfig = {
      headers: { Authorization: `Bearer ${authToken}` }
    };
    const timeout = Number(options.timeout);
    if (Number.isFinite(timeout) && timeout > 0) {
      requestConfig.timeout = Math.min(Math.round(timeout), 60000);
    }

    const { data } = await this.axiosInstance.post(
      '/gpt/communication/sentences',
      request,
      requestConfig
    );
    return data;
  }

  async generateCommunicationPictogram(request = {}, options = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const requestConfig = {
      headers: { Authorization: `Bearer ${authToken}` }
    };
    const timeout = Number(options.timeout);
    if (Number.isFinite(timeout) && timeout > 0) {
      requestConfig.timeout = Math.min(Math.round(timeout), 180000);
    }

    const { data } = await this.axiosInstance.post(
      '/gpt/communication/pictogram-generation',
      request,
      requestConfig
    );
    const imageBase64 = String((data && data.imageBase64) || '');
    const provider = String((data && data.provider) || '').trim();
    const model = String((data && data.model) || '').trim();
    const generationId = String((data && data.generationId) || '').trim();
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) ||
      imageBase64.length > 2796208 ||
      !data ||
      data.mimeType !== 'image/png' ||
      !provider ||
      provider.length > 80 ||
      !model ||
      model.length > 160 ||
      !generationId ||
      generationId.length > 128 ||
      data.useScope !== 'device-private' ||
      data.sourceStored !== false ||
      data.publicLicenseDeclared !== false ||
      data.providerTermsApply !== true
    ) {
      throw new Error('Invalid pictogram generation response');
    }

    const blob = dataURLtoBlob(`data:image/png;base64,${imageBase64}`);
    if (!blob.size || blob.size > 2 * 1024 * 1024) {
      throw new Error('Invalid generated pictogram image size');
    }
    return {
      ...data,
      blob,
      fileName: `generated-pictogram-${generationId}.png`
    };
  }

  async getCommunicationAiHealth() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { data } = await this.axiosInstance.get('/gpt/communication/health', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    return data;
  }

  async getCommunicationAiUsage() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { data } = await this.axiosInstance.get('/gpt/communication/usage', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    return data;
  }

  async getCommunicationServiceHealth() {
    const { data } = await this.axiosInstance.get('/health', {
      validateStatus: status => status === 200 || status === 503
    });
    return data;
  }

  async resegmentCommunicationText(request = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { data } = await this.axiosInstance.post(
      '/gpt/communication/resegment',
      request,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    return data;
  }

  async normalizeCommunicationDialectText(request = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { data } = await this.axiosInstance.post(
      '/gpt/communication/dialect-normalization',
      request,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    return data;
  }

  async recognizeCommunicationDialectAudio(file) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    if (!file) {
      throw new Error('Need audio to perform this request');
    }

    const formData = new FormData();
    formData.append(
      'audio',
      file,
      file.name || 'communication-cantonese-audio'
    );
    const { data } = await this.axiosInstance.post(
      '/gpt/communication/dialect-asr',
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return data;
  }

  async recognizeCommunicationImageText(file) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    if (!file) {
      throw new Error('Need an image to perform this request');
    }

    const formData = new FormData();
    formData.append('image', file, file.name || 'communication-ocr-image');
    const { data } = await this.axiosInstance.post(
      '/gpt/communication/ocr',
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return data;
  }

  async suggestCommunicationPictogramMetadata(file) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    if (!file) {
      throw new Error('Need an image to perform this request');
    }

    const formData = new FormData();
    formData.append(
      'image',
      file,
      file.name || 'communication-pictogram-image'
    );
    const { data } = await this.axiosInstance.post(
      '/gpt/communication/pictogram-metadata',
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return data;
  }

  async removeCommunicationImageBackground(file) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    if (!file) {
      throw new Error('Need an image to perform this request');
    }

    const formData = new FormData();
    formData.append(
      'image',
      file,
      file.name || 'communication-background-removal-image'
    );
    const { data } = await this.axiosInstance.post(
      '/gpt/communication/background-removal',
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    const imageBase64 = String((data && data.imageBase64) || '');
    const width = Number(data && data.width);
    const height = Number(data && data.height);
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) ||
      imageBase64.length > 5592408 ||
      !data ||
      data.mimeType !== 'image/png' ||
      data.sourceStored !== false ||
      data.originalRetained !== true ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192
    ) {
      throw new Error('Invalid background removal response');
    }

    const blob = dataURLtoBlob(`data:image/png;base64,${imageBase64}`);
    if (!blob.size || blob.size > 4 * 1024 * 1024) {
      throw new Error('Invalid background removal image size');
    }
    return {
      ...data,
      blob,
      fileName: 'pictogram-no-background.png'
    };
  }

  async searchCommunicationPictograms(tokens = []) {
    const normalizedTokens = Array.from(
      new Set(
        (Array.isArray(tokens) ? tokens : [])
          .map(token => String(token || '').trim())
          .filter(token => token && token.length <= 24)
      )
    ).slice(0, 12);

    if (!normalizedTokens.length) return [];

    const { data } = await this.axiosInstance.post('/pictograms/search', {
      tokens: normalizedTokens
    });
    const results = data && Array.isArray(data.results) ? data.results : [];

    return results
      .map(result => {
        const pictogram = result && result.pictogram;
        const imageUrl = resolveTrustedApiMediaUrl(
          pictogram && (pictogram.imageUrl || pictogram.image)
        );
        if (!result || !result.token || !pictogram || !imageUrl) return null;
        return {
          token: String(result.token).trim(),
          pictogram: {
            ...pictogram,
            image: imageUrl,
            imageUrl
          }
        };
      })
      .filter(Boolean);
  }

  async getPrivatePictureLibraryMetadata() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const { data } = await this.axiosInstance.get(
      '/communication/private-library',
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    return data;
  }

  async convertCommunicationAacFile(file, format, locale = 'zh-CN') {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const normalizedFormat = String(format || '').toLowerCase();
    if (!['snap', 'touchchat'].includes(normalizedFormat)) {
      throw new Error('AAC import format must be snap or touchchat');
    }
    if (
      !file ||
      !Number.isFinite(file.size) ||
      file.size <= 0 ||
      file.size > 20 * 1024 * 1024
    ) {
      throw new Error('AAC import file must be no larger than 20 MiB');
    }

    const formData = new FormData();
    formData.append('file', file, file.name || `imported.${normalizedFormat}`);
    const { data } = await this.axiosInstance.post(
      '/communication/aac-import/convert',
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        },
        params: {
          format: normalizedFormat,
          locale: String(locale || 'zh-CN')
        }
      }
    );
    if (
      !data ||
      data.format !== 'picinterpreter-aac-conversion' ||
      data.contractVersion !== 1 ||
      !Array.isArray(data.documents) ||
      !data.documents.length
    ) {
      throw new Error('Invalid AAC import conversion response');
    }
    return data;
  }

  async uploadPrivatePictureLibrary(archive) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    if (
      !archive ||
      !Number.isFinite(archive.size) ||
      archive.size <= 0 ||
      archive.size > 20 * 1024 * 1024
    ) {
      throw new Error(
        'Private picture library must be an encrypted backup up to 20 MiB'
      );
    }

    const formData = new FormData();
    formData.append(
      'file',
      archive,
      'picinterpreter-private-picture-library.pijenc'
    );
    const { data } = await this.axiosInstance.post(
      '/communication/private-library',
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return data;
  }

  async downloadPrivatePictureLibrary() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const { data } = await this.axiosInstance.get(
      '/communication/private-library/download',
      {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'blob'
      }
    );
    if (
      !data ||
      !Number.isFinite(data.size) ||
      data.size <= 0 ||
      data.size > 20 * 1024 * 1024
    ) {
      throw new Error('Invalid private picture library download');
    }
    return data;
  }

  async deletePrivatePictureLibrary() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const { data } = await this.axiosInstance.delete(
      '/communication/private-library',
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    return data;
  }

  async getPrivateDeviceDataMetadata() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const { data } = await this.axiosInstance.get(
      '/communication/private-device-data',
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    return data;
  }

  async uploadPrivateDeviceData(archive) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    if (
      !archive ||
      !Number.isFinite(archive.size) ||
      archive.size <= 0 ||
      archive.size > 20 * 1024 * 1024
    ) {
      throw new Error(
        'Private device data must be an encrypted backup up to 20 MiB'
      );
    }

    const formData = new FormData();
    formData.append(
      'file',
      archive,
      'picinterpreter-private-device-data.pijenc'
    );
    const { data } = await this.axiosInstance.post(
      '/communication/private-device-data',
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return data;
  }

  async downloadPrivateDeviceData() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const { data } = await this.axiosInstance.get(
      '/communication/private-device-data/download',
      {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'blob'
      }
    );
    if (
      !data ||
      !Number.isFinite(data.size) ||
      data.size <= 0 ||
      data.size > 20 * 1024 * 1024
    ) {
      throw new Error('Invalid private device-data download');
    }
    return data;
  }

  async deletePrivateDeviceData() {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const { data } = await this.axiosInstance.delete(
      '/communication/private-device-data',
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    return data;
  }

  async syncConfirmedReceiverRecords(records = []) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { data } = await this.axiosInstance.post(
      '/communication/receiver-records/sync',
      { records: buildConfirmedReceiverSyncPayload(records) },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const deletedRecords =
      data && Array.isArray(data.deletedRecords)
        ? data.deletedRecords
            .map(record => ({
              id: String((record && record.id) || '').trim(),
              deletedAt: Number(record && record.deletedAt) || 0,
              deletedBy: String((record && record.deletedBy) || '').trim(),
              serverVersion: Number(record && record.serverVersion) || 1
            }))
            .filter(record => record.id && record.deletedAt && record.deletedBy)
        : [];
    const deletedRecordIds = Array.from(
      new Set([
        ...(data && Array.isArray(data.deletedRecordIds)
          ? data.deletedRecordIds
          : []),
        ...deletedRecords.map(record => record.id)
      ])
    )
      .map(value => String(value || '').trim())
      .filter(Boolean);
    return {
      acceptedCount: Number(data && data.acceptedCount) || 0,
      conflictCount: Number(data && data.conflictCount) || 0,
      conflictedRecordIds:
        data && Array.isArray(data.conflictedRecordIds)
          ? data.conflictedRecordIds
              .map(value => String(value || '').trim())
              .filter(Boolean)
          : [],
      records: data && Array.isArray(data.records) ? data.records : [],
      deletedRecordIds,
      deletedRecords
    };
  }

  async deleteConfirmedReceiverRecords(recordIds = [], options = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(recordIds) ? recordIds : [])
          .map(value => String(value || '').trim())
          .filter(Boolean)
      )
    ).slice(0, 100);
    const data = options.deleteAll
      ? { deleteAll: true }
      : { recordIds: normalizedIds };
    if (!options.deleteAll && !normalizedIds.length) {
      return { deletedCount: 0, deletedRecordIds: [] };
    }

    const response = await this.axiosInstance.delete(
      '/communication/receiver-records',
      {
        data,
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    const deletedRecords =
      response.data && Array.isArray(response.data.deletedRecords)
        ? response.data.deletedRecords
        : [];
    return {
      deletedCount: Number(response.data && response.data.deletedCount) || 0,
      deletedRecordIds: Array.from(
        new Set([
          ...(response.data && Array.isArray(response.data.deletedRecordIds)
            ? response.data.deletedRecordIds
            : normalizedIds),
          ...deletedRecords.map(record => record && record.id)
        ])
      )
        .map(value => String(value || '').trim())
        .filter(Boolean),
      deletedRecords
    };
  }

  async syncCommunicationSavedPhrases(phrases = []) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const { data } = await this.axiosInstance.post(
      '/communication/saved-phrases/sync',
      {
        phrases: buildCommunicationSavedPhraseSyncPayload(phrases)
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const deletedPhrases = normalizeSavedPhraseTombstones(
      data && data.deletedPhrases
    );
    const deletedPhraseIds = Array.from(
      new Set([
        ...(data && Array.isArray(data.deletedPhraseIds)
          ? data.deletedPhraseIds
          : []),
        ...deletedPhrases.map(phrase => phrase.id)
      ])
    )
      .map(value => String(value || '').trim())
      .filter(Boolean);

    return {
      acceptedCount: Number(data && data.acceptedCount) || 0,
      conflictCount: Number(data && data.conflictCount) || 0,
      conflictedPhraseIds:
        data && Array.isArray(data.conflictedPhraseIds)
          ? data.conflictedPhraseIds
              .map(value => String(value || '').trim())
              .filter(Boolean)
          : [],
      phrases: data && Array.isArray(data.phrases) ? data.phrases : [],
      deletedPhraseIds,
      deletedPhrases
    };
  }

  async deleteCommunicationSavedPhrases(phraseIds = [], options = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(phraseIds) ? phraseIds : [])
          .map(value => String(value || '').trim())
          .filter(Boolean)
      )
    ).slice(0, 100);
    const data = options.deleteAll
      ? { deleteAll: true }
      : { phraseIds: normalizedIds };
    if (!options.deleteAll && !normalizedIds.length) {
      return {
        deletedCount: 0,
        deletedPhraseIds: [],
        deletedPhrases: []
      };
    }

    const response = await this.axiosInstance.delete(
      '/communication/saved-phrases',
      {
        data,
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    const deletedPhrases = normalizeSavedPhraseTombstones(
      response.data && response.data.deletedPhrases
    );
    return {
      deletedCount: Number(response.data && response.data.deletedCount) || 0,
      deletedPhraseIds: Array.from(
        new Set([
          ...(response.data && Array.isArray(response.data.deletedPhraseIds)
            ? response.data.deletedPhraseIds
            : normalizedIds),
          ...deletedPhrases.map(phrase => phrase.id)
        ])
      )
        .map(value => String(value || '').trim())
        .filter(Boolean),
      deletedPhrases
    };
  }

  async updateUser(user) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.put(`/user/${user.id}`, user, {
      headers
    });

    return data;
  }

  async getPublicBoardBundle(id) {
    const { data } = await this.axiosInstance.get(`/board/public/${id}/bundle`);
    return data;
  }

  async createBoard(board) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.post(`/board`, board, {
      headers
    });
    return data;
  }

  async updateBoard(board) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.put(`/board/${board.id}`, board, {
      headers
    });

    return data;
  }

  async deleteBoard(boardId) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.delete(`/board/${boardId}`, {
      headers
    });

    return data;
  }

  async boardReport(reportedBoardData) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.post(
      `/board/report`,
      reportedBoardData,
      { headers }
    );
    return data;
  }

  async tryUploadDataURL(dataURL, filename, checkExtension = false) {
    let blob;
    try {
      blob = dataURLtoBlob(dataURL);
    } catch (e) {
      return { url: null, unrecoverable: true };
    }
    let name = filename;
    if (checkExtension) {
      const extension = (blob.type.split('/')[1] || 'png').toLowerCase();
      name = `${filename}.${extension}`;
    }
    try {
      const url = await this.uploadFile(blob, name);
      return { url, unrecoverable: false };
    } catch (e) {
      return { url: null, unrecoverable: false };
    }
  }

  async uploadFromDataURL(dataURL, filename, checkExtension = false) {
    const { url } = await this.tryUploadDataURL(
      dataURL,
      filename,
      checkExtension
    );
    return url;
  }

  async uploadTileImageMedia(tile) {
    if (isDataURL(tile.image)) {
      const { url, unrecoverable } = await this.tryUploadDataURL(
        tile.image,
        tile.id,
        true
      );
      return { attempted: true, url, unrecoverable };
    }

    if (isLocalFileURL(tile.image) && isAndroid()) {
      const resolved = await new Promise(resolve => {
        window.resolveLocalFileSystemURL(
          tile.image,
          fileEntry => {
            fileEntry.file(
              file => resolve({ file }),
              error => resolve({ error })
            );
          },
          error => resolve({ error })
        );
      });
      if (!resolved.file) {
        return {
          attempted: true,
          url: null,
          unrecoverable: isUnrecoverableFileError(resolved.error)
        };
      }

      let realBlob;
      try {
        realBlob = await cvaFileToBlob(resolved.file, 'image/png');
      } catch (e) {
        return { attempted: true, url: null, unrecoverable: true };
      }

      try {
        const segments = tile.image.split('/');
        const name = segments[segments.length - 1] || tile.id;
        const url = await this.uploadFile(realBlob, name);
        return { attempted: true, url, unrecoverable: false };
      } catch (e) {
        return { attempted: true, url: null, unrecoverable: false };
      }
    }

    return { attempted: false, url: null, unrecoverable: false };
  }

  async uploadTileSoundMedia(tile) {
    if (isDataURL(tile.sound)) {
      const { url, unrecoverable } = await this.tryUploadDataURL(
        tile.sound,
        `${tile.id}.mp3`
      );
      return { attempted: true, url, unrecoverable };
    }

    return { attempted: false, url: null, unrecoverable: false };
  }

  async uploadBoardCaptionMedia(board) {
    if (isDataURL(board?.caption)) {
      const { url, unrecoverable } = await this.tryUploadDataURL(
        board.caption,
        board.id,
        true
      );
      return { attempted: true, url, unrecoverable };
    }

    return { attempted: false, url: null, unrecoverable: false };
  }

  async uploadBoardLocalMedia(board) {
    const tiles = board?.tiles || [];
    const targets = tiles.filter(
      tile =>
        isDataURL(tile?.image) ||
        isLocalFileURL(tile?.image) ||
        isDataURL(tile?.sound)
    );

    const captionIsTarget = isDataURL(board?.caption);

    if (!targets.length && !captionIsTarget) {
      return { board, hadFailure: false };
    }

    const tileUpdates = {};
    let hadFailure = false;

    const applyMedia = (result, apply) => {
      if (!result.attempted) return;
      if (result.url) apply(result.url);
      else if (result.unrecoverable) apply('');
      else hadFailure = true;
    };

    const captionPromise = captionIsTarget
      ? this.uploadBoardCaptionMedia(board)
      : null;

    const uploadTarget = async tile => {
      try {
        const [image, sound] = await Promise.all([
          this.uploadTileImageMedia(tile),
          this.uploadTileSoundMedia(tile)
        ]);

        const update = {};
        applyMedia(image, url => (update.image = url));
        applyMedia(sound, url => (update.sound = url));

        if (Object.keys(update).length) {
          tileUpdates[tile.id] = update;
        }
      } catch (e) {
        hadFailure = true;
      }
    };

    const CONCURRENCY = 5;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      await Promise.all(targets.slice(i, i + CONCURRENCY).map(uploadTarget));
    }

    const sanitizedBoard = {
      ...board,
      tiles: tiles.map(tile => {
        const update = tileUpdates[(tile?.id)];
        return update ? { ...tile, ...update } : tile;
      })
    };

    if (captionPromise) {
      applyMedia(await captionPromise, url => (sanitizedBoard.caption = url));
    }

    return { board: sanitizedBoard, hadFailure };
  }

  async uploadFile(file, filename) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'multipart/form-data'
    };

    const formData = new FormData();
    formData.append('file', file, filename);
    const response = await this.axiosInstance.post('media', formData, {
      headers
    });

    const url = response.data.url;
    return (url && convertMediaUrlToCDN(url)) || url;
  }

  async createCommunicator(communicator) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    let data = {};
    let response = {};
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const clientCreationKey = communicator && communicator.id;
    if (
      typeof clientCreationKey === 'string' &&
      clientCreationKey.length < 15 &&
      /^[A-Za-z0-9_-]+$/.test(clientCreationKey)
    ) {
      headers['Idempotency-Key'] = clientCreationKey;
    }

    const communicatorToPost = { ...communicator };
    delete communicatorToPost.id;
    const { name, email } = getUserData();
    communicatorToPost.email = email;
    communicatorToPost.author = name;
    response = await this.axiosInstance.post(
      `/communicator`,
      communicatorToPost,
      { headers }
    );
    data = response.data.communicator;
    return data;
  }

  async updateCommunicator(communicator) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    let data = {};
    let response = {};
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const isLocalCommunicator =
      communicator.id && communicator.id === LOCAL_COMMUNICATOR_ID;

    if (isLocalCommunicator) {
      return this.createCommunicator(communicator);
    } else {
      response = await this.axiosInstance.put(
        `/communicator/${communicator.id}`,
        communicator,
        { headers }
      );
      data = response.data;
    }

    return data;
  }

  async analyticsReport(report) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const headers = {
      Authorization: `Bearer ${authToken}`
    };

    const { data } = await this.axiosInstance.post(
      `/analytics/batchGet`,
      report,
      {
        headers
      }
    );
    return data;
  }

  async getUserLocation() {
    const { data } = await this.axiosInstance.get(`/location`);
    return data;
  }

  async getSubscriber(userId = getUserData().id, requestOrigin = 'unknown') {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const headers = {
      Authorization: `Bearer ${authToken}`,
      requestOrigin,
      purchaseVersion: '1.0.0'
    };
    const { data } = await this.axiosInstance.get(`/subscriber/${userId}`, {
      headers
    });

    if (data && !data.success) {
      throw data;
    }

    return data;
  }

  async createSubscriber(subscriber = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };
    const { data } = await this.axiosInstance.post(`/subscriber`, subscriber, {
      headers
    });
    return data;
  }

  async cancelPlan(subscriptionId = '') {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }
    const data = { reason: 'User cancelled the subscription' };

    const headers = {
      Authorization: `Bearer ${authToken}`
    };
    const res = await this.axiosInstance.post(
      `/subscriber/cancel/${subscriptionId}`,
      { data },
      { headers }
    );
    return res;
  }

  async postTransaction(transaction = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };
    const subscriberId = getSubscriberId();
    if (!subscriberId) throw new Error('No subscriber id supplied');

    const { data } = await this.axiosInstance.post(
      `/subscriber/${subscriberId}/transaction`,
      transaction,
      {
        headers
      }
    );
    return data;
  }

  async updateSubscriber(subscriber = {}) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    const headers = {
      Authorization: `Bearer ${authToken}`
    };
    const subscriberId = getSubscriberId();
    if (!subscriberId) throw new Error('No subscriber id supplied');

    const { data } = await this.axiosInstance.patch(
      `/subscriber/${subscriberId}`,
      subscriber,
      {
        headers
      }
    );
    return data;
  }

  async listSubscriptions() {
    const { data } = await this.axiosInstance.get(`/subscription/list`);
    return data;
  }

  async deleteAccount() {
    const userId = getUserData().id;
    if (userId) {
      const authToken = getAuthToken();
      if (!(authToken && authToken.length)) {
        throw new Error('Need to be authenticated to perform this request');
      }

      const headers = {
        Authorization: `Bearer ${authToken}`
      };
      const { data } = await this.axiosInstance.delete(`/account/${userId}`, {
        headers
      });
      return data;
    }
  }

  async improvePhrase({ phrase, language }) {
    const authToken = getAuthToken();
    if (!(authToken && authToken.length)) {
      throw new Error('Need to be authenticated to perform this request');
    }

    try {
      const headers = {
        Authorization: `Bearer ${authToken}`
      };
      improvePhraseAbortController = new AbortController();
      const { data } = await this.axiosInstance.post(
        `/gpt/edit`,
        { phrase, language },
        {
          headers,
          signal: improvePhraseAbortController.signal
        }
      );
      return data;
    } catch (error) {
      if (error.message !== 'canceled') console.error(error);
      return { phrase: '' };
    }
  }
}

const API_INSTANCE = new API({});

export default API_INSTANCE;
