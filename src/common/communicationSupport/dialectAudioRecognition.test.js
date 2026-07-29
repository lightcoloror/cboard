import {
  MAX_DIALECT_AUDIO_BYTES,
  normalizeDialectAudioRecognitionResponse,
  validateDialectAudioFile
} from './dialectAudioRecognition';

describe('dialectAudioRecognition', () => {
  test('accepts only bounded provider-supported audio types', () => {
    expect(
      validateDialectAudioFile({
        type: 'audio/mpeg',
        size: 1024
      })
    ).toEqual({
      valid: true,
      message: '',
      mimeType: 'audio/mpeg',
      voiceFormat: 'mp3'
    });
    expect(
      validateDialectAudioFile({
        type: 'audio/webm',
        size: 1024
      }).valid
    ).toBe(false);
    expect(
      validateDialectAudioFile({
        type: 'audio/mpeg',
        size: MAX_DIALECT_AUDIO_BYTES + 1
      }).valid
    ).toBe(false);
  });

  test('normalizes a bounded source-preserving Cantonese response', () => {
    expect(
      normalizeDialectAudioRecognitionResponse({
        text: '  我想饮水 ',
        dialect: 'cantonese',
        engine: '16k_yue',
        provider: 'tencentcloud-asr',
        audioDurationMs: 1250.4,
        audioStored: false,
        providerProcessing: true
      })
    ).toEqual({
      text: '我想饮水',
      dialect: 'cantonese',
      engine: '16k_yue',
      provider: 'tencentcloud-asr',
      audioDurationMs: 1250,
      audioStored: false,
      providerProcessing: true
    });
  });

  test('accepts the Volcengine bigmodel engine through the same review contract', () => {
    expect(
      normalizeDialectAudioRecognitionResponse({
        text: '我想饮水',
        dialect: 'cantonese',
        engine: 'bigmodel',
        provider: 'volcengine-bigasr',
        audioDurationMs: 1250,
        audioStored: false,
        providerProcessing: true
      })
    ).toEqual({
      text: '我想饮水',
      dialect: 'cantonese',
      engine: 'bigmodel',
      provider: 'volcengine-bigasr',
      audioDurationMs: 1250,
      audioStored: false,
      providerProcessing: true
    });
  });

  test('rejects privacy, dialect, engine, and duration mismatches', () => {
    const valid = {
      text: '我想饮水',
      dialect: 'cantonese',
      engine: '16k_yue',
      provider: 'tencentcloud-asr',
      audioDurationMs: 1000,
      audioStored: false,
      providerProcessing: true
    };

    expect(
      normalizeDialectAudioRecognitionResponse({
        ...valid,
        audioStored: true
      })
    ).toBeNull();
    expect(
      normalizeDialectAudioRecognitionResponse({
        ...valid,
        dialect: 'unknown'
      })
    ).toBeNull();
    expect(
      normalizeDialectAudioRecognitionResponse({
        ...valid,
        engine: '16k_zh'
      })
    ).toBeNull();
    expect(
      normalizeDialectAudioRecognitionResponse({
        ...valid,
        audioDurationMs: 60001
      })
    ).toBeNull();
  });
});
