import fixtures from './fixtures/actionConceptRegression.json';
import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';
import { segmentChineseCommunicationText } from './segmentation';
import {
  buildCommunicationTileCatalog,
  matchTextToCommunicationTiles
} from './symbolMatching';
import {
  applyMissingTokenResolutions,
  findSafeLocalMissingTokenResolutions
} from './missingTokens';
import {
  buildReceiverLoopState,
  retainReceiverReviewItemAsText,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState
} from './receiverPipeline';

const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
const catalogFor = (token, label, vocalization = label) => [
  {
    id: 'synthetic',
    tiles: [
      {
        id: 'candidate',
        label,
        vocalization,
        image: '/synthetic.png',
        communicationSynonyms: token
      }
    ]
  }
];

test.each(['请帮忙', '帮忙'])(
  'a complete help request uses %s without losing its wording',
  label => {
    const state = buildReceiverLoopState('请帮忙', catalogFor('请帮忙', label));
    expect(state.reviewItems.map(m => m.token)).toEqual(['请帮忙']);
    expect(state.reviewItems[0].tile.id).toBe('candidate');
    expect(state.outputPreview.map(m => m.vocalization)).toEqual(['请帮忙']);
  }
);

test('an explicitly reviewed split remains available', () => {
  const result = matchTextToCommunicationTiles('请帮忙', [], {
    preSegmented: ['请', '帮忙'],
    preserveSegments: true
  });
  expect(result.segmentation.segments).toEqual(['请', '帮忙']);
});

test.each(fixtures.cases)(
  'preserves the complete action or symptom: $text',
  ({ text, tokens }) => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    try {
      for (const fallback of [false, true]) {
        if (fallback)
          Object.defineProperty(Intl, 'Segmenter', {
            configurable: true,
            value: undefined
          });
        expect(segmentChineseCommunicationText(text).segments).toEqual(tokens);
        for (const library of [boards.advanced, []]) {
          const state = buildReceiverLoopState(text, library, { intl });
          expect(state.reviewItems.map(m => m.token)).toEqual(tokens);
          expect(
            state.reviewItems.map(m =>
              Array.from(text)
                .slice(m.sourceSpan.start, m.sourceSpan.end)
                .join('')
            )
          ).toEqual(tokens);
          let review = state.reviewItems;
          review
            .filter(m => !m.tile)
            .forEach(m => {
              review = retainReceiverReviewItemAsText(review, m.id);
            });
          const record = JSON.parse(
            JSON.stringify(buildReceiverHistoryEntry(text, review))
          );
          const restored = restoreReceiverLoopState(record, [], { intl });
          expect(restored.outputPreview.map(m => m.vocalization).join('')).toBe(
            text
          );
        }
      }
    } finally {
      Object.defineProperty(Intl, 'Segmenter', descriptor);
    }
  }
);

test.each(fixtures.unsafePairs)(
  'rejects stale related aliases: %s -> %s',
  (token, label) => {
    // Test direct tokens as well as default segmentation; old cached metadata
    // and an exact label with an unsafe utterance must not bypass the guard.
    for (const library of [
      catalogFor(token, label),
      catalogFor(token, token, label)
    ]) {
      const result = matchTextToCommunicationTiles(token, library, {
        preSegmented: [token],
        preserveSegments: true
      });
      expect(result.matches[0].tile).toBeNull();
    }
  }
);

test.each(fixtures.allowedPairs)(
  'retains an equivalent or exact picture: %s -> %s',
  (token, label) => {
    const result = matchTextToCommunicationTiles(
      token,
      catalogFor(token, label),
      { preSegmented: [token], preserveSegments: true }
    );
    expect(result.matches[0].tile.id).toBe('candidate');
  }
);

test.each(fixtures.unsafePairs)(
  'stale automatic supplement cannot restore %s as %s',
  (token, label) => {
    const catalog = buildCommunicationTileCatalog(catalogFor(token, label));
    const record = { id: 'missing', normalizedToken: token, status: 'new' };
    expect(findSafeLocalMissingTokenResolutions([record], catalog)).toEqual([]);
    const item = { id: 'review', token, tile: null, matchType: 'none' };
    const cached = JSON.parse(
      JSON.stringify({
        ...record,
        status: 'resolved',
        source: 'catalog-auto',
        resolvedPictogramId: 'candidate',
        reviewedByCaregiver: false
      })
    );
    expect(applyMissingTokenResolutions([item], [cached], catalog)[0]).toBe(
      item
    );
    // A caregiver can still explicitly choose an image for this patient's use.
    expect(
      applyMissingTokenResolutions(
        [item],
        [{ ...cached, reviewedByCaregiver: true }],
        catalog
      )[0].tile.id
    ).toBe('candidate');
  }
);
