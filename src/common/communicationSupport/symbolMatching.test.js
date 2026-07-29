import boardsFixture from '../../api/boards.json';
import zhMessages from '../../translations/zh-CN.communication';
import { CBOARD_COMMUNICATION_EXAMPLE_PHRASES } from './cboardConceptProfiles';
import { findSafeLocalMissingTokenResolutions } from './missingTokens';
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

function withoutIntlSegmenter(run) {
  const segmenterDescriptor = Object.getOwnPropertyDescriptor(
    Intl,
    'Segmenter'
  );

  Object.defineProperty(Intl, 'Segmenter', {
    configurable: true,
    value: undefined
  });

  try {
    return run();
  } finally {
    if (segmenterDescriptor) {
      Object.defineProperty(Intl, 'Segmenter', segmenterDescriptor);
    } else {
      delete Intl.Segmenter;
    }
  }
}
describe('communication symbol matching with cboard defaults', () => {
  test('keeps reviewed default translations aligned with concept profiles', () => {
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
    const nurse = catalog.find(
      item => item.tile.labelKey === 'symbol.peopleProfession.nurse'
    );
    const therapist = catalog.find(
      item =>
        item.tile.labelKey === 'symbol.peopleProfession.speechLanguageTherapist'
    );
    const phone = catalog.find(
      item => item.tile.labelKey === 'symbol.electricalPhone.iphone'
    );
    const vomit = catalog.find(
      item =>
        item.tile.labelKey === 'symbol.healthcareMedicalConditions.toVomit'
    );
    const fork = catalog.find(
      item => item.tile.labelKey === 'symbol.foodKitchenItems.fork'
    );
    const knife = catalog.find(
      item => item.tile.labelKey === 'symbol.foodKitchenItems.knife'
    );
    const spoon = catalog.find(
      item => item.tile.labelKey === 'symbol.foodKitchenItems.spoon'
    );
    const bowl = catalog.find(
      item => item.tile.labelKey === 'symbol.foodKitchenItems.bowl'
    );

    expect(zhMessages['symbol.peopleProfession.doctor']).toBe('医生');
    expect(zhMessages['symbol.foodKitchenItems.bowl']).toBe('碗');
    expect(doctor.displayLabel).toBe('医生');
    expect(doctor.labels).toEqual(['医生']);
    expect(doctor.synonyms).toContain('大夫');
    expect(milk.displayLabel).toBe('牛奶');
    expect(appleJuice.displayLabel).toBe('苹果汁');
    expect(nurse.displayLabel).toBe('护士');
    expect(therapist.displayLabel).toBe('语言治疗师');
    expect(phone.displayLabel).toBe('手机');
    expect(vomit.displayLabel).toBe('想吐');
    expect(fork.displayLabel).toBe('叉子');
    expect(fork.synonyms).toEqual(expect.arrayContaining(['分叉', '餐叉']));
    expect(knife.displayLabel).toBe('刀');
    expect(knife.synonyms).toContain('刀具');
    expect(spoon.displayLabel).toBe('勺子');
    expect(spoon.synonyms).toContain('汤匙');
    expect(bowl.displayLabel).toBe('碗');
  });

  test('matches natural Chinese tableware words to packaged CBoard images', () => {
    const result = matchSegments(['叉子', '刀', '勺子', '碗']);

    expect(
      result.matches.map(match => match.tile && match.tile.tile.labelKey)
    ).toEqual([
      'symbol.foodKitchenItems.fork',
      'symbol.foodKitchenItems.knife',
      'symbol.foodKitchenItems.spoon',
      'symbol.foodKitchenItems.bowl'
    ]);
    expect(
      result.matches.every(
        match => match.tile && Boolean(match.tile.tile.image)
      )
    ).toBe(true);
  });

  test('safely closes stale tableware gaps when duplicate tiles share one concept', () => {
    const tokens = ['叉子', '刀', '勺子', '碗'];
    const records = tokens.map((normalizedToken, index) => ({
      id: `tableware-${index}`,
      normalizedToken,
      status: index === 1 ? 'suggested' : 'new'
    }));
    const catalog = buildCommunicationTileCatalog(boards, intl);
    const resolutions = findSafeLocalMissingTokenResolutions(records, catalog);
    const expectedTileIds = matchSegments(tokens).matches.map(
      match => match.tile && match.tile.tile.id
    );

    expect(resolutions.map(item => item.recordId)).toEqual(
      records.map(item => item.id)
    );
    expect(resolutions.map(item => item.resolvedPictogramId)).toEqual(
      expectedTileIds
    );
    expect(resolutions.every(item => item.source === 'catalog-auto')).toBe(
      true
    );
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

  test('does not expose BoardDTO navigation tiles as communication matches', () => {
    const catalog = buildCommunicationTileCatalog([
      {
        id: 'root',
        name: '首页',
        tiles: [
          {
            id: 'folder',
            label: '饮品',
            vocalization: '饮品',
            image: '/drinks.svg',
            loadBoardId: 'drinks',
            communication: {
              synonyms: [],
              excludeTokens: [],
              category: ''
            }
          },
          {
            id: 'water',
            label: '水',
            vocalization: '水',
            image: '/water.svg',
            loadBoardId: '',
            communication: {
              synonyms: [],
              excludeTokens: [],
              category: 'food'
            }
          }
        ]
      }
    ]);

    expect(catalog.map(item => item.id)).toEqual(['water']);
  });

  test('matches versioned TileDTO communication hints without Web helpers', () => {
    const dtoBoard = {
      id: 'dto-core',
      name: '跨端核心词',
      communication: {
        category: 'core'
      },
      tiles: [
        {
          id: 'dto-want',
          label: '我想要',
          image: '/want.svg',
          communication: {
            synonyms: ['想', '希望'],
            excludeTokens: [],
            category: 'actions'
          }
        }
      ]
    };
    const result = matchTextToCommunicationTiles('想', [dtoBoard], {
      preSegmented: ['想']
    });

    expect(result.matches[0]).toEqual(
      expect.objectContaining({
        matchType: 'synonym',
        tile: expect.objectContaining({
          id: 'dto-want',
          displayLabel: '我想要',
          semanticDomain: 'actions'
        })
      })
    );
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
    const subject = findMatch(result, '我');
    const want = findMatch(result, '想');
    const apple = findMatch(result, '苹果');

    expect(subject.tile.id).toBe('pi-core-i');
    expect(want.tile.tile.labelKey).toBe('cboard.symbol.iWant');
    expect(apple.tile.tile.labelKey).toBe('symbol.foodFruit.apple');
  });

  test('keeps related terms as curation data without matching them', () => {
    const dtoBoard = {
      id: 'dto-medical',
      name: '医疗',
      tiles: [
        {
          id: 'dto-doctor',
          label: '医生',
          image: '/doctor.svg',
          communication: {
            synonyms: ['大夫'],
            relatedTerms: ['医院'],
            excludeTokens: [],
            category: 'medical'
          }
        }
      ]
    };
    const catalog = buildCommunicationTileCatalog([dtoBoard]);
    const result = matchTextToCommunicationTiles('医院', [dtoBoard], {
      preSegmented: ['医院']
    });

    expect(catalog[0].tile.communication.relatedTerms).toEqual(['医院']);
    expect(catalog[0].synonyms).toEqual(['大夫']);
    expect(result.matches[0]).toEqual(
      expect.objectContaining({
        token: '医院',
        tile: null,
        matchType: 'none'
      })
    );
  });

  test('uses the curated core pronoun without collapsing the expression', () => {
    const result = matchTextToCommunicationTiles('我想喝水', boards, {
      intl
    });

    expect(result.segmentation.segments).toEqual(['我', '想', '喝', '水']);
    expect(result.matches.filter(match => !match.tile)).toEqual([]);
    expect(findMatch(result, '我').tile.id).toBe('pi-core-i');
    expect(findMatch(result, '想').tile.tile.labelKey).toBe(
      'cboard.symbol.iWant'
    );
  });

  test('keeps drink action and water object in the real segmentation path', () => {
    const result = matchTextToCommunicationTiles('想喝水', boards, { intl });

    expect(result.segmentation.segments).toEqual(['想', '喝', '水']);
    expect(findMatch(result, '想').tile.tile.labelKey).toBe(
      'cboard.symbol.iWant'
    );
    expect(findMatch(result, '喝').tile.tile.labelKey).toBe(
      'symbol.drinkType.drink'
    );
    expect(findMatch(result, '水').tile.tile.labelKey).toBe(
      'symbol.drinkType.water'
    );
  });

  test('protects high-risk receiver phrases on the WeChat fallback path', () => {
    withoutIntlSegmenter(() => {
      const unhappy = matchTextToCommunicationTiles('我不开心', boards, {
        intl
      });
      const stomachAche = matchTextToCommunicationTiles('我肚子疼', boards, {
        intl
      });
      const applePhone = matchTextToCommunicationTiles('苹果手机', boards, {
        intl
      });

      expect(unhappy.segmentation.segments).toEqual(['我', '不开心']);
      expect(findMatch(unhappy, '不开心').tile.tile.labelKey).toBe(
        'cboard.symbol.sad'
      );
      expect(stomachAche.segmentation.segments).toEqual(['我', '肚子疼']);
      expect(findMatch(stomachAche, '肚子疼').tile.tile.labelKey).toBe(
        'symbol.healthcareMedicalConditions.stomachAche'
      );
      expect(applePhone.segmentation.segments).toEqual(['苹果手机']);
      expect(findMatch(applePhone, '苹果手机').tile.tile.labelKey).toBe(
        'symbol.electricalPhone.iphone'
      );
    });
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
    expect(findMatch(result, '苹果手机').tile.tile.labelKey).toBe(
      'symbol.electricalPhone.iphone'
    );
    expect(findMatch(result, '苹果手机').tile.tile.labelKey).not.toBe(
      'symbol.foodFruit.apple'
    );
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

  test('preserves short-video media in receiver output', () => {
    const output = createCommunicationOutputFromMatches([
      {
        tile: {
          id: 'drink-video',
          displayLabel: '喝水动作',
          tile: {
            id: 'drink-video',
            label: '喝水动作',
            vocalization: '喝水',
            image: '/saved/drink-poster.jpg',
            mediaType: 'video',
            video: '/saved/drink.mp4'
          }
        }
      }
    ]);

    expect(output[0]).toEqual(
      expect.objectContaining({
        mediaType: 'video',
        video: '/saved/drink.mp4',
        image: '/saved/drink-poster.jpg'
      })
    );
  });

  test('ports supported high-risk PicInterpreter concepts without guessing missing ones', () => {
    const result = matchSegments([
      '恶心',
      '想吐',
      '护士',
      '治疗师',
      '康复师',
      '手机',
      '打电话',
      '头晕',
      '难受',
      '不舒服',
      '吃药',
      '胸口疼',
      '照护者'
    ]);

    expect(findMatch(result, '恶心').tile.tile.labelKey).toBe(
      'symbol.healthcareMedicalConditions.toVomit'
    );
    expect(findMatch(result, '想吐').tile.tile.labelKey).toBe(
      'symbol.healthcareMedicalConditions.toVomit'
    );
    expect(findMatch(result, '护士').tile.tile.labelKey).toBe(
      'symbol.peopleProfession.nurse'
    );
    expect(findMatch(result, '治疗师').tile.tile.labelKey).toBe(
      'symbol.peopleProfession.speechLanguageTherapist'
    );
    expect(findMatch(result, '康复师').tile.tile.labelKey).toBe(
      'symbol.peopleProfession.speechLanguageTherapist'
    );
    expect(findMatch(result, '手机').tile.tile.labelKey).toBe(
      'symbol.electricalPhone.iphone'
    );
    expect(findMatch(result, '吃药').tile.tile.labelKey).toBe(
      'symbol.healthcareMedicalItems.medicine'
    );

    ['难受', '不舒服'].forEach(token => {
      expect(findMatch(result, token).tile.id).toBe('pi-home-uncomfortable');
    });
    ['打电话', '头晕', '胸口疼', '照护者'].forEach(token => {
      expect(findMatch(result, token).tile).toBeNull();
    });
  });

  test.each([
    ['干呕', 'symbol.healthcareMedicalConditions.toVomit'],
    ['想呕吐', 'symbol.healthcareMedicalConditions.toVomit'],
    ['看个电视', 'cboard.symbol.toWatchTv']
  ])('matches the migrated spoken alias %s', (token, expectedLabelKey) => {
    const result = matchTextToCommunicationTiles(token, boards, { intl });

    expect(findMatch(result, token).tile.tile.labelKey).toBe(expectedLabelKey);
  });

  test.each([
    '精力不足',
    '体温高',
    '老是咳嗽',
    '头昏脑涨',
    '呼吸不顺',
    '在出血',
    '换件衣服',
    '看一本书'
  ])('preserves missing spoken concept %s without a partial guess', token => {
    const result = matchTextToCommunicationTiles(token, boards, { intl });
    const match = findMatch(result, token);

    expect(result.segmentation.segments).toEqual([token]);
    expect(match.tile).toBeNull();
    expect(match.matchType).toBe('none');
  });

  test('leaves a missing default-board concept unmatched instead of guessing', () => {
    const result = matchSegments(['头晕']);

    expect(findMatch(result, '头晕').tile).toBeNull();
  });

  test('matches curated discomfort while leaving missing actions explicit', () => {
    const result = matchSegments(['难受', '不舒服', '打电话']);

    expect(findMatch(result, '难受').tile.id).toBe('pi-home-uncomfortable');
    expect(findMatch(result, '不舒服').tile.id).toBe('pi-home-uncomfortable');
    expect(findMatch(result, '打电话').tile).toBeNull();
    expect(
      result.matches.filter(match => match.matchType === 'partial')
    ).toEqual([]);
  });
});
