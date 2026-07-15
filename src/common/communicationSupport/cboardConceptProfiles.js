const CBOARD_COMMUNICATION_CONCEPT_PROFILES = {
  'cboard.symbol.iWant': {
    label: '想',
    synonyms: ['我想', '希望'],
    excludeTokens: [],
    category: 'actions'
  },
  'cboard.symbol.iNeed': {
    label: '要',
    synonyms: ['需要', '想要', '我需要'],
    excludeTokens: [],
    category: 'actions'
  },
  'cboard.symbol.imHungry': {
    label: '饿',
    synonyms: ['我饿了', '肚子饿', '饥饿'],
    excludeTokens: [],
    category: 'emotions'
  },
  'cboard.symbol.imThirsty': {
    label: '渴',
    synonyms: ['我渴了', '口渴'],
    excludeTokens: [],
    category: 'emotions'
  },
  'cboard.symbol.happy': {
    label: '开心',
    synonyms: ['高兴', '快乐', '愉快'],
    excludeTokens: ['开心果'],
    category: 'emotions'
  },
  'cboard.symbol.sad': {
    label: '伤心',
    synonyms: ['难过', '不开心', '悲伤'],
    excludeTokens: [],
    category: 'emotions'
  },
  'cboard.symbol.iHavePainIn': {
    label: '痛',
    synonyms: ['疼', '疼痛'],
    excludeTokens: [],
    category: 'medical'
  },
  'symbol.drinkType.drink': {
    label: '喝',
    synonyms: ['饮'],
    excludeTokens: [],
    category: 'actions'
  },
  'symbol.drinkType.water': {
    label: '水',
    synonyms: ['饮水', '喝水', '杯水'],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.milk': {
    label: '牛奶',
    synonyms: ['奶'],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.tea': {
    label: '茶',
    synonyms: ['喝茶'],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.coffee': {
    label: '咖啡',
    synonyms: [],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.appleJuice': {
    label: '苹果汁',
    synonyms: ['苹果果汁'],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.orangeJuice': {
    label: '橙汁',
    synonyms: ['橙子汁'],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.grapeJuice': {
    label: '葡萄汁',
    synonyms: [],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.pineappleJuice': {
    label: '菠萝汁',
    synonyms: ['凤梨汁'],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.drinkType.cranberryJuice': {
    label: '蔓越莓汁',
    synonyms: ['红莓汁'],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.foodFruit.apple': {
    label: '苹果',
    synonyms: [],
    excludeTokens: ['苹果手机', 'iPhone'],
    category: 'food'
  },
  'symbol.foodFruit.banana': {
    label: '香蕉',
    synonyms: [],
    excludeTokens: [],
    category: 'food'
  },
  'symbol.healthcareMedicalConditions.headache': {
    label: '头痛',
    synonyms: ['头疼'],
    excludeTokens: [],
    category: 'medical'
  },
  'symbol.healthcareMedicalConditions.stomachAche': {
    label: '肚子疼',
    synonyms: ['肚子痛', '胃痛'],
    excludeTokens: [],
    category: 'medical'
  },
  'symbol.healthcareMedicalItems.medicine': {
    label: '药',
    synonyms: ['药物'],
    excludeTokens: [],
    category: 'medical'
  },
  'symbol.peopleProfession.doctor': {
    label: '医生',
    synonyms: ['大夫'],
    excludeTokens: [],
    category: 'medical'
  }
};

export const CBOARD_COMMUNICATION_EXAMPLE_PHRASES = [
  '想喝水',
  '要喝牛奶',
  '想要苹果',
  '头疼',
  '开心',
  '渴'
];

export function getCboardCommunicationConceptProfile(labelKey) {
  return CBOARD_COMMUNICATION_CONCEPT_PROFILES[labelKey] || null;
}

export { CBOARD_COMMUNICATION_CONCEPT_PROFILES };
