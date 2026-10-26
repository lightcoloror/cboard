import {
  CHINESE_COMMUNICATION_LEXICON,
  getChineseCommunicationSegmentationTerms
} from './chineseLexicon';
import {
  getReviewedSourceSegments,
  getReviewedArasaacSegmentationTerms
} from './reviewedArasaac';

const SPLIT_COMPOUNDS = {
  // Negation and intention stay ordered, like 不 / 想 / 吃药 versus
  // 想 / 不 / 吃药. Prohibitive 不要 and copular 不是 remain lexical units.
  不想: ['不', '想'],
  不喝: ['不', '喝'],
  不吃: ['不', '吃'],
  不去: ['不', '去'],
  只喝: ['只', '喝'],
  请帮: ['请', '帮'],
  请带: ['请', '带'],
  别加: ['别', '加'],
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
  冷不冷: ['冷', '不', '冷'],
  热不热: ['热', '不', '热'],
  家里人: ['家里人'],
  痛不痛: ['痛', '不', '痛'],
  不痛: ['不', '痛'],
  喝水: ['喝', '水'],
  饮水: ['饮', '水'],
  喝茶: ['喝', '茶']
};

const MERGE_PAIRS = {
  '睡+觉': '睡觉',
  '起+床': '起床',
  '回+家': '回家',
  '吃+饭': '吃饭',
  '需+要': '需要',
  '休+息': '休息',
  '开+心': '开心',
  '伤+心': '伤心',
  '难+过': '难过',
  '害+怕': '害怕',
  '生+病': '生病',
  '洗+手': '洗手',
  '刷+牙': '刷牙',
  '不+要': '不要',
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
      ['今早', '明早', '昨早', '昨晚', '明晚', '今夜', '明夜'],
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

const QUESTION_TERMS = ['是不是', '要不要', '可不可以', '好不好'];

const PERSON_REFERENT_TERMS = CHINESE_COMMUNICATION_LEXICON.filter(
  entry => entry.category === 'people'
).flatMap(entry => [entry.zh, ...entry.synonyms]);

function normalizePersonalTerms(terms) {
  return Array.from(
    new Set(
      (terms || []).filter(
        term =>
          typeof term === 'string' &&
          term.length >= 2 &&
          term.length <= 64 &&
          /^[\p{L}\p{M}]+(?:[ ·•'’-][\p{L}\p{M}]+)*$/u.test(term)
      )
    )
  ).sort((left, right) => right.length - left.length);
}

// Existing personal-library names are authoritative within this call only.
// The narrow nickname fallback preserves text, not an inferred identity/photo.
// Do not turn 小苹果/小杯子/老人/阿司匹林 into names or add guessed names globally.
export function findCommunicationPersonSpans(text, personalTerms = []) {
  const source = String(text || ''),
    names = normalizePersonalTerms(personalTerms);
  const spans = [];
  for (let index = 0; index < source.length; index += 1) {
    const named = names.find(name => source.startsWith(name, index));
    let token = named;
    let extended = false;
    if (named) {
      // A registered short name is only a candidate boundary. Preserve an
      // unfamiliar continuation (张三丰 when only 张三 is registered) as text;
      // never give that longer mention the shorter person's identity.
      let end = index + named.length;
      while (
        end < source.length &&
        end < index + named.length + 2 &&
        /^[\p{L}\p{M}]$/u.test(source[end]) &&
        !BOUNDARY_CHARS.has(source[end])
      ) {
        const remainder = source.slice(end);
        if (
          SEGMENTATION_TERMS.some(term => remainder.startsWith(term)) ||
          /^(?:今天|明天|昨天|刚|又|也|还|就|说|叫|陪|来|去|在|给|把|被|和|跟|与|不|没|要|想|会|能|请|找|等|到|回|住|让|帮|比)/.test(
            remainder
          )
        )
          break;
        end += 1;
      }
      if (end > index + named.length) {
        token = source.slice(index, end);
        extended = true;
      }
    }
    if (!token) {
      const nickname = /^[小阿老][\u3400-\u9fff]/.exec(source.slice(index));
      if (!nickname) continue;
      // Ordinary age/relationship nouns need no guessed identity. Explicit
      // names from the current personal library were already handled above.
      if (
        /^(?:老人|老公|老婆|老伴|老友|阿姨|小孩|小儿|小朋友)/.test(
          source.slice(index)
        )
      )
        continue;
      const before = source.slice(0, index),
        after = source.slice(index + 2);
      const personSlot = /(?:找|叫|联系|通知|等|让|谢谢)(?:一下)?$/.test(
        before
      );
      // Negation/modality belongs to the action, not to a nickname fragment.
      // Keep the known-word exclusion below (小苹果、老人、阿司匹林).
      const followingPersonAction = /^(?:(?:还|也|都)?(?:不|没|没有|不会|不想|不愿))?(?:来|去|想|要|说|在|给|帮|陪|喝|吃|看|玩)/.test(
        after
      );
      const endOfName =
        !after ||
        /^[\s，。！？、；：,.!?;:的]/.test(after) ||
        followingPersonAction;
      const knownWord = SEGMENTATION_TERMS.some(
        term =>
          (term.length > 1 && source.startsWith(term, index)) ||
          source.startsWith(term, index + 1)
      );
      if (
        !endOfName ||
        knownWord ||
        !(
          personSlot ||
          (!before && !after) ||
          (followingPersonAction &&
            (!before || /(?:要|让|和|跟|[，。！？；,.!?;\n])$/.test(before)))
        )
      )
        continue;
      token = nickname[0];
    }
    spans.push({
      text: token,
      start: index,
      end: index + token.length,
      personal: !!named && !extended,
      ...(extended ? { privatePrefix: true } : {})
    });
    index += token.length - 1;
  }
  return spans;
}

export function hasHelpPossessiveContinuation(
  token,
  followingText,
  personalTerms = []
) {
  // "帮帮我妈妈" asks for help for my mother, not a standalone help-me
  // request followed by mother. Likewise 谢谢你妈妈 thanks your mother.
  // Reuse people vocabulary and scoped names for both expressions.
  return (
    ['帮我', '请帮我', '帮帮我', '请帮帮我', '谢谢你', '谢谢您'].includes(
      token
    ) &&
    (followingText.startsWith('的') ||
      PERSON_REFERENT_TERMS.concat(personalTerms).some(term =>
        followingText.startsWith(term)
      ))
  );
}

// Shared by segmentation and the catalog merge pass so an available phrase
// picture cannot undo these grammatical boundaries. Reviewed lexical units
// (一个人, 三点) take precedence over the quantity rule below.
export function splitCommunicationGrammarPair(token) {
  const pair =
    /^([我你他她它])([是])$/.exec(token) ||
    /^(再)(来)$/.exec(token) ||
    /^([零〇一二三四五六七八九十百千万两\d]+)([个次杯碗片粒张件本瓶遍])$/.exec(
      token
    );
  return pair ? pair.slice(1) : null;
}

const CLOCK_HOUR =
  '(?:2[0-3]|1?[0-9]|二十[一二三]?|十[一二三四五六七八九]?|[零〇一二两三四五六七八九])';
const CLOCK_MINUTE =
  '(?:[0-5]?[0-9]|[零〇][一二三四五六七八九]|[一二三四五]?十[一二三四五六七八九]?|[零〇一二三四五六七八九])';
const EXPLICIT_CLOCK = new RegExp(
  '^' +
    CLOCK_HOUR +
    '(?:[:：][0-5][0-9]|点(?:半|[一三]刻|' +
    CLOCK_MINUTE +
    '分|钟))'
);
const BARE_CLOCK = new RegExp(
  '^' + CLOCK_HOUR + '点(?![半一二三四五六七八九十0-9])'
);

function findSegmentationTerm(text, index, personalTerms) {
  const personal = personalTerms.find(term => text.startsWith(term, index));
  if (personal) return personal;
  // Protect clock units before the generic number/word scan. A bare 一点
  // remains ambiguous (一点水/有一点热); only explicit clock suffixes or
  // a preceding time cue qualify it. Do not interpret decimals as clocks.
  const tail = text.slice(index);
  const clock = EXPLICIT_CLOCK.exec(tail);
  if (
    clock &&
    !/[0-9零〇一二三四五六七八九十.：:]$/.test(text.slice(0, index)) &&
    !/^[0-9零〇一二三四五六七八九十]/.test(tail.slice(clock[0].length))
  )
    return clock[0];
  const clockCue = /(?:今早|明早|昨早|今晚|明晚|昨晚|今天|明天|昨天|早上|上午|中午|下午|晚上|凌晨|早晨|早|晚|从|到|在)$/.test(
    text.slice(0, index)
  );
  const bareClock = clockCue && BARE_CLOCK.exec(tail);
  if (bareClock) return bareClock[0];
  // Numbers are a unit on both engines, including a decimal point. Keep
  // alphanumeric identifiers such as A12/B07 intact as before.
  const numberOrId = /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*/.exec(
    text.slice(index)
  );
  if (numberOrId) return numberOrId[0];
  // A measure word in 两口水 is not the noun 口水 (saliva). Do not change
  // genuine 口水 elsewhere, nor conditional 只要 outside a quantity phrase.
  if (
    text.startsWith('口水', index) &&
    /[一二三四五六七八九十百两几数\d]$/.test(text.slice(0, index))
  )
    return '口';
  if (
    text.startsWith('只要', index) &&
    /^[半一二三四五六七八九十百两几数\d]/.test(text.slice(index + 2))
  )
    return '只';
  for (
    let termIndex = 0;
    termIndex < SEGMENTATION_TERMS.length;
    termIndex += 1
  ) {
    const term = SEGMENTATION_TERMS[termIndex];
    if (text.startsWith(term, index)) {
      if (
        hasHelpPossessiveContinuation(
          term,
          text.slice(index + term.length),
          personalTerms
        )
      )
        continue;
      // A grammatical chunk such as 我看/请帮/我想 must not consume the
      // first character of a protected concept such as 看电视/帮忙/想吐.
      // Only single-character grammatical tails participate. Reuse the same
      // vocabulary rather than adding an engine-specific merge after lookup.
      if (
        Object.prototype.hasOwnProperty.call(SPLIT_COMPOUNDS, term) &&
        SPLIT_COMPOUNDS[term].length > 1 &&
        SPLIT_COMPOUNDS[term][SPLIT_COMPOUNDS[term].length - 1].length === 1 &&
        SEGMENTATION_TERMS.some(
          action =>
            action.length > 1 &&
            !Object.prototype.hasOwnProperty.call(SPLIT_COMPOUNDS, action) &&
            text.startsWith(action, index + term.length - 1)
        )
      )
        return term.slice(0, -1);
      // Do not consume 你是/还要 when the next character starts 是不是/要不要.
      // Repeated refusals such as 不要不要/不是不是 are not questions.
      const cutsQuestion =
        !/^[不没别勿莫未]/.test(term) &&
        QUESTION_TERMS.some(question => {
          for (let offset = 1; offset < term.length; offset += 1) {
            if (
              text.startsWith(question, index + offset) &&
              index + offset + question.length > index + term.length
            )
              return true;
          }
          return false;
        });
      if (cutsQuestion) continue;
      return term;
    }
  }

  const quantity = /^[零〇一二三四五六七八九十百千万两]+[个次杯碗片粒张件本瓶遍]/.exec(
    text.slice(index)
  );
  if (quantity) return quantity[0];

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
  tokens.push.apply(
    tokens,
    segmentUnknownRun(chunk.slice(cursor), intlSegmenter)
  );

  return tokens.reduce((result, token) => {
    // Narrow grammatical pairs, not a general negation-prefix splitter:
    // keep words such as 别墅/不同 and curated 不要 intact. Each source
    // slice still goes through normal matching, including explicit unmatched.
    const pair =
      /^([我你他她它])([还也都又才只就再不没])$/.exec(token) ||
      /^([别勿莫])([给让帮碰拿推拉动走])$/.exec(token);
    result.push.apply(result, pair ? pair.slice(1) : [token]);
    return result;
  }, []);
}

function segmentWithCommunicationTerms(text, intlSegmenter, personalTerms) {
  const raw = [];
  let index = 0;

  while (index < text.length) {
    if (BOUNDARY_CHARS.has(text[index])) {
      raw.push(text[index]);
      index += 1;
      continue;
    }

    const knownTerm = findSegmentationTerm(text, index, personalTerms);
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
      !findSegmentationTerm(text, index, personalTerms)
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

export function segmentChineseCommunicationText(text, options = {}) {
  const cleaned = String(text || '');

  if (!cleaned) {
    return { segments: [], engine: 'intl-segmenter' };
  }

  const intlSegmenter = createIntlSegmenter();
  // Caller-scoped person names, never cached globally across families.
  const personalTerms = normalizePersonalTerms([
    ...(options.personalTerms || []),
    ...findCommunicationPersonSpans(cleaned, options.personalTerms).map(
      span => span.text
    )
  ]);
  const raw = segmentWithCommunicationTerms(
    cleaned,
    intlSegmenter,
    personalTerms
  );
  const engine = intlSegmenter ? 'intl-segmenter' : 'char-split';
  const split = [];
  raw.forEach(word => {
    if (personalTerms.includes(word)) {
      split.push(word);
      return;
    }
    const rewrite =
      getReviewedSourceSegments(word) ||
      (Object.prototype.hasOwnProperty.call(SPLIT_COMPOUNDS, word) &&
        SPLIT_COMPOUNDS[word]) ||
      splitCommunicationGrammarPair(word);
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
