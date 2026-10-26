import {
  generateCommunicationCandidateSentences,
  preservesExpressionMeaning,
  filterFaithfulExpressionCandidates
} from './phraseSuggestions';
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

describe('expression meaning guard', () => {
  test.each([
    [['我', '痛'], '我好痛。'],
    [['我', '痛'], '我现在很痛。'],
    [['我', '有点', '痛'], '我痛。'],
    [['我', '不', '吃药'], '我吃药。'],
    [['我', '不是', '不', '想', '吃饭'], '我不想吃饭。'],
    [['我', '今晚', '不', '回家', '吃饭'], '我不回家吃饭。'],
    [['请', '给', '我', '两杯', '水'], '请给我一杯水。'],
    [['请', '给', '我', '两杯', '水'], '请给我水。'],
    [['⟦P1⟧', '叫', '⟦P2⟧'], '⟦P2⟧叫⟦P1⟧。'],
    [['⟦P1⟧', '叫', '⟦P2⟧', '找', '⟦P1⟧'], '⟦P1⟧叫⟦P2⟧找他。'],
    [['喝水'], '我想要喝水。'],
    [['我', '痛'], '我痛，好吗？'],
    [['我', '不', '回家', '吃饭'], '我回家不吃饭。'],
    [['我', '痛'], '我痛，因为摔倒了。'],
    [['我', '痛'], '我的意思是：我现在很痛。'],
    [['明早', '七点半', '吃饭'], '明早七点吃饭。'],
    [['没有', '发烧'], '有发烧。'],
    [['你', '回家', '吗'], '你回家。'],
    [['热一下', '水'], '水太热。'],
    [['饭后', '吃药'], '饭前吃药。']
  ])(
    'rejects unsupported additions, omissions or reordered roles: %j / %s',
    (labels, candidate) => {
      expect(preservesExpressionMeaning(labels, candidate)).toBe(false);
    }
  );

  test.each([
    ['我', '痛'],
    ['我', '不', '吃药'],
    ['我', '不是', '不', '想', '吃饭'],
    ['明早', '七点半', '吃饭'],
    ['请帮忙'],
    ['水'],
    ['你', '回家', '吗？'],
    ['⟦P1⟧', '叫', '⟦P2⟧', '找', '⟦P1⟧'],
    ['喝水', '喝水']
  ])('keeps three local options without adding facts: %j', (...labels) => {
    const result = generateCommunicationCandidateSentences(labels);
    expect(result).toHaveLength(3);
    result.forEach(sentence =>
      expect(preservesExpressionMeaning(labels, sentence)).toBe(true)
    );
    expect(result.some(sentence => sentence.includes('好吗'))).toBe(false);
  });

  test('filters before deduplication without hiding bad alternatives behind a valid one', () => {
    expect(
      filterFaithfulExpressionCandidates(
        ['我', '痛'],
        [
          '我好痛。',
          '我痛。',
          '我痛',
          '我的意思是：我痛。',
          null,
          { sentence: '我痛' }
        ]
      )
    ).toEqual(['我痛。', '我的意思是：我痛。']);
  });
});
