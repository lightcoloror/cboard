export const IMAGE_TEXT_RECOGNITION_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_TEXT_RECOGNITION_MAX_CHARS = 120;
export const IMAGE_TEXT_RECOGNITION_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export function validateImageTextRecognitionFile(file = {}) {
  const type = String(file.type || '')
    .trim()
    .toLowerCase();
  const size = Number(file.size);

  if (!IMAGE_TEXT_RECOGNITION_TYPES.includes(type)) {
    return {
      valid: false,
      code: 'unsupported_type',
      message: '请选择 JPEG、PNG 或 WebP 图片。'
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      code: 'empty_file',
      message: '没有读取到有效图片。'
    };
  }
  if (size > IMAGE_TEXT_RECOGNITION_MAX_BYTES) {
    return {
      valid: false,
      code: 'file_too_large',
      message: '图片需小于 2 MiB，请压缩或裁剪后重试。'
    };
  }

  return { valid: true, code: 'valid', message: '' };
}

export function normalizeImageTextRecognitionResponse(value = {}) {
  return {
    text: String(value.text || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, IMAGE_TEXT_RECOGNITION_MAX_CHARS),
    provider: String(value.provider || ''),
    sourceStored: Boolean(value.sourceStored)
  };
}
