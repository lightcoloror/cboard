import {
  getPictogramAttribution,
  DEVICE_PRIVATE_PICTOGRAM_PROVIDER
} from './pictogramAttribution';
import { findCommunicationPersonSpans } from './segmentation';

// Only the recorded full name identifies a private person in this release.
const RELATIVE_NAMES = /^(?:爸爸|爸|父亲|妈妈|妈|母亲|哥哥|哥|姐姐|姐|弟弟|弟|妹妹|妹|儿子|女儿|老公|老婆|丈夫|妻子|媳妇|儿媳|女婿|爷爷|奶奶|外公|外婆|公公|婆婆|姥姥|姥爷|叔叔|伯伯|舅舅|阿姨|姑姑|姨妈|孙子|孙女|外孙|外孙女)$/;
const PRONOUNS = /^(?:我|你|您|他|她|它|我们|你们|他们|她们|自己|本人)$/;

export function getPersonalPeople(catalog) {
  return (catalog || []).filter(item => {
    const attribution = getPictogramAttribution(item);
    return (
      item.semanticDomain === 'people' &&
      attribution &&
      attribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
    );
  });
}

export function getPersonalPersonTerms(catalog) {
  return Array.from(
    new Set(
      getPersonalPeople(catalog)
        .map(item => item.tile.label)
        .filter(
          term => term && !PRONOUNS.test(term) && !RELATIVE_NAMES.test(term)
        )
    )
  );
}

export function isPrivatePerson(item) {
  const attribution = getPictogramAttribution(item);
  return (
    item.semanticDomain === 'people' &&
    attribution &&
    attribution.provider === DEVICE_PRIVATE_PICTOGRAM_PROVIDER
  );
}

// Names may also be ordinary vocabulary. Catalog collisions extend this list
// without interpreting every registered name as a common noun.
const COMMON_NAME_WORDS = new Set([
  '王子',
  '白雪',
  '夏天',
  '安静',
  '开心',
  '高兴',
  '和平',
  '方向',
  '余光'
]);
function ordinaryNameContext(token, source, start) {
  // The same word can have different senses in different clauses.
  const before = source
    .slice(0, start)
    .split(/[，。！？；,.!?;\n]/)
    .pop();
  const after = source
    .slice(start + token.length)
    .split(/[，。！？；,.!?;\n]/)[0];
  if (token === '王子') return /(?:童话|故事)(?:里|中)(?:的)?$/.test(before);
  if (token === '白雪')
    return (
      /(?:覆盖着?|积满|堆满)(?:一层)?$/.test(before) || /^皑皑/.test(after)
    );
  if (token === '夏天')
    return (
      /(?:一年四季|春天.*?秋天.*?冬天)/.test(before) ||
      /^(?:是|这个)?(?:炎热的)?季节/.test(after)
    );
  return (
    ['安静', '开心', '高兴'].includes(token) &&
    (/(?:保持|很|太|有点)$/.test(before) || /^(?:一点|一些)/.test(after))
  );
}

export function resolvePersonalReference(token, catalog, context = {}) {
  const people = getPersonalPeople(catalog);
  const source = String(context.source || token);
  const start = Number.isInteger(context.start) ? context.start : 0;
  const spans = findCommunicationPersonSpans(
    source,
    getPersonalPersonTerms(catalog)
  );
  if (
    spans.some(
      span =>
        span.privatePrefix &&
        start < span.end &&
        start + token.length > span.start
    )
  ) {
    return { candidates: [], resolved: null, reason: 'name-boundary' };
  }
  const exact = people.filter(item => item.tile.label === token);
  // Legacy relationship-labelled cards are also perspective dependent.
  if (exact.length && !RELATIVE_NAMES.test(token) && !PRONOUNS.test(token)) {
    const ordinary = (catalog || []).filter(
      item => !isPrivatePerson(item) && item.labels.includes(token)
    );
    if (COMMON_NAME_WORDS.has(token) || ordinary.length) {
      if (ordinaryNameContext(token, source, start))
        return { ordinary: true, candidates: [], resolved: null };
      const personSlot = /(?:请)?(?:联系|通知|叫|找)(?:一下)?$/.test(
        source.slice(0, start)
      );
      if (!personSlot)
        return {
          candidates: exact.concat(ordinary),
          resolved: null,
          reason: 'name-word-ambiguity'
        };
    }
    return {
      candidates: exact,
      resolved: exact.length === 1 ? exact[0] : null
    };
  }
  const alias = people.some(
    item => item.synonyms.includes(token) || item.labels.includes(token)
  );
  // Retain old aliases in saved data, but never use them to identify a person.
  return alias ? { candidates: [], resolved: null } : null;
}

export function applyPersonalReferenceGuard(matches, catalog) {
  const source = (matches || []).map(item => item.token).join('');
  let cursor = 0;
  return (matches || []).map(item => {
    const start = cursor;
    cursor += item.token.length;
    if (
      item.tile &&
      (item.tile.textOnly ||
        item.matchType === 'manual' ||
        ['manual', 'corrected'].includes(item.source))
    )
      return item;
    const result = resolvePersonalReference(item.token, catalog, {
      source,
      start
    });
    if (!result) return item;
    if (result.ordinary)
      return {
        ...item,
        personalReference: false,
        personCandidates: [],
        ...(item.tile && isPrivatePerson(item.tile)
          ? { tile: null, matchType: 'none' }
          : {})
      };
    return {
      ...item,
      personalReference: true,
      personCandidates: result.resolved ? [] : result.candidates,
      tile: result.resolved,
      matchType: result.resolved ? 'synonym' : 'none'
    };
  });
}

export function filterPublicPictureTokens(tokens, catalog) {
  const names = getPersonalPersonTerms(catalog);
  return (tokens || []).filter(
    token =>
      typeof token === 'string' &&
      !/^(?:data:|blob:|file:|https?:|wxfile:|synthetic-private:)/i.test(
        token
      ) &&
      !names.some(name => token.includes(name)) &&
      !resolvePersonalReference(token, catalog)
  );
}
