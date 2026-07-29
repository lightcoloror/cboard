import {
  isValidMainlandChinaPhone,
  maskMainlandChinaPhone,
  normalizeMainlandChinaPhone,
  normalizeMaskedMainlandChinaPhone
} from './accountPhone';

describe('account phone helpers', () => {
  test('reuses the PicInterpreter mainland phone normalization rule', () => {
    expect(normalizeMainlandChinaPhone('138 0013 8000')).toBe('13800138000');
    expect(isValidMainlandChinaPhone('138 0013 8000')).toBe(true);
  });

  test('rejects invalid numbers and masks valid account output', () => {
    expect(isValidMainlandChinaPhone('2800138000')).toBe(false);
    expect(maskMainlandChinaPhone('13800138000')).toBe('138****8000');
    expect(maskMainlandChinaPhone('invalid')).toBe('');
    expect(normalizeMaskedMainlandChinaPhone(' 138****8000 ')).toBe(
      '138****8000'
    );
    expect(normalizeMaskedMainlandChinaPhone('13800138000')).toBe('');
  });
});
