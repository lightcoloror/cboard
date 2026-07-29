import {
  EMERGENCY_COMMUNICATION_PHRASES,
  buildEmergencyCommunicationFallback,
  getEmergencyCommunicationPhrase
} from './emergencyCommunication';

describe('emergency communication contract', () => {
  test('preserves the eight validated PicInterpreter emergency phrases', () => {
    expect(EMERGENCY_COMMUNICATION_PHRASES).toHaveLength(8);
    expect(EMERGENCY_COMMUNICATION_PHRASES.map(item => item.text)).toEqual([
      '帮帮我',
      '我很痛',
      '请叫医生',
      '我害怕',
      '我不舒服',
      '请安静',
      '我要喝水',
      '我要上厕所'
    ]);
    expect(
      new Set(EMERGENCY_COMMUNICATION_PHRASES.map(item => item.id)).size
    ).toBe(8);
  });

  test('returns a five-second large-text fallback without storage dependencies', () => {
    expect(getEmergencyCommunicationPhrase('doctor')).toEqual(
      expect.objectContaining({ text: '请叫医生' })
    );
    expect(buildEmergencyCommunicationFallback('doctor')).toEqual({
      text: '请叫医生',
      ariaLabel: '紧急求助：请叫医生',
      visibleDurationMs: 5000
    });
    expect(buildEmergencyCommunicationFallback('missing')).toBeNull();
  });
});
