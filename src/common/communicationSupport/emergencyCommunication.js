export const EMERGENCY_COMMUNICATION_PHRASES = Object.freeze([
  Object.freeze({
    id: 'help',
    label: '帮帮我',
    text: '帮帮我',
    tone: 'critical'
  }),
  Object.freeze({
    id: 'pain',
    label: '我很痛',
    text: '我很痛',
    tone: 'warning'
  }),
  Object.freeze({
    id: 'doctor',
    label: '叫医生',
    text: '请叫医生',
    tone: 'critical'
  }),
  Object.freeze({
    id: 'scared',
    label: '我害怕',
    text: '我害怕',
    tone: 'fear'
  }),
  Object.freeze({
    id: 'uncomfortable',
    label: '不舒服',
    text: '我不舒服',
    tone: 'warning'
  }),
  Object.freeze({ id: 'quiet', label: '请安静', text: '请安静', tone: 'calm' }),
  Object.freeze({
    id: 'water',
    label: '要喝水',
    text: '我要喝水',
    tone: 'need'
  }),
  Object.freeze({
    id: 'toilet',
    label: '上厕所',
    text: '我要上厕所',
    tone: 'need'
  })
]);

export function getEmergencyCommunicationPhrase(id) {
  const normalizedId = String(id || '').trim();
  return (
    EMERGENCY_COMMUNICATION_PHRASES.find(
      phrase => phrase.id === normalizedId
    ) || null
  );
}

export function buildEmergencyCommunicationFallback(id) {
  const phrase = getEmergencyCommunicationPhrase(id);
  return phrase
    ? {
        text: phrase.text,
        ariaLabel: `紧急求助：${phrase.text}`,
        visibleDurationMs: 5000
      }
    : null;
}
