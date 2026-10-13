import { segmentChineseCommunicationText } from './segmentation';
import { buildCommunicationTileCatalog, matchTextToCommunicationTiles } from './symbolMatching';
import { buildReceiverLoopState, buildReceiverHistoryEntry, retainReceiverReviewItemAsText, restoreReceiverLoopState } from './receiverPipeline';
import { findSafeLocalMissingTokenResolutions } from './missingTokens';

const cases = [
  ['你是想喝水吗？', ['你', '是', '想', '喝', '水', '吗', '？']],
  ['你是想出去吗？', ['你', '是', '想', '出去', '吗', '？']],
  ['我是医生', ['我', '是', '医生']],
  ['她是护士', ['她', '是', '护士']],
  ['他是家里人', ['他', '是', '家里人']],
  ['今天吃了三次药', ['今天', '吃', '了', '三', '次', '药']],
  ['我想换一个枕头', ['我', '想', '换', '一', '个', '枕头']],
  ['后天早上八点再来', ['后天', '早上', '八', '点', '再', '来']],
  ['二十三次', ['二十三', '次']],
  ['十二个', ['十二', '个']],
  ['12次', ['12', '次']],
  ['两杯水', ['两', '杯', '水']],
  ['三片药', ['三', '片', '药']],
  ['两碗饭', ['两', '碗', '饭']],
  ['二十一本', ['二十一', '本']],
  ['一个人', ['一个人']],
  ['三点', ['三点']],
  ['你是不是想吐？', ['你', '是不是', '想吐', '？']],
  ['不要不要吃饭', ['不要', '不要', '吃饭']],
  ['我今晚不回家吃饭', ['我', '今晚', '不', '回家', '吃饭']]
];

function bothEngines(run) {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    run();
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
    run();
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
    else delete Intl.Segmenter;
  }
}

const distractors = [{ id: 'phrases', tiles: ['你是', '我是', '她是', '他是', '三次', '一个', '再来', '二十三次', '十二个', '12次', '两杯', '三片', '两碗', '二十一本'].map((label, index) => ({ id: `phrase-${index}`, label, image: '/synthetic.png' })) }];

test.each(cases)('same boundaries survive the image matching stage: %s', (text, expected) => {
  bothEngines(() => {
    expect(segmentChineseCommunicationText(text).segments).toEqual(expected);
    expect(matchTextToCommunicationTiles(text, distractors).segmentation.segments).toEqual(expected);
    const accepted = [text];
    expect(matchTextToCommunicationTiles(text, distractors, { preSegmented: accepted, preserveSegments: true }).segmentation.segments).toEqual(accepted);
  });
});

test.each(['阿澈', '欧阳小岚', '阿卜杜拉·阿里'])('person names follow only the currently supplied personal library: %s', name => {
  const library = image => [{ id: 'people', tiles: [{ id: 'person', label: name, communicationCategory: 'people', image }] }];
  bothEngines(() => {
    const text = `请找${name}`;
    for (const image of ['/family-a.png', '/family-b.png']) {
      const result = matchTextToCommunicationTiles(text, library(image));
      expect(result.segmentation.segments).toEqual(['请', '找', name]);
      expect(result.matches[2].tile.tile.image).toBe(image);
    }
    expect(matchTextToCommunicationTiles(text, []).matches.every(item => !item.tile)).toBe(true);
    const renamed = [{ id: 'people', tiles: [{ id: 'person', label: '新名字', communicationCategory: 'people', image: '/new.png' }] }];
    expect(matchTextToCommunicationTiles(text, renamed).matches.every(item => !item.tile)).toBe(true);
  });
});

test.each(['助行器', '眼镜盒', '二十三次', '你是想喝水吗？'])('explicit text survives persistence and is not silently replaced when images arrive: %s', text => {
  bothEngines(() => {
    let id = 0;
    const state = buildReceiverLoopState(text, [], { createId: () => `review-${id++}` });
    expect(state.reviewItems.some(item => !item.tile)).toBe(true);
    let review = state.reviewItems;
    review.filter(item => !item.tile).forEach(item => { review = retainReceiverReviewItemAsText(review, item.id); });
    const entry = JSON.parse(JSON.stringify(buildReceiverHistoryEntry(text, review)));
    const added = [{ id: 'new', tiles: review.map((item, i) => ({ id: `image-${i}`, label: item.token, image: '/new.png' })) }];
    for (const library of [[], added]) {
      const restored = restoreReceiverLoopState(entry, library);
      expect(restored.reviewItems.every(item => item.tile.textOnly)).toBe(true);
      expect(restored.outputPreview.map(item => item.vocalization).join('')).toBe(text);
      expect(restored.reviewItems.map(item => item.sourceSpan)).toEqual(state.reviewItems.map(item => item.sourceSpan));
    }
  });
});

test('missing image resolution requires an unambiguous whole concept with an image', () => {
  const record = [{ id: 'missing', normalizedToken: '眼镜盒', status: 'new' }];
  const catalog = tiles => buildCommunicationTileCatalog([{ id: 'local', tiles }]);
  const exact = { id: 'box', label: '眼镜盒', image: '/box.png' };
  expect(findSafeLocalMissingTokenResolutions(record, catalog([{ id: 'glasses', label: '眼镜', image: '/glasses.png' }]))).toEqual([]);
  expect(findSafeLocalMissingTokenResolutions(record, catalog([{ ...exact, image: undefined }]))).toEqual([]);
  expect(findSafeLocalMissingTokenResolutions(record, catalog([exact, { ...exact, id: 'second' }]))).toEqual([]);
  expect(findSafeLocalMissingTokenResolutions(record, catalog([exact]))).toHaveLength(1);
});
