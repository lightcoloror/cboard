import {
  buildArasaacSemanticFields,
  buildPictogramSemantics,
  getSemanticCandidateQueries,
  isPictogramSearchCandidateRelevant,
  isPictogramSemanticMatchAllowed,
  normalizePictogramSemantics,
  getSemanticCandidateHint
} from './pictogramSemantics';
import {
  reviewMissingTokenRecord,
  applyMissingTokenResolutions
} from './missingTokens';
import { matchTextToCommunicationTiles } from './symbolMatching';

test.each([[29714, 'come back', 'strong'], [16805, 'arrive', 'approximate']])(
  'source ID %s is a candidate, never automatic approval',
  (id, label, strength) => {
    const fields = buildArasaacSemanticFields('回家', label, 'en', id, {
      keywords: [{ keyword: label }]
    });
    expect(fields.label).toBe(label);
    expect(fields.semantics).toMatchObject({
      candidateMatch: strength,
      requiresReview: true,
      relation: 'unverified'
    });
    expect(getSemanticCandidateHint(fields.semantics)).toContain(
      strength === 'approximate' ? '近似表达' : '动作和目的地'
    );
    expect(isPictogramSearchCandidateRelevant(fields.semantics)).toBe(true);
    expect(isPictogramSemanticMatchAllowed('回家', fields.semantics)).toBe(
      false
    );
    expect(
      normalizePictogramSemantics(JSON.parse(JSON.stringify(fields.semantics)))
    ).toEqual(fields.semantics);
  }
);

test.each([
  ['回家', 'come back', 999, 'come back'],
  ['回家', 'arrive', 16807, 'arrive'],
  ['回家', 'come back', 29714, 'leave home'],
  ['回家', 'arrive', 16805, 'home'],
  ['回家', 'come back', 29714, 'parking lot'],
  ['离家', 'leave home', 29714, 'come back'],
  ['出门', 'go out', 16805, 'arrive']
])(
  'does not generalize a related query or ID to %s / %s / %s / %s',
  (token, query, id, label) => {
    const fields = buildArasaacSemanticFields(token, query, 'en', id, {
      keywords: [{ keyword: label }]
    });
    expect(isPictogramSearchCandidateRelevant(fields.semantics)).toBe(false);
  }
);

test('provider identity, current rules and source labels are required', () => {
  expect(getSemanticCandidateQueries('回家')).toEqual(['come back', 'arrive']);
  expect(getSemanticCandidateQueries('家')).toEqual([]);
  const value = buildPictogramSemantics({
    token: '回家',
    query: 'come back',
    provider: 'globalsymbols',
    originalId: 29714,
    sourceLabels: ['come back']
  });
  expect(isPictogramSearchCandidateRelevant(value)).toBe(false);
  const fields = buildArasaacSemanticFields('回家', 'come back', 'en', 29714, {
    keywords: [{ keyword: 'come back' }]
  });
  expect(
    isPictogramSearchCandidateRelevant({
      ...fields.semantics,
      mappingVersion: 'old'
    })
  ).toBe(false);
  expect(
    isPictogramSearchCandidateRelevant(
      buildArasaacSemanticFields('回家', 'come back', 'en', 29714).semantics
    )
  ).toBe(false);
});

test.each(['我今晚不回家吃饭', '我想回家', '不是不回家', '请帮忙回家'])(
  'confirmation preserves expression, negation and offline reuse: %s',
  text => {
    const matched = matchTextToCommunicationTiles(text, [], {
      allowPartial: false
    });
    expect(matched.matches.some(m => m.token === '回家')).toBe(true);
    const fields = buildArasaacSemanticFields(
      '回家',
      'come back',
      'en',
      29714,
      { keywords: [{ keyword: 'come back' }] }
    );
    const picture = {
      id: 'runtime_arasaac_29714',
      ...fields,
      image: 'data:image/png;base64,c3ludGhldGlj',
      source: {
        provider: 'arasaac',
        originalId: '29714',
        name: 'ARASAAC',
        license: 'CC BY-NC-SA 4.0',
        sourceUrl: 'https://arasaac.org/pictograms/29714'
      }
    };
    const records = [
      {
        id: 'home',
        normalizedToken: '回家',
        status: 'suggested',
        suggestedPictograms: [picture]
      }
    ];
    expect(
      applyMissingTokenResolutions(matched.matches, records, []).find(
        m => m.token === '回家'
      ).tile
    ).toBeNull();
    const confirmed = reviewMissingTokenRecord(records, 'home', {
      status: 'resolved',
      resolvedPictogramId: picture.id,
      reviewedByCaregiver: true
    });
    const restored = JSON.parse(JSON.stringify(confirmed));
    const result = applyMissingTokenResolutions(matched.matches, restored, []);
    expect(result.map(m => m.token)).toEqual(matched.matches.map(m => m.token));
    expect(result.find(m => m.token === '回家').tile.tile).toMatchObject({
      vocalization: '回家',
      image: picture.image
    });
    expect(
      applyMissingTokenResolutions(
        [{ token: '离家', tile: null }, { token: '家', tile: null }],
        restored,
        []
      ).every(m => !m.tile)
    ).toBe(true);
    expect(
      applyMissingTokenResolutions(
        matched.matches,
        restored.map(r => ({ ...r, reviewedByCaregiver: false })),
        []
      ).find(m => m.token === '回家').tile
    ).toBeNull();
  }
);
