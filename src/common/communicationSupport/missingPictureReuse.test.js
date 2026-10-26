import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';
import { buildReceiverLoopState } from './receiverPipeline';
import {
  getReviewedArasaacIds,
  getReviewedLookupToken
} from './reviewedArasaac';
import {
  buildCommunicationTileCatalog,
  matchTextToCommunicationTiles
} from './symbolMatching';
import { findSafeLocalMissingTokenResolutions } from './missingTokens';

const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
test.each([
  ['我想洗澡', ['我', '想', '洗澡'], '洗澡', 'rJK_QRq6m5K-'],
  ['我不想洗澡', ['我', '不', '想', '洗澡'], '洗澡', 'rJK_QRq6m5K-'],
  ['停下来', ['停下来'], '停下来', 'pi-home-stop']
])(
  'reconnects an existing whole action without changing source: %s',
  (text, tokens, token, id) => {
    const state = buildReceiverLoopState(text, boards.advanced, { intl });
    expect(state.reviewItems.map(x => x.token)).toEqual(tokens);
    expect(state.reviewItems.find(x => x.token === token).tile.id).toBe(id);
    expect(state.outputPreview.map(x => x.vocalization).join('')).toBe(text);
  }
);
test('existing missing-token records can resolve locally for the bathing card', () => {
  const catalog = buildCommunicationTileCatalog(boards.advanced, intl);
  const resolutions = findSafeLocalMissingTokenResolutions(
    [{ id: 'synthetic', normalizedToken: '洗澡', status: 'new' }],
    catalog
  );
  expect(resolutions).toHaveLength(1);
  expect(resolutions[0].resolvedPictogramId).toBe('rJK_QRq6m5K-');
});
test.each([['尿片', '尿布', 2863], ['一点点', '少许', 7209]])(
  'restores lookup candidates for %s without rewriting the original token',
  (token, lookup, id) => {
    expect(getReviewedLookupToken(token)).toBe(lookup);
    expect(getReviewedArasaacIds(token)).toEqual([id]);
    expect(
      buildReceiverLoopState(token, [], { intl }).reviewItems.map(x => x.token)
    ).toEqual([token]);
  }
);
test.each(['洗头', '洗脸'])(
  'does not reuse the bathing picture for %s',
  token => {
    const library = [
      {
        id: 'synthetic',
        tiles: [
          {
            id: 'wrong',
            label: '洗澡',
            image: '/bath.png',
            communicationSynonyms: token
          }
        ]
      }
    ];
    // Candidate exclusion on the default card must work even with an old alias.
    const card = boards.advanced
      .flatMap(b => b.tiles || [])
      .find(t => t.id === 'rJK_QRq6m5K-');
    library[0].tiles = [{ ...card, communicationSynonyms: token }];
    expect(
      matchTextToCommunicationTiles(token, library, {
        intl,
        preSegmented: [token],
        preserveSegments: true
      }).matches[0].tile
    ).toBeNull();
  }
);
