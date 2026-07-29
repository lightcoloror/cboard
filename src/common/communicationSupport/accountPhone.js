export const MAINLAND_CHINA_PHONE_PATTERN = /^1\d{10}$/;
export const MASKED_MAINLAND_CHINA_PHONE_PATTERN = /^1\d{2}\*{4}\d{4}$/;

export function normalizeMainlandChinaPhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

export function isValidMainlandChinaPhone(value) {
  return MAINLAND_CHINA_PHONE_PATTERN.test(normalizeMainlandChinaPhone(value));
}

export function maskMainlandChinaPhone(value) {
  const phone = normalizeMainlandChinaPhone(value);
  return isValidMainlandChinaPhone(phone)
    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
    : '';
}

export function normalizeMaskedMainlandChinaPhone(value) {
  const phone = String(value || '').trim();
  return MASKED_MAINLAND_CHINA_PHONE_PATTERN.test(phone) ? phone : '';
}
