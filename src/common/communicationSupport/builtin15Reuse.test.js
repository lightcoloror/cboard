import fs from 'fs';
import path from 'path';
import fixture from './fixtures/builtin15Reuse.json';
import careActions from './fixtures/careActionReuse.json';
import hygieneObjects from './fixtures/hygieneObjectReuse.json';
import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';
import {
  buildCommunicationTileCatalog,
  matchTextToCommunicationTiles
} from './symbolMatching';
import {
  buildReceiverLoopState,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState
} from './receiverPipeline';
import {
  findSafeLocalMissingTokenResolutions,
  applyMissingTokenResolutions
} from './missingTokens';
import { createCommunicationRepository } from './repository';
import { getPictogramAttribution } from './pictogramAttribution';
const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
const cases = [
  ...fixture.cards,
  ...careActions.cards,
  ...hygieneObjects.cards
].flatMap(card => card.tokens.map(token => ({ token, ...card })));

test.each(cases)(
  'reuses a bundled image and restores it offline: $token',
  ({ token, id, key, image, label }) => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    try {
      for (const fallback of [false, true]) {
        if (fallback)
          Object.defineProperty(Intl, 'Segmenter', {
            configurable: true,
            value: undefined
          });
        const state = buildReceiverLoopState(token, boards.advanced, { intl });
        expect(state.reviewItems.map(x => x.token)).toEqual([token]);
        expect(state.reviewItems[0].tile.id).toBe(id);
        expect(state.outputPreview[0].vocalization).toBe(token);
        const history = JSON.parse(
          JSON.stringify(buildReceiverHistoryEntry(token, state.reviewItems))
        );
        const restored = restoreReceiverLoopState(history, boards.advanced, {
          intl
        });
        expect(restored.outputPreview[0].vocalization).toBe(token);
        expect(restored.reviewItems[0].tile.id).toBe(id);
      }
    } finally {
      Object.defineProperty(Intl, 'Segmenter', descriptor);
    }
    expect(messages[key]).toBe(label);
    const file = path.resolve(
      __dirname,
      '../../../public/symbols/mulberry',
      image
    );
    expect(fs.existsSync(file)).toBe(true);
    expect(
      getPictogramAttribution({ id, image: '/symbols/mulberry/' + image })
        .provider
    ).toBe('mulberry');
  }
);

test.each(cases)(
  'resolves old pending gaps locally without an online request: $token',
  ({ token, id }) => {
    localStorage.clear();
    const repository = createCommunicationRepository({
      storage: localStorage,
      now: () => 100
    });
    repository.recordMissingTokens({ tokens: [token], rawText: token });
    const catalog = buildCommunicationTileCatalog(boards.advanced, intl);
    const [resolution] = findSafeLocalMissingTokenResolutions(
      repository.loadMissingTokens(),
      catalog
    );
    expect(resolution.resolvedPictogramId).toBe(id);
    repository.reviewMissingToken(resolution.recordId, {
      ...resolution,
      status: 'resolved'
    });
    const restarted = createCommunicationRepository({ storage: localStorage });
    const [item] = applyMissingTokenResolutions(
      [{ token, tile: null }],
      restarted.loadMissingTokens(),
      catalog
    );
    expect(item.tile.id).toBe(id);
    expect(item.tile.tile.image).toMatch(/^\/symbols\/mulberry\//);
  }
);

test.each([
  ...fixture.unsafePairs,
  ...careActions.unsafePairs,
  ...hygieneObjects.unsafePairs
])('rejects a related or old mistranslated card: %s / %s', (token, label) => {
  const library = [
    {
      id: 'synthetic',
      tiles: [
        {
          id: 'wrong',
          label,
          vocalization: label,
          image: '/wrong.svg',
          communicationSynonyms: token
        }
      ]
    }
  ];
  expect(
    matchTextToCommunicationTiles(token, library, {
      preSegmented: [token],
      preserveSegments: true
    }).matches[0].tile
  ).toBeNull();
});
