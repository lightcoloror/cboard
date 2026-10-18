import {
  buildArasaacSemanticFields,
  getSemanticCandidateHint,
  rankPictogramCandidates,
  isPictogramSemanticMatchAllowed
} from './pictogramSemantics';
import { matchTextToCommunicationTiles } from './symbolMatching';
import {
  applyMissingTokenResolutions,
  reviewMissingTokenRecord
} from './missingTokens';

const candidate = (token, id, labels, query) => ({
  id: `runtime_${token}_${id}`,
  ...buildArasaacSemanticFields(token, query, 'en', id, {
    keywords: labels.map(keyword => ({ keyword }))
  }),
  image: 'data:image/png;base64,c3ludGhldGlj',
  source: {
    provider: 'arasaac',
    originalId: String(id),
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    sourceUrl: `https://arasaac.org/pictograms/${id}`
  }
});
const meal = () =>
  candidate('吃饭', 38057, ['dine', 'dinner', 'lunch'], 'dine');
const tonight = () => candidate('今晚', 7181, ['night', 'nighttime'], 'night');

test('a qualified tonight image outranks the partial night, with an honest explanation', () => {
  const exact = candidate('今晚', 999, ['tonight'], 'tonight');
  const ranked = rankPictogramCandidates('今晚', [tonight(), exact]);
  expect(ranked.map(p => p.source.originalId)).toEqual(['999', '7181']);
  expect(getSemanticCandidateHint(ranked[1].semantics)).toContain(
    '没有表示“今天”'
  );
  expect(ranked.every(p => p.semantics.requiresReview)).toBe(true);
  expect(isPictogramSemanticMatchAllowed('今晚', tonight().semantics)).toBe(
    false
  );
});

test('only the audited untimed meal scene is accepted, not dinner, food or eating a snack', () => {
  const bad = [
    candidate('吃饭', 4593, ['dine', 'eat dinner'], 'dine'),
    candidate('吃饭', 6970, ['have supper', 'dine'], 'dine'),
    candidate('吃饭', 28675, ['dine', 'have dinner'], 'dine'),
    candidate('吃饭', 99, ['food'], 'dine'),
    candidate('吃饭', 100, ['eat'], 'dine')
  ];
  expect(
    rankPictogramCandidates('吃饭', [...bad, meal()]).map(
      p => p.source.originalId
    )
  ).toEqual(['38057']);
  expect(getSemanticCandidateHint(meal().semantics)).toContain(
    '没有早午晚时间标记'
  );
  expect(isPictogramSemanticMatchAllowed('吃饭', meal().semantics)).toBe(false);
  expect(rankPictogramCandidates('晚饭', [meal()])).toEqual([]);
});

test('the partial night relationship is source-bound and does not license conflicting senses', () => {
  expect(
    rankPictogramCandidates('今晚', [
      candidate('今晚', 26997, ['night'], 'night')
    ])
  ).toEqual([]);
  expect(
    rankPictogramCandidates('今晚', [
      candidate('今晚', 7181, ['night', 'go home'], 'night')
    ])
  ).toEqual([]);
  expect(rankPictogramCandidates('明晚', [tonight()])).toEqual([]);
  const copied = {
    ...tonight(),
    source: { ...tonight().source, originalId: '999' }
  };
  expect(rankPictogramCandidates('今晚', [copied])).toEqual([]);
});

test.each([
  '今晚先吃饭，然后回家。',
  '我今晚不吃饭，明晚再吃。',
  '吃饭以后回家，别去饭店。',
  '今晚不回家，明晚才回家。',
  '不是今晚，是明天晚上。',
  '我不吃晚饭，但想吃饭。'
])(
  'new combination preserves text, negation and manual choices on restore: %s',
  text => {
    const before = matchTextToCommunicationTiles(text, [], {
      allowPartial: false
    });
    expect(before.matches.map(m => m.token).join('')).toBe(text);
    let records = [
      {
        id: 'meal',
        normalizedToken: '吃饭',
        status: 'suggested',
        suggestedPictograms: [meal()]
      },
      {
        id: 'night',
        normalizedToken: '今晚',
        status: 'suggested',
        suggestedPictograms: [tonight()]
      }
    ];
    expect(applyMissingTokenResolutions(before.matches, records, [])).toEqual(
      before.matches
    );
    records = reviewMissingTokenRecord(records, 'meal', {
      status: 'resolved',
      resolvedPictogramId: meal().id,
      reviewedByCaregiver: true
    });
    records = reviewMissingTokenRecord(records, 'night', {
      status: 'resolved',
      resolvedPictogramId: tonight().id,
      reviewedByCaregiver: true
    });
    const after = applyMissingTokenResolutions(
      before.matches,
      JSON.parse(JSON.stringify(records)),
      []
    );
    expect(after.map(m => m.token)).toEqual(before.matches.map(m => m.token));
    after.forEach((m, i) => {
      if (['吃饭', '今晚'].includes(m.token))
        expect(m.tile.tile.vocalization).toBe(m.token);
      else expect(m.tile).toEqual(before.matches[i].tile);
    });
  }
);

test('a familiar private meal card is reused directly; a generic night is not tonight', () => {
  const board = [
    {
      id: 'family',
      tiles: [
        {
          id: 'meal',
          label: '吃饭',
          vocalization: '吃饭',
          image: 'data:image/png;base64,cHJpdmF0ZQ=='
        },
        {
          id: 'night',
          label: '晚上',
          vocalization: '晚上',
          image: '/symbols/mulberry/night.svg'
        }
      ]
    }
  ];
  const result = matchTextToCommunicationTiles('今晚吃饭', board, {
    allowPartial: false
  });
  expect(result.matches.map(m => m.token)).toEqual(['今晚', '吃饭']);
  expect(result.matches[0].tile).toBeNull();
  expect(result.matches[1].tile.id).toBe('meal');
});
