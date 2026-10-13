import { segmentChineseCommunicationText } from './segmentation';
import { matchTextToCommunicationTiles } from './symbolMatching';

const cases = [
  ['我今晚不回家吃饭', ['我', '今晚', '不', '回家', '吃饭']],
  ['我想用助行器', ['我', '想', '用', '助行器']],
  ['我的助听器没有电', ['我', '的', '助听器', '没有', '电']],
  ['洗发水不能代表洗头', ['洗发水', '不能', '代表', '洗头']],
  ['不要把洗发水当成洗头', ['不要', '把', '洗发水', '当成', '洗头']],
  ['不要把指甲油当成油', ['不要', '把', '指甲油', '当成', '油']],
  ['请找眼镜盒，不是眼镜', ['请', '找', '眼镜盒', '，', '不是', '眼镜']],
  ['只喝两口水', ['只', '喝', '两', '口', '水']],
  ['只喝一点水', ['只', '喝', '一点', '水']],
  ['你还要不要吃苹果？', ['你', '还', '要不要', '吃', '苹果', '？']],
  ['你是不是想吐？', ['你', '是不是', '想吐', '？']],
  ['你是不是害怕？', ['你', '是不是', '害怕', '？']],
  ['你是不是不舒服？', ['你', '是不是', '不舒服', '？']],
  ['可不可以喝水', ['可不可以', '喝', '水']],
  ['水温是37.5℃', ['水温', '是', '37.5', '℃']],
  // A reviewed whole request can reuse the existing help-me image.
  ['请帮我翻身', ['请帮我', '翻身']],
  ['请帮我调整靠背', ['请帮我', '调整', '靠背']],
  ['请带蓝色保温杯', ['请', '带', '蓝色', '保温杯']],
  ['我要水\n别加冰', ['我', '要', '水', '\n', '别', '加', '冰']],
  ['只要半杯温水', ['只', '要', '半', '杯', '温水']],
  ['这里痛吗？', ['这里', '痛', '吗', '？']],
  ['今天要复查。', ['今天', '要', '复查', '。']],
  ['是这个吗？', ['是', '这个', '吗', '？']],
  ['不是这个，对吗？', ['不是这个', '，', '对', '吗', '？']],
  ['我理解对了吗？', ['我', '理解', '对', '了', '吗', '？']],
  ['你要这个还是那个？', ['你', '要', '这个', '还是', '那个', '？']],
  ['有危险，先停下来。', ['有', '危险', '，', '先', '停下来', '。']],
  ['别打针', ['别', '打针']],
  ['不要不要打针', ['不要', '不要', '打针']],
  ['我想喝温开水', ['我', '想', '喝', '温开水']],
  ['别给我喝冷水', ['别', '给', '我', '喝', '冷水']],
  ['我要热水，不要冷水', ['我', '要', '热水', '，', '不要', '冷水']]
];

function bothEngines(run) {
  run();
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
  try { run(); } finally { Object.defineProperty(Intl, 'Segmenter', descriptor); }
}

// Realistic distractor catalog: a partial object/action image must not defeat
// a protected whole word, regardless of whether a whole-word picture exists.
const boards = [{ id: 'distractors', tiles: [
  '好', '听', '水', '头', '指甲', '眼镜', '你是', '不是', '小'
].map((label, index) => ({ id: `d-${index}`, label, image: '/synthetic.png' })) }];

test.each(cases)('keeps reviewed common sentence boundaries: %s', (text, expected) => {
  bothEngines(() => {
    expect(segmentChineseCommunicationText(text).segments).toEqual(expected);
    const result = matchTextToCommunicationTiles(text, boards);
    expect(result.segmentation.segments).toEqual(expected);
    expect(result.matches.map(item => item.token).join('')).toBe(text);
    expect(result.matches[result.matches.length - 1].sourceSpan.end).toBe(Array.from(text).length);
  });
});

test.each(['助行器', '助听器', '洗发水', '指甲油', '眼镜盒', '保温杯', '是不是', '要不要', '可不可以'])('does not substitute an embedded concept for %s', word => {
  bothEngines(() => {
    const missing = matchTextToCommunicationTiles(word, boards);
    expect(missing.matches).toHaveLength(1);
    expect(missing.matches[0].tile).toBeNull();
    const exact = matchTextToCommunicationTiles(word, boards.concat({
      id: 'whole', tiles: [{ id: 'whole-word', label: word, image: '/whole.png' }]
    }));
    expect(exact.matches[0].tile.id).toBe('whole-word');
  });
});

test('reuses scoped person labels without hard-coding names or changing accepted boundaries', () => {
  const people = [{ id: 'personal', tiles: [
    { id: 'name-1', label: '阿澈', communicationCategory: 'people', image: '/person.png' },
    { id: 'name-2', label: '小岚', communication: { category: 'people' }, image: '/person.png' }
  ] }];
  bothEngines(() => {
    for (const [text, expected] of [
      ['我要阿澈来', ['我', '要', '阿澈', '来']],
      ['请帮我找小岚', ['请帮我', '找', '小岚']]
    ]) {
      expect(matchTextToCommunicationTiles(text, people).segmentation.segments).toEqual(expected);
      expect(matchTextToCommunicationTiles(text, boards).matches.some(m => m.tile && /^name-/.test(m.tile.id))).toBe(false);
    }
    const kept = ['请', '帮', '我', '找', '小', '岚'];
    expect(matchTextToCommunicationTiles('请帮我找小岚', people, {
      preSegmented: kept, preserveSegments: true
    }).segmentation.segments).toEqual(kept);
  });
});

test('quantity disambiguation preserves genuine saliva and conditional expressions', () => {
  expect(segmentChineseCommunicationText('只要').segments).toEqual(['只要']);
  bothEngines(() => {
    expect(segmentChineseCommunicationText('口水').segments).toEqual(['口水']);
    expect(matchTextToCommunicationTiles('口水', boards).matches[0].tile).toBeNull();
    for (const text of ['只要你来', '喝两口水', '喝3口水', '37.5℃', '去B07，不是B17', '🙂不不不\n喝水']) {
      expect(segmentChineseCommunicationText(text).segments.join('')).toBe(text);
    }
  });
});
