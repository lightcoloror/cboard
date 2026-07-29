import {
  normalizeCommunicationDialect,
  normalizeDialectText
} from './dialectNormalization';

export const MAX_DIALECT_AUDIO_BYTES = 3 * 1024 * 1024;
export const MAX_DIALECT_AUDIO_DURATION_MS = 60000;
export const DIALECT_AUDIO_ENGINE = '16k_yue';
export const DIALECT_AUDIO_ENGINES = Object.freeze([
  DIALECT_AUDIO_ENGINE,
  'bigmodel'
]);
export const DIALECT_AUDIO_TYPES = Object.freeze({
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg-opus',
  'audio/pcm': 'pcm',
  'audio/vnd.wave': 'wav',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/x-pcm': 'pcm',
  'audio/x-wav': 'wav'
});

function normalizeMimeType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(';')[0];
}

export function validateDialectAudioFile(file) {
  const size = Number(file && file.size);
  if (!file || !Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      message: '请选择有效的粤语录音文件。'
    };
  }
  if (size > MAX_DIALECT_AUDIO_BYTES) {
    return {
      valid: false,
      message: '粤语录音不能超过 3 MiB。'
    };
  }

  const mimeType = normalizeMimeType(file.type || file.mimeType);
  const voiceFormat = DIALECT_AUDIO_TYPES[mimeType];
  if (!voiceFormat) {
    return {
      valid: false,
      message:
        '录音格式不受支持，请使用 MP3、M4A、AAC、WAV、PCM、AMR 或 OGG Opus。'
    };
  }
  return {
    valid: true,
    message: '',
    mimeType,
    voiceFormat
  };
}

export function normalizeDialectAudioRecognitionResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const text = normalizeDialectText(value.text);
  const dialect = normalizeCommunicationDialect(value.dialect);
  const engine = String(value.engine || '').trim();
  const provider = String(value.provider || '').trim();
  const audioDurationMs = Number(value.audioDurationMs);
  if (
    !text ||
    dialect !== 'cantonese' ||
    !DIALECT_AUDIO_ENGINES.includes(engine) ||
    !provider ||
    value.audioStored !== false ||
    value.providerProcessing !== true ||
    !Number.isFinite(audioDurationMs) ||
    audioDurationMs < 0 ||
    audioDurationMs > MAX_DIALECT_AUDIO_DURATION_MS
  ) {
    return null;
  }

  return {
    text,
    dialect,
    engine,
    provider,
    audioDurationMs: Math.round(audioDurationMs),
    audioStored: false,
    providerProcessing: true
  };
}
