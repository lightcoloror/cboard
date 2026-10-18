import { buildPersonalPictogramTileDTO } from './pictogramMetadataSuggestion';
import {
  buildReceiverLoopState,
  replaceReceiverReviewItem,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState
} from './receiverPipeline';
import {
  buildCommunicationAiSentenceRequest,
  buildCommunicationAiResegmentRequest,
  applyCommunicationAiResegmentation
} from './communicationAi';
import {
  getPrivatePersonRequestIdentity,
  restorePrivatePersonAiResponse
} from './privatePersonAi';
import { createCareAiRequestJournal } from './careAiRequestJournal';
import { filterPublicPictureTokens } from './personalPeople';
import { buildCommunicationTileCatalog } from './symbolMatching';

const person = (id, label) =>
  buildPersonalPictogramTileDTO({
    id,
    label,
    category: 'people',
    boardId: 'private',
    image: `synthetic-private://${id}`
  });
const boards = [
  {
    id: 'private',
    name: '合成测试',
    tiles: [
      person('p1', '林知岚'),
      person('p2', '林知岚'),
      person('p3', '欧阳明澈')
    ]
  }
];
const sentenceRequest = (
  tiles = [boards[0].tiles[0], boards[0].tiles[1], boards[0].tiles[0]]
) => buildCommunicationAiSentenceRequest({ output: tiles, boards });
const journal = () => {
  const values = new Map();
  return createCareAiRequestJournal({
    storage: {
      getItem: k => values.get(k) || null,
      setItem: (k, v) => values.set(k, v)
    }
  });
};
const scope = {
  origin: 'https://synthetic.invalid',
  accountId: 'test',
  familyId: 'test',
  profileId: 'test',
  fundingId: 'test',
  operation: 'communication-sentences'
};

test('wire contains ordered anonymous references, not photos, names or stable private IDs', () => {
  const request = sentenceRequest();
  expect(request.pictogramLabels).toEqual(['⟦P1⟧', '⟦P2⟧', '⟦P1⟧']);
  const wire = JSON.stringify(request);
  for (const secret of [
    '林知岚',
    '欧阳明澈',
    'synthetic-private:',
    'p1',
    'personId',
    'entries'
  ])
    expect(wire).not.toContain(secret);
  const restored = restorePrivatePersonAiResponse(
    request,
    { candidates: ['⟦P1⟧叫⟦P2⟧来找⟦P1⟧。', '⟦P2⟧叫⟦P1⟧。'] },
    'communication-sentences'
  );
  expect(restored.candidates).toEqual(['林知岚叫林知岚来找林知岚。']);
});

test.each([
  '⟦P1⟧来了。',
  '⟦P2⟧找⟦P1⟧和⟦P1⟧。',
  '⟦P1⟧找⟦P3⟧和⟦P1⟧。',
  '他叫她过来。'
])('rejects erased/reordered/invented identities: %s', candidate => {
  expect(() =>
    restorePrivatePersonAiResponse(
      sentenceRequest(),
      { candidates: [candidate] },
      'communication-sentences'
    )
  ).toThrow(expect.objectContaining({ code: 'AI_PERSON_REFERENCE_MISMATCH' }));
});

test('lost local context fails before send, instead of resolving anonymous names by guess', () => {
  const request = JSON.parse(JSON.stringify(sentenceRequest()));
  expect(() => getPrivatePersonRequestIdentity(request)).toThrow(
    'person references'
  );
});

test('timeout retry identity stays stable after reconstruction but changes when same-name card changes', () => {
  const a = sentenceRequest([boards[0].tiles[0]]);
  const b = sentenceRequest([boards[0].tiles[1]]);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  const prepare = request =>
    journal().prepare({
      ...scope,
      body: JSON.parse(JSON.stringify(request)),
      localIdentity: getPrivatePersonRequestIdentity(request)
    });
  expect(prepare(a).requestId).toBe(
    prepare(sentenceRequest([boards[0].tiles[0]])).requestId
  );
  expect(prepare(a).requestId).not.toBe(prepare(b).requestId);
});

test('resegmentation restores Unicode spans and occurrence-specific same-name selections offline', () => {
  const text = '🙂林知岚叫林知岚';
  const state = buildReceiverLoopState(text, boards);
  const people = state.reviewItems.filter(item => item.token === '林知岚');
  let selected = replaceReceiverReviewItem(
    state.reviewItems,
    people[0].id,
    people[0].personCandidates[0]
  );
  selected = replaceReceiverReviewItem(
    selected,
    people[1].id,
    people[1].personCandidates[1]
  );
  const request = buildCommunicationAiResegmentRequest({
    text,
    reviewItems: selected,
    boards
  });
  expect(request.text).toBe('🙂⟦P1⟧叫⟦P2⟧');
  expect(JSON.stringify(request)).not.toContain('林知岚');
  const restored = restorePrivatePersonAiResponse(
    request,
    { tokens: ['🙂', '⟦P1⟧', '叫', '⟦P2⟧'] },
    'communication-resegment'
  );
  expect(restored.segments[1]).toMatchObject({
    start: 1,
    end: 4,
    surface: '林知岚'
  });
  const adopted = applyCommunicationAiResegmentation({
    text,
    boards,
    currentReviewItems: selected,
    response: restored
  });
  expect(adopted.applied).toBe(true);
  expect(
    adopted.reviewItems
      .filter(item => item.token === '林知岚')
      .map(item => item.tile.id)
  ).toEqual(['p1', 'p2']);
  const entry = {
    ...buildReceiverHistoryEntry(text, adopted.reviewItems),
    recordStatus: 'draft'
  };
  const offline = restoreReceiverLoopState(
    JSON.parse(JSON.stringify(entry)),
    boards
  );
  expect(
    offline.reviewItems
      .filter(item => item.token === '林知岚')
      .map(item => item.tile.tile.image)
  ).toEqual(['synthetic-private://p1', 'synthetic-private://p2']);
  const retry = buildCommunicationAiResegmentRequest({
    text,
    reviewItems: offline.reviewItems,
    boards
  });
  expect(getPrivatePersonRequestIdentity(retry)).toBe(
    getPrivatePersonRequestIdentity(request)
  );
});

test('split or glued person markers cannot replace the current draft', () => {
  const request = buildCommunicationAiResegmentRequest({
    text: '欧阳明澈来',
    reviewItems: [],
    boards
  });
  for (const tokens of [['⟦P', '1⟧', '来'], ['⟦P1⟧来']]) {
    expect(() =>
      restorePrivatePersonAiResponse(
        request,
        { tokens },
        'communication-resegment'
      )
    ).toThrow('person references');
  }
});

test.each([false, true])(
  'prefix, common words and Unicode full names with fallback=%s',
  fallback => {
    const segmenter = Intl.Segmenter;
    try {
      if (fallback) Intl.Segmenter = undefined;
      const local = [
        {
          id: 'private',
          tiles: [
            person('short', '张三'),
            person('prince', '王子'),
            person('snow', '白雪'),
            person('season', '夏天'),
            person('english', 'Mary Jane'),
            person('apostrophe', "O'Connor"),
            person('unicode', '𠮷田葵')
          ]
        }
      ];
      const run = (text, options) =>
        buildReceiverLoopState(text, local, options);
      const longer = run('张三丰今天不来');
      expect(longer.reviewItems[0]).toMatchObject({
        token: '张三丰',
        tile: null,
        personalReference: true
      });
      expect(
        run('张三丰', {
          preSegmented: ['张三', '丰'],
          preserveSegments: true
        }).reviewItems.every(item => !item.tile)
      ).toBe(true);
      expect(run('张三今天不来').reviewItems[0].tile.id).toBe('short');
      for (const text of ['童话里的王子住在城堡', '山上覆盖着白雪', '夏天很热'])
        expect(run(text).reviewItems.every(item => !item.tile)).toBe(true);
      expect(
        run('请联系王子，童话里的王子来了')
          .reviewItems.filter(item => item.token === '王子')
          .map(item => item.tile && item.tile.id)
      ).toEqual(['prince', null]);
      for (const name of ['Mary Jane', "O'Connor", '𠮷田葵'])
        expect(
          run(`请联系${name}`).reviewItems.find(item => item.token === name)
            .tile.tile.label
        ).toBe(name);
      const catalog = buildCommunicationTileCatalog(local);
      expect(
        filterPublicPictureTokens(
          ['张三丰', '张三', 'synthetic-private://short', '回家'],
          catalog
        )
      ).toEqual(['回家']);
    } finally {
      Intl.Segmenter = segmenter;
    }
  }
);
