import {
  PATIENT_ACTION_IDS,
  getPatientActionDefinition,
  getPatientActionDefinitions
} from './patientActionLanguage';

describe('patient action language', () => {
  it('covers every required icon-first patient action', () => {
    expect(new Set(getPatientActionDefinitions().map(item => item.id))).toEqual(
      new Set(Object.values(PATIENT_ACTION_IDS))
    );
  });

  it('keeps visible labels short while retaining accessible meaning', () => {
    getPatientActionDefinitions().forEach(item => {
      expect(item.icon).toBeTruthy();
      expect(item.glyph).toBeTruthy();
      expect(Array.from(item.label).length).toBeGreaterThan(0);
      expect(Array.from(item.label).length).toBeLessThanOrEqual(4);
      expect(item.ariaLabel.length).toBeGreaterThan(item.label.length);
      expect(item.label).not.toMatch(/API|AI|error|storage/i);
    });
  });

  it('supports state-specific labels without mutating the shared definition', () => {
    const speaking = getPatientActionDefinition(PATIENT_ACTION_IDS.play, {
      label: '朗读中',
      ariaLabel: '正在朗读当前句子'
    });

    expect(speaking).toMatchObject({
      id: 'play',
      label: '朗读中',
      ariaLabel: '正在朗读当前句子'
    });
    expect(getPatientActionDefinition(PATIENT_ACTION_IDS.play)).toMatchObject({
      label: '朗读',
      ariaLabel: '朗读当前句子'
    });
  });

  it('rejects unknown actions instead of inventing patient controls', () => {
    expect(getPatientActionDefinition('technical-debug')).toBeNull();
  });
});
