import fixtures from './fixtures/wholeExpressionRegression.json';
import dailyCards from './fixtures/dailyCardReuseRegression.json';
import politeExpressions from './fixtures/politeExpressionRegression.json';
import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';
import {
  buildCommunicationTileCatalog,
  matchTextToCommunicationTiles
} from './symbolMatching';
import {
  buildReceiverLoopState,
  retainReceiverReviewItemAsText,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState
} from './receiverPipeline';
import {
  findSafeLocalMissingTokenResolutions,
  applyMissingTokenResolutions
} from './missingTokens';

const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
test.each([...fixtures.cases, ...dailyCards.cases, ...politeExpressions.cases])(
  'retains the complete AAC expression and source: $text',
  ({ text, tokens, fallbackTokens, picture }) => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    try {
      for (const fallback of [false, true]) {
        if (fallback)
          Object.defineProperty(Intl, 'Segmenter', {
            configurable: true,
            value: undefined
          });
        for (const library of [boards.advanced, []]) {
          const state = buildReceiverLoopState(text, library, { intl });
          const expected = (fallback && fallbackTokens) || tokens;
          expect(state.reviewItems.map(m => m.token)).toEqual(expected);
          expect(
            state.reviewItems.map(m =>
              Array.from(text)
                .slice(m.sourceSpan.start, m.sourceSpan.end)
                .join('')
            )
          ).toEqual(expected);
          if (picture && library.length) {
            expect(
              state.reviewItems.find(m => m.token === picture[0]).tile.id
            ).toBe(picture[1]);
          }
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

test.each([
  ...fixtures.unsafePairs,
  ...dailyCards.unsafePairs,
  ...politeExpressions.unsafePairs
])('does not use a related fragment for %s as %s', (token, label) => {
  const library = [
    {
      id: 'synthetic',
      tiles: [
        {
          id: 'wrong',
          label,
          vocalization: label,
          image: '/synthetic.png',
          communicationSynonyms: token
        }
      ]
    }
  ];
  const result = matchTextToCommunicationTiles(token, library, {
    preSegmented: [token],
    preserveSegments: true
  });
  expect(result.matches[0].tile).toBeNull();
  const catalog = buildCommunicationTileCatalog(library);
  const record = { id: 'missing', normalizedToken: token, status: 'new' };
  expect(findSafeLocalMissingTokenResolutions([record], catalog)).toEqual([]);
  const item = { id: 'review', token, tile: null };
  const cached = JSON.parse(
    JSON.stringify({
      ...record,
      status: 'resolved',
      source: 'catalog-auto',
      resolvedPictogramId: 'wrong',
      reviewedByCaregiver: false
    })
  );
  expect(applyMissingTokenResolutions([item], [cached], catalog)[0]).toBe(item);
});

test('retains an explicit caregiver split and original quantity', () => {
  const tokens = ['再', '说', '一', '遍'];
  expect(
    matchTextToCommunicationTiles('再说一遍', boards.advanced, {
      intl,
      preSegmented: tokens,
      preserveSegments: true
    }).segmentation.segments
  ).toEqual(tokens);
  const result = matchTextToCommunicationTiles('再说两遍', boards.advanced, {
    intl
  });
  expect(result.matches.map(m => m.token).join('')).toBe('再说两遍');
  expect(
    result.matches.some(m => m.tile && m.tile.id === 'pi-home-repeat')
  ).toBe(false);
});

test('a help-me tile cannot consume a possessive family reference', () => {
  const library = [
    {
      id: 'synthetic',
      tiles: [
        {
          id: 'help',
          label: '帮帮我',
          image: '/help.png',
          communicationSynonyms: '帮我'
        },
        {
          id: 'mum',
          label: '妈妈',
          image: '/mum.png',
          communicationCategory: 'people'
        }
      ]
    }
  ];
  const result = matchTextToCommunicationTiles('请帮我妈妈', library);
  expect(result.matches.some(m => m.tile && m.tile.id === 'help')).toBe(false);
  expect(result.matches.map(m => m.token).join('')).toBe('请帮我妈妈');
});

test('the default sleep concept does not rename a caregiver-customized card', () => {
  const library = [
    {
      id: 'custom',
      tiles: [
        {
          id: 'sleep',
          labelKey: 'symbol.peopleActions.toSleepMale',
          label: '午睡时间',
          vocalization: '我想午睡',
          image: '/sleep.svg'
        }
      ]
    }
  ];
  const [card] = buildCommunicationTileCatalog(library, intl);
  expect(card.displayLabel).toBe('午睡时间');
  expect(card.tile.vocalization).toBe('我想午睡');
  expect(card.synonyms).not.toContain('睡');
});
