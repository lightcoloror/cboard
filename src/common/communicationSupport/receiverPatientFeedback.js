export const RECEIVER_PATIENT_FEEDBACK = Object.freeze({
  understood: 'understood',
  notUnderstood: 'not_understood',
  repeatRequested: 'repeat_requested'
});

export const MAX_RECEIVER_PATIENT_FEEDBACK_EVENTS = 20;

const VALID_FEEDBACK = new Set(Object.values(RECEIVER_PATIENT_FEEDBACK));

const RECEIVER_PATIENT_FEEDBACK_LABELS = Object.freeze({
  [RECEIVER_PATIENT_FEEDBACK.understood]: '明白了',
  [RECEIVER_PATIENT_FEEDBACK.notUnderstood]: '没明白',
  [RECEIVER_PATIENT_FEEDBACK.repeatRequested]: '再说一次'
});

export function normalizeReceiverPatientFeedback(value) {
  const normalized = String(value || '').trim();
  return VALID_FEEDBACK.has(normalized) ? normalized : null;
}

export function getReceiverPatientFeedbackLabel(value) {
  const normalized = normalizeReceiverPatientFeedback(value);
  return normalized ? RECEIVER_PATIENT_FEEDBACK_LABELS[normalized] : '';
}

export function getReceiverPatientFeedbackCaregiverNotice(
  value,
  { saved = true } = {}
) {
  const normalized = normalizeReceiverPatientFeedback(value);
  if (!normalized) return '';
  if (!saved) {
    return normalized === RECEIVER_PATIENT_FEEDBACK.repeatRequested
      ? '患者请求再说一次，但反馈未能保存。'
      : '患者反馈未能保存，已返回复核，可继续沟通。';
  }
  if (normalized === RECEIVER_PATIENT_FEEDBACK.understood) {
    return '患者反馈：已理解，可以开始下一句话。';
  }
  if (normalized === RECEIVER_PATIENT_FEEDBACK.notUnderstood) {
    return '患者反馈：没明白，请修改文字、分词或图片后重新展示。';
  }
  return '患者请求再说一次。';
}

export function normalizeReceiverPatientFeedbackEvents(value) {
  return (Array.isArray(value) ? value : [])
    .map(event => {
      const type = normalizeReceiverPatientFeedback(event && event.type);
      const createdAt = Number(event && event.createdAt);

      return type && Number.isFinite(createdAt) && createdAt > 0
        ? { type, createdAt: Math.floor(createdAt) }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_RECEIVER_PATIENT_FEEDBACK_EVENTS);
}

export function appendReceiverPatientFeedback(
  record,
  feedback,
  { now = Date.now } = {}
) {
  if (
    !record ||
    record.direction !== 'receive' ||
    record.recordStatus !== 'confirmed'
  ) {
    throw new TypeError(
      'Patient feedback requires a confirmed receiver record'
    );
  }

  const type = normalizeReceiverPatientFeedback(feedback);
  if (!type) {
    throw new TypeError(`Unsupported patient feedback: ${feedback}`);
  }

  const requestedAt = Number(typeof now === 'function' ? now() : Date.now());
  if (!Number.isFinite(requestedAt) || requestedAt <= 0) {
    throw new TypeError('Patient feedback requires a valid timestamp');
  }

  const currentUpdatedAt = Number(record.updatedAt) || 0;
  const createdAt =
    requestedAt > currentUpdatedAt
      ? Math.floor(requestedAt)
      : Math.floor(currentUpdatedAt) + 1;
  const patientFeedbackEvents = [
    ...normalizeReceiverPatientFeedbackEvents(record.patientFeedbackEvents),
    { type, createdAt }
  ].slice(-MAX_RECEIVER_PATIENT_FEEDBACK_EVENTS);

  return {
    ...record,
    patientFeedback: type,
    patientFeedbackAt: createdAt,
    patientFeedbackEvents,
    updatedAt: createdAt
  };
}
