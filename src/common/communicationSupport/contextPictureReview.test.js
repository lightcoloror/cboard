import boards from '../../api/boards.json';
import zh from '../../translations/zh-CN.communication';
import {
  matchTextToCommunicationTiles,
  buildCommunicationTileCatalog
} from './symbolMatching';
import {
  buildReceiverLoopState,
  restoreReceiverLoopState,
  buildReceiverOutputPreview,
  retainReceiverReviewItemAsText
} from './receiverPipeline';
import {
  applyMissingTokenResolutions,
  findSafeLocalMissingTokenResolutions
} from './missingTokens';
import { getPictogramAttribution } from './pictogramAttribution';

const intl = { messages: zh, formatMessage: ({ id }) => zh[id] || id };
const match = (token, tiles) =>
  matchTextToCommunicationTiles(token, [{ id: 'legacy', tiles }], {
    intl,
    preSegmented: [token]
  }).matches[0];

test.each([
  '她想开门',
  '他不想开门',
  '她自己打开门',
  '请帮我开罐头',
  '不要打开罐头'
])('reuses object-specific pictures without changing %s', text => {
  const state = buildReceiverLoopState(text, boards.advanced, { intl });
  expect(state.reviewItems.map(item => item.token).join('')).toBe(text);
  const action = state.reviewItems.find(item =>
    /^(打开|开)(门|罐头)$/.test(item.token)
  );
  expect(action).toBeDefined();
  expect(action.tile.tile.image).toBe(
    action.token.endsWith('门')
      ? '/symbols/mulberry/open_door_2_,_to.svg'
      : '/symbols/mulberry/open_tin_,_to.svg'
  );
  if (text.includes('不'))
    expect(
      state.reviewItems.some(item => ['不', '不要'].includes(item.token))
    ).toBe(true);
  const person = state.reviewItems.find(item =>
    ['他', '她'].includes(item.token)
  );
  if (person)
    expect(person.tile.tile.image).toBe(
      person.token === '她'
        ? '/symbols/arasaac/she.png'
        : '/symbols/arasaac/picinterpreter-care/6480.png'
    );
  const reviewed = state.reviewItems.reduce(
    (items, item) =>
      item.tile ? items : retainReceiverReviewItemAsText(items, item.id),
    state.reviewItems
  );
  expect(
    buildReceiverOutputPreview(reviewed)
      .map(item => item.vocalization)
      .join('')
  ).toBe(text);
});

test.each(['请打开', '请打开窗户', '可以开窗，但不要把门打开。'])(
  'does not silently replace generic opening with a jar in %s',
  text => {
    const state = buildReceiverLoopState(text, boards.advanced, { intl });
    expect(state.reviewItems.map(item => item.token).join('')).toBe(text);
    const opening = state.reviewItems.find(item => item.token === '打开');
    expect(opening).toBeDefined();
    expect(opening.tile).toBeNull();
    expect(state.missingTokens).toContain('打开');
  }
);

const legacyCases = [
  ['她', '他/她', '/symbols/arasaac/picinterpreter-care/6480.png'],
  ['她', '她', '/assets/cboard-default/27542f3f4b2084cc.png'],
  ['打开', '打开', '/symbols/mulberry/open_,_to.svg'],
  ['打开', '打开', '/assets/cboard-default/157a1fa5acb46be1.png'],
  ['打开', '打开', '/symbols/mulberry/open_2.svg'],
  ['打开', '打开', '/assets/cboard-default/8a84c933d83a7e2b.png']
];
test.each(legacyCases)(
  'old %s → %s cannot bypass automatic checks via cache or draft',
  (token, label, image) => {
    const tile = {
      id: 'old',
      label,
      vocalization: label,
      image,
      communicationSynonyms: token
    };
    expect(match(token, [tile]).tile).toBeNull();
    const catalog = buildCommunicationTileCatalog(
      [{ id: 'legacy', tiles: [tile] }],
      intl
    );
    const record = {
      id: 'pending',
      normalizedToken: token,
      status: 'resolved',
      resolvedPictogramId: tile.id
    };
    expect(
      findSafeLocalMissingTokenResolutions(
        [{ ...record, status: 'new' }],
        catalog
      )
    ).toEqual([]);
    expect(
      applyMissingTokenResolutions(
        [{ token, tile: null }],
        [record],
        catalog
      )[0].tile
    ).toBeNull();
    expect(
      applyMissingTokenResolutions(
        [{ token, tile: null }],
        [{ ...record, reviewedByCaregiver: true }],
        catalog
      )[0].tile.id
    ).toBe('old');
    const draft = {
      inputText: token,
      direction: 'receive',
      recordStatus: 'draft',
      output: [tile],
      pictogramSequence: [
        {
          originalToken: token,
          pictogramId: tile.id,
          label,
          matchType: 'synonym'
        }
      ]
    };
    expect(
      restoreReceiverLoopState(draft, [], { intl }).reviewItems[0].tile
    ).toBeNull();
    expect(
      restoreReceiverLoopState({ ...draft, recordStatus: 'confirmed' }, [], {
        intl
      }).reviewItems[0].tile
    ).not.toBeNull();
  }
);

test('the female source is not relabelled as male; a personal reviewed picture remains available', () => {
  expect(
    match('他', [{ id: 'she', label: '他', image: '/symbols/arasaac/she.png' }])
      .tile
  ).toBeNull();
  expect(
    match('她', [{ id: 'family', label: '她', image: '/family/she.png' }]).tile
      .id
  ).toBe('family');
  const female = boards.advanced
    .flatMap(board => board.tiles)
    .find(tile => tile.id === 'tuyujia-builtin-she');
  expect(getPictogramAttribution(female)).toMatchObject({
    provider: 'arasaac',
    originalId: 'she.png',
    license: 'CC BY-NC-SA 4.0'
  });
});
