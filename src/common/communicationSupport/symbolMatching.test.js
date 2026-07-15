import boardsFixture from '../../api/boards.json';
import zhMessages from '../../translations/zh-CN.json';
import { CBOARD_COMMUNICATION_EXAMPLE_PHRASES } from './cboardConceptProfiles';
import {
  buildCommunicationTileCatalog,
  createCommunicationOutputFromMatches,
  matchTextToCommunicationTiles
} from './symbolMatching';

const boards = boardsFixture.advanced;
const intl = {
  messages: zhMessages,
  formatMessage: ({ id }) => zhMessages[id] || id
};

function matchSegments(segments) {
  return matchTextToCommunicationTiles(segments.join(''), boards, {
    intl,
    preSegmented: segments
  });
}

function findMatch(result, token) {
  return result.matches.find(item => item.token === token);
}

describe('communication symbol matching with cboard defaults', () => {
  test('calibrates known default translation errors without changing source boards', () => {
    const catalog = buildCommunicationTileCatalog(boards, intl);
    const doctor = catalog.find(
      item => item.tile.labelKey === 'symbol.peopleProfession.doctor'
    );
    const milk = catalog.find(
      item => item.tile.labelKey === 'symbol.drinkType.milk'
    );
    const appleJuice = catalog.find(
      item => item.tile.labelKey === 'symbol.drinkType.appleJuice'
    );

    expect(zhMessages['symbol.peopleProfession.doctor']).toBe('法师');
    expect(doctor.displayLabel).toBe('医生');
    expect(doctor.labels).toEqual(['医生']);
    expect(doctor.synonyms).toContain('大夫');
    expect(milk.displayLabel).toBe('牛奶');
    expect(appleJuice.displayLabel).toBe('苹果汁');
  });

  test('keeps an explicit user label ahead of the default concept profile', () => {
    const catalog = buildCommunicationTileCatalog(
      [
        {
          id: 'custom',
          name: '自定义',
          tiles: [
            {
              id: 'custom-doctor',
              labelKey: 'symbol.peopleProfession.doctor',
              label: '我的医生',
              image: '/doctor.svg'
            }
          ]
        }
      ],
      intl
    );

    expect(catalog[0].displayLabel).toBe('我的医生');
    expect(catalog[0].labels).toContain('我的医生');
    expect(catalog[0].synonyms).not.toContain('大夫');
  });

  test('matches the reported want-eat-apple phrase to fruit instead of apple juice', () => {
    const result = matchSegments(['我', '想', '吃', '苹果']);
    const want = findMatch(result, '想');
    const apple = findMatch(result, '苹果');

    expect(want.tile.tile.labelKey).toBe('cboard.symbol.iWant');
    expect(want.tile.displayLabel).toBe('想');
    expect(apple.tile.tile.labelKey).toBe('symbol.foodFruit.apple');
    expect(apple.tile.tile.labelKey).not.toBe('symbol.drinkType.appleJuice');
  });

  test('matches the reported phrase through the real segmentation path', () => {
    const result = matchTextToCommunicationTiles('我想吃苹果', boards, {
      intl
    });
    const want = findMatch(result, '想');
    const apple = findMatch(result, '苹果');

    expect(want.tile.tile.labelKey).toBe('cboard.symbol.iWant');
    expect(apple.tile.tile.labelKey).toBe('symbol.foodFruit.apple');
  });

  test('keeps every receiver example covered by the default boards', () => {
    CBOARD_COMMUNICATION_EXAMPLE_PHRASES.forEach(phrase => {
      const result = matchTextToCommunicationTiles(phrase, boards, { intl });
      const unmatched = result.matches
        .filter(match => !match.tile)
        .map(match => match.token);

      expect({ phrase, unmatched }).toEqual({ phrase, unmatched: [] });
    });
  });

  test('keeps want, need, and drink as separate concepts', () => {
    const result = matchSegments(['想', '要', '喝', '水']);

    expect(findMatch(result, '想').tile.tile.labelKey).toBe(
      'cboard.symbol.iWant'
    );
    expect(findMatch(result, '要').tile.tile.labelKey).toBe(
      'cboard.symbol.iNeed'
    );
    expect(findMatch(result, '喝').tile.tile.labelKey).toBe(
      'symbol.drinkType.drink'
    );
    expect(findMatch(result, '水').tile.tile.labelKey).toBe(
      'symbol.drinkType.water'
    );
  });

  test('uses the sad concept for negated happiness', () => {
    const result = matchSegments(['不开心']);
    const match = findMatch(result, '不开心');

    expect(match.tile.tile.labelKey).toBe('cboard.symbol.sad');
    expect(match.tile.tile.labelKey).not.toBe('cboard.symbol.happy');
  });

  test('hard-blocks risky partial matches', () => {
    const result = matchSegments(['开心果', '苹果手机']);

    expect(findMatch(result, '开心果').tile).toBeNull();
    expect(findMatch(result, '苹果手机').tile).toBeNull();
  });

  test('prefers specific medical concepts over generic pain', () => {
    const result = matchSegments(['头疼', '肚子疼']);

    expect(findMatch(result, '头疼').tile.tile.labelKey).toBe(
      'symbol.healthcareMedicalConditions.headache'
    );
    expect(findMatch(result, '肚子疼').tile.tile.labelKey).toBe(
      'symbol.healthcareMedicalConditions.stomachAche'
    );
  });

  test('uses calibrated labels in receiver output and speech', () => {
    const result = matchSegments(['医生']);
    const output = createCommunicationOutputFromMatches(result.matches);

    expect(output).toEqual([
      expect.objectContaining({
        label: '医生',
        vocalization: '医生'
      })
    ]);
  });

  test('leaves a missing default-board concept unmatched instead of guessing', () => {
    const result = matchSegments(['头晕']);

    expect(findMatch(result, '头晕').tile).toBeNull();
  });

  test('does not collapse missing actions and discomfort into available objects', () => {
    const result = matchSegments(['难受', '不舒服', '吃药', '打电话']);

    result.matches.forEach(match => {
      expect(match.tile).toBeNull();
    });
  });
});
