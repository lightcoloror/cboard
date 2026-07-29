export const COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES = Object.freeze({
  minute: 'minute',
  month: 'month'
});

function parseErrorPayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (error) {
    return null;
  }
}

function getErrorCode(value) {
  const payload = parseErrorPayload(value);
  const payloadError = payload && payload.error;
  return payloadError &&
    typeof payloadError === 'object' &&
    !Array.isArray(payloadError)
    ? String(payloadError.code || '')
    : '';
}

export function getCommunicationEnhancementLimitScope(error) {
  const response = error && error.response;
  const status = Number(
    (response && response.status) || (error && error.status)
  );
  if (status !== 429) return '';

  const responseData = response ? response.data : error && error.data;
  return [
    'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED',
    'COMMUNICATION_AI_TOKEN_QUOTA_EXCEEDED'
  ].includes(getErrorCode(responseData))
    ? COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month
    : COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute;
}
