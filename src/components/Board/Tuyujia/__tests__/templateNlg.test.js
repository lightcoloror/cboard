import { generateCandidateSentences } from '../templateNlg';

describe('template NLG', () => {
  test('returns fallback prompt when no labels are selected', () => {
    expect(generateCandidateSentences([])).toEqual(['（请先选择图片）']);
  });

  test('builds multiple candidate sentences from labels', () => {
    expect(generateCandidateSentences(['想', '喝', '水'])).toEqual([
      '想喝水。',
      '我想喝水。',
      '请想喝水。',
      '想喝水，好吗？'
    ]);
  });

  test('avoids duplicating subject when base already starts with one', () => {
    expect(generateCandidateSentences(['我', '想', '回家'])).toEqual([
      '我想回家。',
      '我想回家，好吗？'
    ]);
  });
});
