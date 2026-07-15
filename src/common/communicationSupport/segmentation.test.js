import { segmentChineseCommunicationText } from './segmentation';

describe('Chinese communication segmentation', () => {
  test.each([
    ['想吃苹果', ['想', '吃']],
    ['要吃苹果', ['要', '吃']],
    ['要喝牛奶', ['要', '喝']]
  ])('splits modal and action words in %s', (input, expectedWords) => {
    const result = segmentChineseCommunicationText(input);

    expectedWords.forEach(word => {
      expect(result.segments).toContain(word);
    });
  });

  test.each(['不要', '不想', '不去', '不吃', '不喝'])(
    'keeps the negated concept %s intact when Intl supports it',
    input => {
      const result = segmentChineseCommunicationText(input);

      if (result.engine === 'intl-segmenter') {
        expect(result.segments).toContain(input);
      }
    }
  );
});
