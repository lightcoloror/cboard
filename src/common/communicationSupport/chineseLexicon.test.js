import { findChineseCommunicationEntry } from './chineseLexicon';

function canonical(word) {
  const entry = findChineseCommunicationEntry(word);
  return entry && entry.zh;
}

describe('Chinese communication lexicon semantic boundaries', () => {
  test('keeps want and need separate', () => {
    expect(canonical('想')).toBe('想');
    expect(canonical('希望')).toBe('想');
    expect(canonical('要')).toBe('要');
    expect(canonical('想要')).toBe('要');
    expect(canonical('需要')).toBe('要');
  });

  test('keeps specific symptoms and general discomfort separate', () => {
    expect(canonical('头疼')).toBe('头痛');
    expect(canonical('肚子痛')).toBe('肚子疼');
    expect(canonical('胸痛')).toBe('胸口疼');
    expect(canonical('难受')).toBe('难受');
    expect(canonical('不舒服')).toBe('不舒服');
  });

  test('keeps objects and actions separate', () => {
    expect(canonical('药')).toBe('药');
    expect(canonical('服药')).toBe('吃药');
    expect(canonical('手机')).toBe('手机');
    expect(canonical('通电话')).toBe('打电话');
  });

  test('does not collapse seeing a doctor into the doctor person', () => {
    expect(canonical('医生')).toBe('医生');
    expect(canonical('大夫')).toBe('医生');
    expect(canonical('看病')).toBe('医院');
  });
});
