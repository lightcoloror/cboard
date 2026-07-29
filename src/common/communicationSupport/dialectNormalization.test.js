import {
  buildDialectNormalizationRequest,
  buildLocalDialectNormalization,
  normalizeCommunicationDialect,
  normalizeDialectNormalizationResponse,
  normalizeDialectText
} from './dialectNormalization';

describe('dialect normalization contract', () => {
  test('builds a bounded Cantonese request without changing the source', () => {
    const request = buildDialectNormalizationRequest({
      text: ` 我想饮水\n${'字'.repeat(140)} `,
      dialect: 'cantonese',
      pictogramVocabulary: [
        '喝水',
        '喝水',
        ...Array.from({ length: 240 }, (_, index) => `词${index}`)
      ]
    });

    expect(request.text).toHaveLength(120);
    expect(request.dialect).toBe('cantonese');
    expect(request.pictogramVocabulary[0]).toBe('喝水');
    expect(request.pictogramVocabulary).toHaveLength(200);
  });

  test('offers only high-confidence local lexical replacements', () => {
    expect(
      buildLocalDialectNormalization('我唔舒服，想睇医生，之后食药同饮水')
    ).toEqual(
      expect.objectContaining({
        sourceText: '我唔舒服，想睇医生，之后食药同饮水',
        normalizedText: '我不舒服，想看医生，之后吃药同喝水',
        dialect: 'cantonese',
        provider: 'local-dialect-lexicon',
        sourceStored: false,
        changed: true
      })
    );
    expect(buildLocalDialectNormalization('我想休息')).toEqual(
      expect.objectContaining({ changed: false })
    );
  });

  test('rejects responses that lose source identity or privacy guarantees', () => {
    const expected = {
      sourceText: '我想饮水',
      dialect: 'cantonese'
    };
    const valid = {
      sourceText: '我想饮水',
      normalizedText: '我想喝水',
      dialect: 'cantonese',
      provider: 'server-ai',
      sourceStored: false
    };

    expect(normalizeDialectNormalizationResponse(valid, expected)).toEqual(
      expect.objectContaining({ normalizedText: '我想喝水' })
    );
    expect(
      normalizeDialectNormalizationResponse(
        { ...valid, sourceText: '另一句话' },
        expected
      )
    ).toBeNull();
    expect(
      normalizeDialectNormalizationResponse(
        { ...valid, sourceStored: true },
        expected
      )
    ).toBeNull();
    expect(normalizeCommunicationDialect('unknown')).toBeNull();
    expect(normalizeDialectText(' 饮\u0000水\n 食饭 ')).toBe('饮水 食饭');
  });
});
