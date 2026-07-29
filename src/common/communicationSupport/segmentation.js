import { getChineseCommunicationSegmentationTerms } from './chineseLexicon';
import {
  getReviewedArasaacSegmentationRewrite,
  getReviewedArasaacSegmentationTerms
} from './reviewedArasaac';

const SPLIT_COMPOUNDS = {
  我去: ['我', '去'],
  我想: ['我', '想'],
  我要: ['我', '要'],
  我喜欢: ['我', '喜欢'],
  我吃: ['我', '吃'],
  我喝: ['我', '喝'],
  我看: ['我', '看'],
  他去: ['他', '去'],
  他想: ['他', '想'],
  他要: ['他', '要'],
  她去: ['她', '去'],
  她想: ['她', '想'],
  她要: ['她', '要'],
  你去: ['你', '去'],
  你想: ['你', '想'],
  你要: ['你', '要'],
  想吃: ['想', '吃'],
  想喝: ['想', '喝'],
  想去: ['想', '去'],
  想看: ['想', '看'],
  想玩: ['想', '玩'],
  要吃: ['要', '吃'],
  要喝: ['要', '喝'],
  要去: ['要', '去'],
  要看: ['要', '看'],
  要玩: ['要', '玩'],
  换衣服: ['换', '衣服'],
  冷不冷: ['冷', '不冷'],
  热不热: ['热', '不热'],
  家里人: ['家人'],
  痛不痛: ['痛', '不', '痛'],
  不痛: ['不', '痛'],
  喝水: ['喝', '水'],
  饮水: ['饮', '水'],
  吃饭: ['吃', '饭'],
  喝茶: ['喝', '茶']
};

const MERGE_PAIRS = {
  '睡+觉': '睡觉',
  '起+床': '起床',
  '回+家': '回家',
  '需+要': '需要',
  '休+息': '休息',
  '开+心': '开心',
  '伤+心': '伤心',
  '难+过': '难过',
  '害+怕': '害怕',
  '生+病': '生病',
  '洗+手': '洗手',
  '刷+牙': '刷牙',
  '不+想': '不想',
  '不+要': '不要',
  '不+去': '不去',
  '不+吃': '不吃',
  '不+喝': '不喝',
  '上+厕+所': '上厕所'
};

const STOP_CHARS = new Set([
  '，',
  '。',
  '？',
  '！',
  '、',
  ' ',
  '　',
  '的',
  '了',
  '吗',
  '呢',
  '啊',
  '吧'
]);

const SEGMENTATION_TERMS = Array.from(
  new Set(
    getChineseCommunicationSegmentationTerms().concat(
      getReviewedArasaacSegmentationTerms(),
      Object.keys(SPLIT_COMPOUNDS)
    )
  )
).sort((left, right) => {
  if (left.length !== right.length) {
    return right.length - left.length;
  }
  return left.localeCompare(right, 'zh-CN');
});

function createIntlSegmenter() {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return null;
  }

  try {
    return new Intl.Segmenter('zh-CN', { granularity: 'word' });
  } catch (error) {
    return null;
  }
}

function findSegmentationTerm(text, index) {
  for (
    let termIndex = 0;
    termIndex < SEGMENTATION_TERMS.length;
    termIndex += 1
  ) {
    const term = SEGMENTATION_TERMS[termIndex];
    if (text.startsWith(term, index)) {
      return term;
    }
  }

  return null;
}

function segmentUnknownChunk(chunk, intlSegmenter) {
  if (!chunk) {
    return [];
  }

  if (intlSegmenter) {
    return Array.from(intlSegmenter.segment(chunk))
      .filter(segment => segment.isWordLike)
      .map(segment => segment.segment);
  }

  const tokens = [];
  let asciiToken = '';

  Array.from(chunk).forEach(char => {
    if (/[A-Za-z0-9_-]/.test(char)) {
      asciiToken += char;
      return;
    }

    if (asciiToken) {
      tokens.push(asciiToken);
      asciiToken = '';
    }
    tokens.push(char);
  });

  if (asciiToken) {
    tokens.push(asciiToken);
  }

  return tokens;
}

function segmentWithCommunicationTerms(text, intlSegmenter) {
  const raw = [];
  let index = 0;

  while (index < text.length) {
    if (STOP_CHARS.has(text[index])) {
      index += 1;
      continue;
    }

    const knownTerm = findSegmentationTerm(text, index);
    if (knownTerm) {
      raw.push(knownTerm);
      index += knownTerm.length;
      continue;
    }

    const chunkStart = index;
    index += 1;
    while (
      index < text.length &&
      !STOP_CHARS.has(text[index]) &&
      !findSegmentationTerm(text, index)
    ) {
      index += 1;
    }

    raw.push.apply(
      raw,
      segmentUnknownChunk(text.slice(chunkStart, index), intlSegmenter)
    );
  }

  return raw;
}

export function segmentChineseCommunicationText(text) {
  const cleaned = (text || '').trim();

  if (!cleaned) {
    return { segments: [], engine: 'intl-segmenter' };
  }

  const intlSegmenter = createIntlSegmenter();
  const raw = segmentWithCommunicationTerms(cleaned, intlSegmenter);
  const engine = intlSegmenter ? 'intl-segmenter' : 'char-split';
  const split = [];
  raw.forEach(word => {
    const rewrite =
      getReviewedArasaacSegmentationRewrite(word) || SPLIT_COMPOUNDS[word];
    if (rewrite) {
      split.push.apply(split, rewrite);
      return;
    }
    split.push(word);
  });

  const merged = [];
  let index = 0;

  while (index < split.length) {
    if (index + 2 < split.length) {
      const triKey = [split[index], split[index + 1], split[index + 2]].join(
        '+'
      );
      if (MERGE_PAIRS[triKey]) {
        merged.push(MERGE_PAIRS[triKey]);
        index += 3;
        continue;
      }
    }

    if (index + 1 < split.length) {
      const biKey = [split[index], split[index + 1]].join('+');
      if (MERGE_PAIRS[biKey]) {
        merged.push(MERGE_PAIRS[biKey]);
        index += 2;
        continue;
      }
    }

    merged.push(split[index]);
    index += 1;
  }

  return {
    segments: merged.filter(word => word && !STOP_CHARS.has(word)),
    engine
  };
}

export function parseCommunicationSegmentationInput(value) {
  return String(value || '')
    .split(/[\s/|，,、]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

export function formatCommunicationSegmentation(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map(token => String(token || '').trim())
    .filter(Boolean)
    .join(' / ');
}
