const CORDOVA_RECORDING_PLATFORMS = new Set(['android', 'ios']);

const getDefaultScope = () => (typeof window === 'undefined' ? null : window);

const normalizeRecordingError = error => {
  if (error instanceof Error) return error;
  const message =
    error && typeof error.message === 'string'
      ? error.message
      : 'Voice recording failed';
  return new Error(message);
};

const stopMediaStream = stream => {
  if (!stream || typeof stream.getTracks !== 'function') return;
  stream.getTracks().forEach(track => track.stop());
};

const readBlobAsDataUrl = (scope, blob) =>
  new Promise((resolve, reject) => {
    const reader = new scope.FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error || new Error('Unable to read voice recording'));
    reader.readAsDataURL(blob);
  });

const normalizeDataUrlMimeType = (dataUrl, mimeType) => {
  if (
    typeof dataUrl !== 'string' ||
    !mimeType ||
    !dataUrl.startsWith('data:;')
  ) {
    return dataUrl;
  }
  return dataUrl.replace('data:;', `data:${mimeType};`);
};

export const getCordovaVoiceRecorderPlugin = (scope = getDefaultScope()) => {
  const platformId = scope && scope.cordova && scope.cordova.platformId;
  return scope &&
    CORDOVA_RECORDING_PLATFORMS.has(platformId) &&
    typeof scope.Media === 'function' &&
    scope.cordova.file &&
    typeof scope.resolveLocalFileSystemURL === 'function'
    ? scope.Media
    : null;
};

export const createCordovaRecordingTarget = (
  scope = getDefaultScope(),
  timestamp = Date.now()
) => {
  const platformId = scope.cordova.platformId;
  const extension = platformId === 'android' ? 'aac' : 'm4a';
  const mimeType = platformId === 'android' ? 'audio/aac' : 'audio/mp4';
  const directoryUrl =
    scope.cordova.file.cacheDirectory || scope.cordova.file.tempDirectory;

  if (!directoryUrl) {
    throw new Error('Cordova recording directory is unavailable');
  }

  const fileName = `cboard-voice-${timestamp}.${extension}`;
  const fileUrl = `${directoryUrl}${fileName}`;
  const nativePath = decodeURIComponent(fileUrl.replace(/^file:\/\//, ''));

  return {
    fileName,
    fileUrl,
    mediaPath: platformId === 'android' ? nativePath : fileUrl,
    mimeType
  };
};

export const readCordovaRecordingAsDataUrl = (scope, fileUrl, mimeType) =>
  new Promise((resolve, reject) => {
    scope.resolveLocalFileSystemURL(
      fileUrl,
      fileEntry => {
        fileEntry.file(file => {
          const reader = new scope.FileReader();
          reader.onloadend = () =>
            resolve(normalizeDataUrlMimeType(reader.result, mimeType));
          reader.onerror = () =>
            reject(
              reader.error ||
                new Error('Unable to read Cordova voice recording')
            );
          reader.readAsDataURL(file);
        }, reject);
      },
      reject
    );
  });

export const removeCordovaRecording = (scope, fileUrl) =>
  new Promise(resolve => {
    scope.resolveLocalFileSystemURL(
      fileUrl,
      fileEntry => fileEntry.remove(resolve, resolve),
      resolve
    );
  });

export const createBrowserVoiceRecordingSession = ({
  scope = getDefaultScope(),
  onRecorded,
  onError
}) => {
  let mediaRecorder = null;
  let mediaStream = null;
  let chunks = [];
  let cancelled = false;

  const fail = error => {
    stopMediaStream(mediaStream);
    if (!cancelled && typeof onError === 'function') {
      onError(normalizeRecordingError(error));
    }
  };

  return {
    async start() {
      if (
        !scope ||
        !scope.navigator ||
        !scope.navigator.mediaDevices ||
        typeof scope.navigator.mediaDevices.getUserMedia !== 'function' ||
        typeof scope.MediaRecorder !== 'function'
      ) {
        throw new Error('Browser voice recording is unavailable');
      }

      mediaStream = await scope.navigator.mediaDevices.getUserMedia({
        audio: true
      });
      mediaRecorder = new scope.MediaRecorder(mediaStream);
      chunks = [];
      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size !== 0) chunks.push(event.data);
      };
      mediaRecorder.onerror = event => fail(event.error || event);
      mediaRecorder.onstop = async () => {
        stopMediaStream(mediaStream);
        if (cancelled) return;

        try {
          const mimeType =
            mediaRecorder.mimeType ||
            (chunks[0] && chunks[0].type) ||
            'audio/webm';
          const recording = new scope.Blob(chunks, { type: mimeType });
          const dataUrl = await readBlobAsDataUrl(scope, recording);
          if (!cancelled && typeof onRecorded === 'function') {
            onRecorded(dataUrl);
          }
        } catch (error) {
          fail(error);
        }
      };
      mediaRecorder.start();
    },

    stop() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      stopMediaStream(mediaStream);
    },

    dispose() {
      cancelled = true;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      stopMediaStream(mediaStream);
    }
  };
};

export const createCordovaVoiceRecordingSession = ({
  scope = getDefaultScope(),
  onRecorded,
  onError
}) => {
  const Media = getCordovaVoiceRecorderPlugin(scope);
  if (!Media) {
    throw new Error('Cordova voice recording is unavailable');
  }

  const target = createCordovaRecordingTarget(scope);
  let media = null;
  let active = false;
  let settled = false;
  let cancelled = false;

  const release = () => {
    if (media) {
      media.release();
      media = null;
    }
  };

  const cleanup = async () => {
    release();
    await removeCordovaRecording(scope, target.fileUrl);
  };

  const fail = async error => {
    if (settled) return;
    settled = true;
    active = false;
    await cleanup();
    if (!cancelled && typeof onError === 'function') {
      onError(normalizeRecordingError(error));
    }
  };

  const complete = async () => {
    if (settled) return;
    settled = true;
    active = false;
    let dataUrl;
    try {
      dataUrl = await readCordovaRecordingAsDataUrl(
        scope,
        target.fileUrl,
        target.mimeType
      );
      await cleanup();
    } catch (error) {
      await cleanup();
      if (!cancelled && typeof onError === 'function') {
        onError(normalizeRecordingError(error));
      }
      return;
    }

    if (!cancelled && typeof onRecorded === 'function') {
      onRecorded(dataUrl);
    }
  };

  return {
    start() {
      media = new Media(
        target.mediaPath,
        () => {
          void complete();
        },
        error => {
          void fail(error);
        }
      );
      media.startRecord();
      active = true;
    },

    stop() {
      if (media && active) {
        active = false;
        media.stopRecord();
      }
    },

    dispose() {
      cancelled = true;
      settled = true;
      if (media && active) {
        active = false;
        media.stopRecord();
      }
      release();
      void removeCordovaRecording(scope, target.fileUrl);
    }
  };
};

export const createVoiceRecordingSession = options =>
  getCordovaVoiceRecorderPlugin(options.scope)
    ? createCordovaVoiceRecordingSession(options)
    : createBrowserVoiceRecordingSession(options);
