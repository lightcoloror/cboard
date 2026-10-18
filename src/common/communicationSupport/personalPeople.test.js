import { buildPersonalPictogramTileDTO } from './pictogramMetadataSuggestion';
import { createBoardDTO } from './dto';
import { boardDTOToCboardBoard } from './cboardBoardAdapter';
import { buildCommunicationTileCatalog } from './symbolMatching';
import {
  buildReceiverLoopState,
  replaceReceiverReviewItem,
  buildReceiverHistoryEntry,
  restoreReceiverLoopState
} from './receiverPipeline';
import {
  filterPublicPictureTokens,
  resolvePersonalReference
} from './personalPeople';
import {
  buildCommunicationAiSentenceRequest,
  buildCommunicationAiResegmentRequest
} from './communicationAi';

const image =
  'data:image/svg+xml;base64,' + 'SYNTHETIC_PRIVATE_SENTINEL'.repeat(50);
const person = (id, label, synonyms = '') =>
  buildPersonalPictogramTileDTO({
    id,
    boardId: 'device_private_people',
    label,
    synonyms,
    category: 'people',
    image
  });
const daughter = person('daughter', '林知岚', '小岚,岚岚');
const son = person('son', '林明澈', '阿澈');
const father = person('father', '林安宁');
const wife = person('wife', '陈秀宁');
const board = (tiles = [daughter, son, father, wife]) =>
  createBoardDTO({ id: 'device_private_people', name: '合成人物', tiles });
const match = (text, options = {}, tiles) =>
  buildReceiverLoopState(text, [board(tiles)], options);

describe('private people using full names only', () => {
  test.each([false, true])(
    'whole full names with Intl disabled=%s',
    disableIntl => {
      const segmenter = Intl.Segmenter;
      try {
        if (disableIntl) Intl.Segmenter = undefined;
        for (const alias of ['林知岚', '林明澈', '陈秀宁']) {
          const result = match(`${alias}明天不来吃饭`);
          expect(result.reviewItems[0].token).toBe(alias);
          expect(result.reviewItems[0].tile.tile.label).toBe(alias);
        }
      } finally {
        Intl.Segmenter = segmenter;
      }
    }
  );
  test.each([false, true])(
    'duplicates require choice independent of board order=%s',
    reverse => {
      const tiles = [daughter, person('other', '林知岚', '小岚')];
      const result = match('请找林知岚', {}, reverse ? tiles.reverse() : tiles);
      const item = result.reviewItems.find(value => value.token === '林知岚');
      expect(item.tile).toBeNull();
      expect(item.personCandidates.map(value => value.id).sort()).toEqual([
        'daughter',
        'other'
      ]);
      expect(result.missingTokens).not.toContain('林知岚');
    }
  );
  test('duplicate full names also require choice', () => {
    const item = match('林知岚', {}, [daughter, person('other', '林知岚')])
      .reviewItems[0];
    expect(item.tile).toBeNull();
    expect(item.personCandidates).toHaveLength(2);
  });
  test('legacy nicknames and relationship aliases cannot identify a person', () => {
    const catalog = buildCommunicationTileCatalog([
      board([person('p', '林知岚', '姐姐,老公,小岚')])
    ]);
    for (const token of ['姐姐', '老公', '小岚']) {
      expect(resolvePersonalReference(token, catalog).resolved).toBeNull();
    }
    expect(
      resolvePersonalReference(
        '他',
        buildCommunicationTileCatalog([board([person('bad', '他', '我')])])
      ).resolved
    ).toBeNull();
  });
  test('manual choice survives a local JSON roundtrip; an unresolved draft asks again', () => {
    const tiles = [daughter, person('other', '林知岚')];
    const result = match('林知岚', {}, tiles);
    const review = replaceReceiverReviewItem(
      result.reviewItems,
      result.reviewItems[0].id,
      result.reviewItems[0].personCandidates[1]
    );
    const entry = {
      ...buildReceiverHistoryEntry('林知岚', review),
      recordStatus: 'draft'
    };
    const restored = restoreReceiverLoopState(
      JSON.parse(JSON.stringify(entry)),
      [board(tiles)]
    );
    expect(restored.reviewItems[0].tile.id).toBe('other');
    const draft = {
      ...buildReceiverHistoryEntry('林知岚', result.reviewItems),
      recordStatus: 'draft'
    };
    expect(
      restoreReceiverLoopState(JSON.parse(JSON.stringify(draft)), [
        board(tiles)
      ]).reviewItems[0].personCandidates
    ).toHaveLength(2);
  });
  test('other profiles cannot resolve these people', () => {
    const result = buildReceiverLoopState('林知岚明天不来', [board([])]);
    expect(
      result.reviewItems.some(
        item => item.tile && item.tile.tile.image === image
      )
    ).toBe(false);
  });
  test('old public token caches cannot choose a person for this conversation', () => {
    const result = match(
      '林知岚',
      {
        missingTokenRecords: [
          {
            normalizedToken: '林知岚',
            status: 'resolved',
            resolvedPictogramId: 'daughter',
            reviewedByCaregiver: true
          }
        ]
      },
      [daughter, person('other', '林知岚')]
    );
    expect(result.reviewItems[0].tile).toBeNull();
  });
  test('learned corrections cannot silently pick a same-name person', () => {
    const result = match(
      '林知岚',
      {
        correctionMemory: {
          rules: [{ token: '林知岚', preferredPictogramId: 'daughter' }]
        }
      },
      [daughter, person('other', '林知岚')]
    );
    expect(result.reviewItems[0].tile).toBeNull();
    expect(result.reviewItems[0].personCandidates).toHaveLength(2);
  });
  test('photo bytes roundtrip only in the private board, not model or public requests', () => {
    const restored = createBoardDTO(boardDTOToCboardBoard(board()));
    expect(restored.tiles[0].image).toBe(image);
    const catalog = buildCommunicationTileCatalog([restored]);
    expect(
      filterPublicPictureTokens(['小岚', '林知岚', '回家'], catalog)
    ).toEqual(['回家']);
    const result = match('林知岚');
    const resegment = buildCommunicationAiResegmentRequest({
      text: '林知岚',
      reviewItems: result.reviewItems,
      boards: [restored]
    });
    const sentence = buildCommunicationAiSentenceRequest({
      output: result.outputPreview
    });
    expect(JSON.stringify([resegment, sentence])).not.toContain(
      'SYNTHETIC_PRIVATE_SENTINEL'
    );
    expect(JSON.stringify([resegment, sentence])).not.toContain('data:image');
  });
});
