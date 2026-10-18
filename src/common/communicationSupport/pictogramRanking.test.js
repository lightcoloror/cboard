import {
  buildArasaacSemanticFields,
  buildPictogramSemantics,
  assessPictogramCandidate,
  rankPictogramCandidates,
  isPictogramSemanticMatchAllowed
} from './pictogramSemantics';
import {
  getMissingTokenSuggestions,
  reviewMissingTokenRecord
} from './missingTokens';

const picture = (token, id, label, query = token) => ({
  id: `runtime_${id}`,
  ...buildArasaacSemanticFields(token, query, 'en', id, {
    keywords: [{ keyword: label }]
  }),
  image: `https://static.arasaac.org/pictograms/${id}/${id}_300.png`,
  source: {
    provider: 'arasaac',
    originalId: String(id),
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    sourceUrl: `https://arasaac.org/pictograms/${id}`
  }
});
const strong = () => picture('回家', 29714, 'come back', 'come back');
const partial = () => picture('回家', 16805, 'arrive', 'arrive');

test('ranks before limiting; provider top four cannot hide a later audited action', () => {
  const first = [1, 2, 3, 4].map(id =>
    picture('回家', id, 'go home', 'go home')
  );
  const original = [...first, partial(), strong()];
  const snapshot = JSON.stringify(original);
  const ranked = rankPictogramCandidates('回家', original);
  expect(ranked.map(p => p.source.originalId)).toEqual([
    '29714',
    '1',
    '2',
    '3'
  ]);
  expect(JSON.stringify(original)).toBe(snapshot);
  expect(isPictogramSemanticMatchAllowed('回家', ranked[0].semantics)).toBe(
    false
  );
});

test.each([
  ['回家', 'leave home'],
  ['回家', 'home'],
  ['离家', 'go home'],
  ['吃饭', 'food'],
  ['吃药', 'pills'],
  ['公园', 'parking lot'],
  ['哥哥', 'younger brother'],
  ['奶奶', 'maternal grandmother'],
  ['可以', 'tin can']
])('rejects wrong or incomplete meaning: %s / %s', (token, label) => {
  expect(
    rankPictogramCandidates(token, [picture(token, 999999, label)])
  ).toEqual([]);
});

test('a copied candidate badge cannot give a different image an audited rank', () => {
  const forged = {
    ...strong(),
    id: 'other',
    source: { ...strong().source, originalId: '999' }
  };
  expect(assessPictogramCandidate('回家', forged).eligible).toBe(false);
  expect(rankPictogramCandidates('离家', [strong()])).toEqual([]);
  const mixed = strong();
  mixed.semantics.sourceLabels.push('leave home');
  expect(assessPictogramCandidate('回家', mixed).reason).toBe(
    'conflicting-meaning'
  );
  const mislabeled = picture('回家', 999, 'go home', 'go home');
  mislabeled.semantics.candidateMatch = 'strong';
  mislabeled.semantics.candidateEvidence = strong().semantics.candidateEvidence;
  const [cleaned] = rankPictogramCandidates('回家', [mislabeled]);
  expect(cleaned.semantics.candidateMatch).toBeUndefined();
  expect(cleaned.semantics.requiresReview).toBe(true);
});

test('stale evidence and popularity cannot outrank valid source meaning', () => {
  const stale = {
    ...strong(),
    semantics: { ...strong().semantics, mappingVersion: 'old' }
  };
  const popular = {
    ...partial(),
    usageCount: 100000,
    image: 'wxfile://saved/partial.png'
  };
  expect(
    rankPictogramCandidates('回家', [popular, stale, strong()]).map(
      p => p.source.originalId
    )
  ).toEqual(['29714', '16805']);
});

test('deduplicates the same source under different runtime IDs after ranking', () => {
  const duplicate = { ...strong(), id: 'api-runtime-alias' };
  expect(
    rankPictogramCandidates('回家', [partial(), duplicate, strong()]).map(
      p => p.id
    )
  ).toEqual(['api-runtime-alias', 'runtime_16805']);
  expect(rankPictogramCandidates('回家', [strong()], { limit: 0 })).toEqual([]);
});

test('legacy candidates remain manual choices without a meaning boost', () => {
  const legacy = picture('回家', 99, 'return');
  delete legacy.semantics;
  expect(
    rankPictogramCandidates('回家', [legacy, partial(), strong()]).map(
      p => p.id
    )
  ).toEqual(['runtime_29714', 'runtime_16805', 'runtime_99']);
  expect(assessPictogramCandidate('回家', legacy).reason).toBe(
    'legacy-needs-review'
  );
});

test('raw translated labels cannot revive audited bar soap; later liquid soap survives the cap', () => {
  const make = (id, labels) => ({
    id,
    image: '/cached.png',
    label: labels[0],
    source: {
      provider: 'opensymbols',
      originalId: id,
      name: 'OpenSymbols',
      license: 'CC BY-SA',
      sourceUrl: 'https://www.opensymbols.org/'
    },
    semantics: buildPictogramSemantics({
      token: '洗手液',
      query: 'liquid soap',
      provider: 'opensymbols',
      originalId: id,
      sourceLabels: labels
    })
  });
  const bad = [
    'hand-soaps-eeb0ba8b',
    'hand-soap-687a2868',
    'hand-soap-1-9020b7a6'
  ].map(id => make(id, ['洗手液']));
  const good = make('liquid-soap-cdc5bfc6', ['liquid soap']);
  const shower = picture('洗手液', 3335, 'liquid soap', 'liquid soap');
  const snapshot = JSON.stringify(bad);
  const ranked = rankPictogramCandidates('洗手液', [...bad, shower, good]);
  expect(ranked.map(p => p.id)).toEqual([good.id]);
  expect(ranked[0].semantics.requiresReview).toBe(true);
  expect(JSON.stringify(bad)).toBe(snapshot);
  // Rebuild from source identity even if a stale/corrupt client stamps the
  // requested meaning and current mapping version onto the old bad image.
  const forged = {
    ...bad[0],
    semantics: { ...good.semantics, sourceLabels: ['洗手液'] }
  };
  expect(assessPictogramCandidate('洗手液', forged).eligible).toBe(false);
});

test('queue storage, JSON restart and user selection use the same ordering', () => {
  const wrong = [1, 2, 3, 4].map(id => picture('回家', id, 'leave home'));
  const record = { id: 'home', normalizedToken: '回家', status: 'new' };
  const stored = reviewMissingTokenRecord([record], 'home', {
    status: 'suggested',
    suggestedPictogramId: wrong[0].id,
    suggestedPictograms: [...wrong, partial(), strong()],
    source: 'online'
  });
  const restored = JSON.parse(JSON.stringify(stored));
  expect(
    getMissingTokenSuggestions(restored[0]).map(p => p.source.originalId)
  ).toEqual(['29714', '16805']);
  expect(restored[0]).toMatchObject({
    status: 'suggested',
    reviewedByCaregiver: false
  });
  expect(restored[0].suggestedPictogramId).toBe('runtime_29714');
  // Deliberately choosing the second-ranked picture must remain respected.
  const confirmed = reviewMissingTokenRecord(restored, 'home', {
    status: 'resolved',
    resolvedPictogramId: 'runtime_16805',
    reviewedByCaregiver: true
  });
  expect(confirmed[0].resolvedPictogram.source.originalId).toBe('16805');
  expect(confirmed[0].resolvedPictogram.vocalization).toBe('回家');
});

test('source help scenes rank everyday before medical and rescue, but remain manual choices', () => {
  const help = (id, labels, categories = [], definitions = []) => ({
    id,
    label: labels[0],
    image: '/cached.png',
    source: {
      provider: 'arasaac',
      originalId: id,
      name: 'ARASAAC',
      license: 'CC BY-NC-SA 4.0',
      sourceUrl: `https://arasaac.org/pictograms/${id}`
    },
    semantics: buildPictogramSemantics({
      token: '请帮忙',
      query: 'help',
      provider: 'arasaac',
      originalId: id,
      sourceLabels: labels,
      sourceCategories: categories,
      sourceDefinitions: definitions
    })
  });
  const everyday = help('4570', ['help', 'cooperate', 'aid']);
  const medical = help('10141', ['help', 'assist'], ['medical procedure']);
  const rescue = help('9046', ['rescue', 'help', 'save'], ['swimming pool']);
  const ranked = rankPictogramCandidates('请帮忙', [rescue, medical, everyday]);
  expect(ranked.map(p => p.id)).toEqual(['4570', '10141', '9046']);
  expect(ranked.every(p => p.semantics.requiresReview)).toBe(true);
  expect(
    assessPictogramCandidate('请帮忙', help('save', ['help', 'save'])).tier
  ).toBe(2);
  const stored = reviewMissingTokenRecord(
    [{ id: 'help', normalizedToken: '请帮忙', status: 'new' }],
    'help',
    {
      status: 'suggested',
      suggestedPictograms: [rescue, medical, everyday]
    }
  );
  const selected = reviewMissingTokenRecord(
    JSON.parse(JSON.stringify(stored)),
    'help',
    {
      status: 'resolved',
      resolvedPictogramId: rescue.id,
      reviewedByCaregiver: true
    }
  );
  expect(selected[0].resolvedPictogram.id).toBe(rescue.id);
});
