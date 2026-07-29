import boardsFixture from '../../api/boards.json';
import zhMessages from '../../translations/zh-CN.communication';
import { matchTextToCommunicationTiles } from './symbolMatching';

const boards = boardsFixture.advanced;
const intl = {
  messages: zhMessages,
  formatMessage: ({ id }) => zhMessages[id] || id
};

const HIGH_RISK_CAREGIVER_FIXTURES = [
  {
    id: 1,
    text: '你想喝水吗？',
    expectedLabelKeys: [
      'cboard.symbol.iWant',
      'symbol.drinkType.drink',
      'symbol.drinkType.water'
    ]
  },
  {
    id: 2,
    text: '你想喝水还是喝汤？',
    expectedLabelKeys: ['cboard.symbol.iWant', 'symbol.drinkType.water'],
    preservedTokens: ['还是', '汤']
  },
  {
    id: 3,
    text: '你饿了吗？',
    expectedLabelKeys: ['cboard.symbol.imHungry']
  },
  {
    id: 4,
    text: '要不要再吃一点？',
    preservedTokens: ['要不要', '再', '吃', '一点']
  },
  {
    id: 5,
    text: '先喝水，再吃药。',
    expectedLabelKeys: [
      'symbol.drinkType.water',
      'symbol.healthcareMedicalItems.medicine'
    ],
    preservedTokens: ['先', '再']
  },
  {
    id: 6,
    text: '你还要不要吃苹果？',
    expectedLabelKeys: ['symbol.foodFruit.apple'],
    preservedTokens: ['还要', '吃']
  },
  {
    id: 7,
    text: '这杯水太热吗？',
    expectedLabelKeys: ['symbol.drinkType.water'],
    preservedTokens: ['热']
  },
  {
    id: 8,
    text: '你吃饱了吗？',
    preservedTokens: ['吃饱']
  },
  {
    id: 9,
    text: '米饭吃一点，好不好？',
    preservedTokens: ['米饭', '吃', '一点', '好不好']
  },
  {
    id: 10,
    text: '你想吃水果还是面包？',
    preservedTokens: ['想', '吃', '水果', '还是', '面包']
  },
  {
    id: 11,
    text: '你要去厕所吗？',
    preservedTokens: ['厕所']
  },
  {
    id: 12,
    text: '现在要换尿片吗？',
    preservedTokens: ['尿片']
  },
  {
    id: 13,
    text: '要不要洗澡？',
    preservedTokens: ['要不要', '洗澡']
  },
  {
    id: 14,
    text: '先刷牙再睡觉。',
    preservedTokens: ['刷牙', '睡觉']
  },
  {
    id: 15,
    text: '衣服湿了，要换衣服。',
    preservedTokens: ['湿'],
    expectedTokenCounts: {
      衣服: 2
    }
  },
  {
    id: 16,
    text: '你要洗脸吗？',
    preservedTokens: ['洗脸']
  },
  {
    id: 17,
    text: '你现在痛不痛？',
    expectedLabelKeys: ['cboard.symbol.iHavePainIn']
  },
  {
    id: 18,
    text: '是头痛还是肚子痛？',
    expectedLabelKeys: [
      'symbol.healthcareMedicalConditions.headache',
      'symbol.healthcareMedicalConditions.stomachAche'
    ]
  },
  {
    id: 19,
    text: '你肚子不舒服吗？',
    preservedTokens: ['肚子', '不舒服']
  },
  {
    id: 20,
    text: '左手痛还是右手痛？',
    expectedLabelKeys: [
      'symbol.healthcareBodyParts.leftHand',
      'cboard.symbol.iHavePainIn',
      'symbol.healthcareBodyParts.rightHand'
    ]
  },
  {
    id: 21,
    text: '这里痛吗？',
    expectedLabelKeys: ['cboard.symbol.iHavePainIn'],
    preservedTokens: ['这里']
  },
  {
    id: 22,
    text: '痛是一点点还是很痛？',
    expectedLabelKeys: ['cboard.symbol.iHavePainIn'],
    preservedTokens: ['一点点', '还是', '很痛']
  },
  {
    id: 23,
    text: '你是不是想吐？',
    expectedLabelKeys: ['symbol.healthcareMedicalConditions.toVomit']
  },
  {
    id: 24,
    text: '你头晕吗？',
    preservedTokens: ['头晕']
  },
  {
    id: 25,
    text: '你冷不冷？',
    preservedTokens: ['冷', '不冷']
  },
  {
    id: 26,
    text: '你热不热？',
    preservedTokens: ['热', '不热']
  },
  {
    id: 27,
    text: '现在该吃药了。',
    expectedLabelKeys: ['symbol.healthcareMedicalItems.medicine']
  },
  {
    id: 28,
    text: '等一下去医院。',
    preservedTokens: ['等一下', '医院']
  },
  {
    id: 29,
    text: '医生要给你检查。',
    expectedLabelKeys: ['symbol.peopleProfession.doctor'],
    preservedTokens: ['检查']
  },
  {
    id: 30,
    text: '护士等一下过来。',
    expectedLabelKeys: ['symbol.peopleProfession.nurse'],
    preservedTokens: ['等一下']
  },
  {
    id: 31,
    text: '今天要复查。',
    preservedTokens: ['今天', '复查']
  },
  {
    id: 32,
    text: '要不要量血压？',
    expectedLabelKeys: ['symbol.healthcareMedicalConditions.bloodPressure']
  },
  {
    id: 33,
    text: '我帮你叫护士，好吗？',
    expectedLabelKeys: ['symbol.peopleProfession.nurse'],
    preservedTokens: ['我', '帮你', '叫']
  },
  {
    id: 34,
    text: '要不要叫医生？',
    expectedTileIds: ['pi-home-call-doctor']
  },
  {
    id: 35,
    text: '你要睡觉了吗？',
    preservedTokens: ['睡觉']
  },
  {
    id: 36,
    text: '先休息一下。',
    preservedTokens: ['休息']
  },
  {
    id: 37,
    text: '你累了吗？',
    preservedTokens: ['累']
  },
  {
    id: 38,
    text: '灯关掉，好不好？',
    preservedTokens: ['灯', '关掉', '好不好']
  },
  {
    id: 39,
    text: '要不要坐起来？',
    preservedTokens: ['要不要', '坐起来']
  },
  {
    id: 40,
    text: '要不要躺下？',
    preservedTokens: ['要不要', '躺下']
  },
  {
    id: 41,
    text: '枕头高一点吗？',
    preservedTokens: ['枕头', '高', '一点']
  },
  {
    id: 42,
    text: '被子要不要盖上？',
    preservedTokens: ['被子', '要不要', '盖上']
  },
  {
    id: 43,
    text: '我们等一下出门。',
    preservedTokens: ['我们', '等一下', '出门']
  },
  {
    id: 44,
    text: '今晚不回家吃饭。',
    preservedTokens: ['今晚', '不回家', '吃', '饭']
  },
  {
    id: 45,
    text: '明天去动物园玩。',
    preservedTokens: ['明天', '去', '动物园', '玩']
  },
  {
    id: 46,
    text: '现在回家。',
    preservedTokens: ['现在', '回家']
  },
  {
    id: 47,
    text: '要坐车还是走路？',
    preservedTokens: ['坐车', '还是', '走路']
  },
  {
    id: 48,
    text: '等一下去公园。',
    preservedTokens: ['等一下', '去', '公园']
  },
  {
    id: 49,
    text: '你开心吗？',
    expectedLabelKeys: ['cboard.symbol.happy']
  },
  {
    id: 50,
    text: '你是不是害怕？',
    preservedTokens: ['害怕']
  },
  {
    id: 51,
    text: '你生气了吗？',
    preservedTokens: ['生气']
  },
  {
    id: 52,
    text: '你是不是不舒服？',
    preservedTokens: ['不舒服']
  },
  {
    id: 53,
    text: '你想一个人安静一下吗？',
    preservedTokens: ['想', '一个人', '安静']
  },
  {
    id: 54,
    text: '你想见家人吗？',
    preservedTokens: ['想', '见', '家人']
  },
  {
    id: 55,
    text: '是这个吗？',
    preservedTokens: ['这个']
  },
  {
    id: 56,
    text: '不是这个，对吗？',
    preservedTokens: ['不是', '这个', '对']
  },
  {
    id: 57,
    text: '我理解对了吗？',
    preservedTokens: ['理解', '对']
  },
  {
    id: 58,
    text: '你是想喝水吗？',
    expectedLabelKeys: ['cboard.symbol.iWant', 'symbol.drinkType.water']
  },
  {
    id: 59,
    text: '你是想出去吗？',
    preservedTokens: ['想', '出去']
  },
  {
    id: 60,
    text: '你要这个还是那个？',
    preservedTokens: ['要', '这个', '还是', '那个']
  },
  {
    id: 61,
    text: '现在吃饭。',
    preservedTokens: ['现在', '吃', '饭']
  },
  {
    id: 62,
    text: '等一下洗澡。',
    preservedTokens: ['等一下', '洗澡']
  },
  {
    id: 63,
    text: '明天去医院。',
    preservedTokens: ['明天', '去', '医院']
  },
  {
    id: 64,
    text: '今天不用出门。',
    preservedTokens: ['今天', '不用', '出门']
  },
  {
    id: 65,
    text: '晚上再看电视。',
    preservedTokens: ['晚上', '再', '看电视']
  },
  {
    id: 66,
    text: '吃完饭再睡觉。',
    preservedTokens: ['吃完饭', '再', '睡觉']
  },
  {
    id: 67,
    text: '要不要打电话给妈妈？',
    preservedTokens: ['要不要', '打电话', '妈妈']
  },
  {
    id: 68,
    text: '爸爸等一下来看你。',
    preservedTokens: ['爸爸', '等一下', '来', '看你']
  },
  {
    id: 69,
    text: '谁来看你？',
    preservedTokens: ['谁', '来', '看你']
  },
  {
    id: 70,
    text: '你想找谁？',
    preservedTokens: ['想', '找', '谁']
  },
  {
    id: 71,
    text: '要不要视频通话？',
    preservedTokens: ['要不要', '视频通话']
  },
  {
    id: 72,
    text: '要不要给家里人发消息？',
    preservedTokens: ['要不要', '家人', '发消息']
  },
  {
    id: 73,
    text: '要不要看电视？',
    preservedTokens: ['要不要', '看电视']
  },
  {
    id: 74,
    text: '要不要听音乐？',
    preservedTokens: ['要不要', '听音乐']
  },
  {
    id: 75,
    text: '要不要出去走走？',
    preservedTokens: ['要不要', '出去', '走走']
  },
  {
    id: 76,
    text: '你想玩玩具吗？',
    preservedTokens: ['想', '玩', '玩具']
  },
  {
    id: 77,
    text: '要不要画画？',
    preservedTokens: ['要不要', '画画']
  },
  {
    id: 78,
    text: '你想看照片吗？',
    preservedTokens: ['想', '看', '照片']
  },
  {
    id: 79,
    text: '不要动，等一下。',
    preservedTokens: ['不要', '等一下']
  },
  {
    id: 80,
    text: '有危险，先停下来。',
    preservedTokens: ['危险', '停下来']
  }
];

describe('evidence-tagged caregiver receiver fixtures', () => {
  test.each(HIGH_RISK_CAREGIVER_FIXTURES)(
    'keeps fixture $id medically safe',
    ({
      text,
      expectedLabelKeys = [],
      expectedTileIds = [],
      preservedTokens = [],
      expectedTokenCounts = {}
    }) => {
      const result = matchTextToCommunicationTiles(text, boards, { intl });
      const labelKeys = result.matches
        .filter(match => match.tile)
        .map(match => match.tile.tile.labelKey);
      const tileIds = result.matches
        .filter(match => match.tile)
        .map(match => match.tile.id);

      expectedLabelKeys.forEach(labelKey => {
        expect(labelKeys).toContain(labelKey);
      });
      expectedTileIds.forEach(tileId => {
        expect(tileIds).toContain(tileId);
      });
      preservedTokens.forEach(token => {
        expect(result.segmentation.segments).toContain(token);
      });
      Object.entries(expectedTokenCounts).forEach(([token, expectedCount]) => {
        expect(
          result.segmentation.segments.filter(segment => segment === token)
        ).toHaveLength(expectedCount);
      });
      expect(
        result.matches
          .filter(match => match.matchType === 'partial')
          .map(match => ({
            token: match.token,
            labelKey: match.tile && match.tile.tile.labelKey,
            label: match.tile && match.tile.displayLabel
          }))
      ).toEqual([]);
    }
  );
});
