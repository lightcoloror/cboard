import { normalizeMainlandChinaPhone } from './accountPhone';

const VERIFICATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function hasMatchingPhoneVerification({
  phone,
  verifiedPhone,
  verificationToken
}) {
  const normalizedPhone = normalizeMainlandChinaPhone(phone);
  return Boolean(
    normalizedPhone &&
      normalizedPhone === normalizeMainlandChinaPhone(verifiedPhone) &&
      VERIFICATION_TOKEN_PATTERN.test(String(verificationToken || ''))
  );
}

export function buildRegistrationPayload(
  values,
  { verifiedPhone, verificationToken }
) {
  const { passwordConfirm, phone, ...remainingValues } = values;
  const normalizedPhone = normalizeMainlandChinaPhone(phone);
  if (!normalizedPhone) return remainingValues;
  return {
    ...remainingValues,
    phone: normalizedPhone,
    ...(hasMatchingPhoneVerification({
      phone: normalizedPhone,
      verifiedPhone,
      verificationToken
    })
      ? { phoneVerificationToken: verificationToken }
      : {})
  };
}

export function blocksPhoneRegistration({
  phone,
  configuration,
  loading,
  verifiedPhone,
  verificationToken
}) {
  const normalizedPhone = normalizeMainlandChinaPhone(phone);
  if (!normalizedPhone) return false;
  if (loading) return true;
  return Boolean(
    configuration &&
      configuration.requiredForPhoneRegistration &&
      !hasMatchingPhoneVerification({
        phone: normalizedPhone,
        verifiedPhone,
        verificationToken
      })
  );
}
