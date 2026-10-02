import { getChineseCommunicationSegmentationTerms } from './chineseLexicon';
import {
  getReviewedSourceSegments,
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
  家里人: ['家里人'],
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

const BOUNDARY_CHARS = new Set([
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

function segmentUnknownRun(chunk, intlSegmenter) {
  if (!chunk) {
    return [];
  }

  if (intlSegmenter) {
    return Array.from(intlSegmenter.segment(chunk)).map(
      segment => segment.segment
    );
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

function segmentUnknownChunk(chunk, intlSegmenter) {
  // Curated terms were already consumed before this fallback. Preserve an
  // emphatic run occurrence by occurrence instead of allowing ICU to group
  // its tail (e.g. one character followed by a two-character unknown word).
  // Ordinary two-character reduplication and known terms stay untouched.
  const repetition = /([\u3400-\u9fff])\1{2,}/g;
  const tokens = [];
  let cursor = 0;
  let match;
  while ((match = repetition.exec(chunk)) !== null) {
    tokens.push.apply(
      tokens,
      segmentUnknownRun(chunk.slice(cursor, match.index), intlSegmenter)
    );
    tokens.push.apply(tokens, Array.from(match[0]));
    cursor = match.index + match[0].length;
  }
  tokens.push.apply(tokens, segmentUnknownRun(chunk.slice(cursor), intlSegmenter));

  return tokens.reduce((result, token) => {
    // Narrow grammatical pairs, not a general negation-prefix splitter:
    // keep words such as 别墅/不同 and curated 不想/不要 intact. Each source
    // slice still goes through normal matching, including explicit unmatched.
    const pair = /^([我你他她它])([还也都又才只就再])$/.exec(token) ||
      /^([别勿莫])([给让帮碰拿推拉动走])$/.exec(token);
    result.push.apply(result, pair ? pair.slice(1) : [token]);
    return result;
  }, []);
}

function segmentWithCommunicationTerms(text, intlSegmenter) {
  const raw = [];
  let index = 0;

  while (index < text.length) {
    if (BOUNDARY_CHARS.has(text[index])) {
      raw.push(text[index]);
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
      !BOUNDARY_CHARS.has(text[index]) &&
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
  const cleaned = String(text || '');

  if (!cleaned) {
    return { segments: [], engine: 'intl-segmenter' };
  }

  const intlSegmenter = createIntlSegmenter();
  const raw = segmentWithCommunicationTerms(cleaned, intlSegmenter);
  const engine = intlSegmenter ? 'intl-segmenter' : 'char-split';
  const split = [];
  raw.forEach(word => {
    const rewrite =
      getReviewedSourceSegments(word) ||
      (Object.prototype.hasOwnProperty.call(SPLIT_COMPOUNDS, word) &&
        SPLIT_COMPOUNDS[word]);
    if (rewrite && rewrite.join('') === word) {
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
    segments: merged,
    engine
  };
}

export function parseCommunicationSegmentationInput(value) {
  const raw = String(value || '');
  // A JSON array makes literal spaces and separator characters round-trip.
  if (raw.trim().startsWith('[')) {
    try {
      const tokens = JSON.parse(raw);
      if (
        Array.isArray(tokens) &&
        tokens.every(token => typeof token === 'string' && token.length > 0)
      ) {
        return tokens;
      }
    } catch (error) {
      // Preserve the existing human-readable editing format for legacy input.
    }
  }
  // JSON string escaping protects literal delimiters in the existing slash UI.
  const tokens = [];
  const pattern = /("(?:\\.|[^"\\])*")|([^\s/|，,、]+)/g;
  let part;
  while ((part = pattern.exec(raw)) !== null) {
    let token = part[2];
    if (part[1]) {
      try {
        token = JSON.parse(part[1]);
      } catch (error) {
        token = part[1];
      }
    }
    if (typeof token === 'string' && token.length > 0) tokens.push(token);
  }
  return tokens;
}

export function formatCommunicationSegmentation(segments) {
  const tokens = (Array.isArray(segments) ? segments : [])
    .map(token => String(token || ''))
    .filter(token => token.length > 0);
  return tokens
    .map(token =>
      /[\s/|，,、"\\]/.test(token) || token.startsWith('[')
        ? JSON.stringify(token)
        : token
    )
    .join(' / ');
}
