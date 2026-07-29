import {
  IMAGE_TEXT_RECOGNITION_MAX_BYTES,
  normalizeImageTextRecognitionResponse,
  validateImageTextRecognitionFile
} from './imageTextRecognition';

describe('imageTextRecognition', () => {
  test('accepts only bounded OCR image types', () => {
    expect(
      validateImageTextRecognitionFile({
        type: 'image/png',
        size: IMAGE_TEXT_RECOGNITION_MAX_BYTES
      })
    ).toEqual({ valid: true, code: 'valid', message: '' });
    expect(
      validateImageTextRecognitionFile({
        type: 'image/gif',
        size: 10
      }).code
    ).toBe('unsupported_type');
    expect(
      validateImageTextRecognitionFile({
        type: 'image/jpeg',
        size: IMAGE_TEXT_RECOGNITION_MAX_BYTES + 1
      }).code
    ).toBe('file_too_large');
  });

  test('normalizes provider output without claiming that the source was stored', () => {
    expect(
      normalizeImageTextRecognitionResponse({
        text: '  我想\n喝水  ',
        provider: 'cboard-api-ai',
        sourceStored: false
      })
    ).toEqual({
      text: '我想 喝水',
      provider: 'cboard-api-ai',
      sourceStored: false
    });
  });
});
