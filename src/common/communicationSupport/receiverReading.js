// Reading is a projection of confirmed source positions, never a new match.
export const RECEIVER_READING_FALLBACK =
  '图片与原文暂时无法可靠分段，请保留整句，或请伙伴手动说短一点。';

export function buildReceiverReading(inputText, sequence = [], items = []) {
  const points = Array.from(String(inputText || ''));
  const fallback = { segments: [], canSegment: false, reason: RECEIVER_READING_FALLBACK };
  if (!points.length || !sequence.length || sequence.length !== items.length) return fallback;
  let cursor = 0;
  const spans = [];
  for (const item of sequence) {
    const span = item && item.sourceSpan;
    if (!span || span.offsetUnit !== 'unicode-code-point' ||
        !Number.isInteger(span.start) || !Number.isInteger(span.end) ||
        span.start < cursor || span.end <= span.start || span.end > points.length ||
        points.slice(cursor, span.start).join('').trim() ||
        points.slice(span.start, span.end).join('') !== item.originalToken) return fallback;
    spans.push(span);
    cursor = span.end;
  }
  if (points.slice(cursor).join('').trim()) return fallback;
  const ends = [];
  points.forEach((point, index) => {
    // A decimal point is not a clause boundary. Never cut a confirmed card.
    if (/[，。！？；、,!?;\n]/.test(point) &&
        !spans.some(span => span.start < index + 1 && span.end > index + 1)) ends.push(index + 1);
  });
  ends.push(points.length);
  let start = 0;
  const segments = [];
  [...new Set(ends)].forEach(end => {
    const text = points.slice(start, end).join('');
    const indices = spans.flatMap((span, index) =>
      span.start >= start && span.end <= end ? [index] : []);
    if (text.trim()) segments.push({ text, start, end, itemIndices: indices });
    start = end;
  });
  // Punctuation-only tails belong to their preceding segment.
  const merged = [];
  segments.forEach(segment => {
    if (/^[\s，。！？；、,!?;]+$/.test(segment.text) && merged.length) {
      const previous = merged[merged.length - 1];
      previous.text += segment.text;
      previous.end = segment.end;
      previous.itemIndices.push(...segment.itemIndices);
    } else merged.push(segment);
  });
  return { segments: merged, canSegment: merged.length > 1, reason: merged.length > 1 ? '' : '这句话保持整句展示，可请伙伴手动说短一点。' };
}
