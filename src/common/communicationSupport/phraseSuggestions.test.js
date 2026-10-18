import { generateCommunicationCandidateSentences } from './phraseSuggestions';
import { buildExpressionLoopState } from './expressionPipeline';

describe('three local expression choices', () => {
  test.each([
    ['我', '想', '喝水'],
    ['我', '今晚', '不', '回家', '吃饭'],
    ['她', '没有', '吃药'],
    ['你', '喝', '两杯', '水'],
    ['请帮忙']
  ])(
    'retains the selected meaning in three distinct choices: %j',
    (...labels) => {
      const candidates = generateCommunicationCandidateSentences(labels);
      expect(candidates).toHaveLength(3);
      expect(new Set(candidates).size).toBe(3);
      candidates.forEach(sentence =>
        expect(sentence).toContain(labels.join(''))
      );
      expect(
        buildExpressionLoopState(labels.map(label => ({ label })))
          .candidateSentences
      ).toEqual(candidates);
    }
  );
});
