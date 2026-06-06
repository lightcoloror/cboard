const SUBJECT_PRONOUNS = [
  '我们',
  '你们',
  '他们',
  '她们',
  '我',
  '你',
  '他',
  '她',
  '它'
];
const DESIRE_VERBS = ['想要', '需要', '希望', '想', '要'];
const POLITE_PREFIX = '请';

function startsWithAny(text, patterns) {
  return patterns.some(pattern => text.startsWith(pattern));
}

function containsAny(text, patterns) {
  return patterns.some(pattern => text.includes(pattern));
}

export function generateCommunicationCandidateSentences(
  labels,
  candidateCount = 4
) {
  if (!labels || !labels.length) {
    return ['（请先选择图片）'];
  }

  const base = labels.join('');
  const hasSubject = startsWithAny(base, SUBJECT_PRONOUNS);
  const hasDesire = containsAny(base, DESIRE_VERBS);
  const isPoliteAlready = base.startsWith(POLITE_PREFIX);
  const raw = [];

  raw.push(base + '。');

  if (!hasSubject) {
    raw.push('我' + base + '。');
  }

  if (!hasSubject && !hasDesire) {
    raw.push('我想要' + base + '。');
  }

  if (!isPoliteAlready && !hasSubject) {
    raw.push(POLITE_PREFIX + base + '。');
  }

  raw.push(base + '，好吗？');

  const seen = new Set();
  return raw
    .filter(candidate => {
      if (seen.has(candidate)) {
        return false;
      }
      seen.add(candidate);
      return true;
    })
    .slice(0, candidateCount);
}
