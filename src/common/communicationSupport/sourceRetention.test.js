import {
  buildReceiverLoopState,
  buildReceiverHistoryEntry,
  retainReceiverReviewItemAsText,
  restoreReceiverLoopState
} from './receiverPipeline';
import {
  normalizeCommunicationHistory,
  normalizeCommunicationReceiverCorrections
} from './storage';
import { buildConfirmedReceiverSyncPayload } from './receiverSync';
import {
  createReceiverDraftEntry,
  confirmReceiverDraftEntry,
  buildReceiverCorrectionFromHistoryEdit,
  getEffectiveReceiverHistoryEntry,
  RECEIVER_CORRECTION_ACTIONS
} from './receiverLifecycle';
import { buildWorkspaceCorrectionMemory } from './correctionMemory';
import boardsFixture from '../../api/boards.json';
import zhMessages from '../../translations/zh-CN.communication';

describe('source-preserving text fallback through persistence', () => {
  test('keeps the pain location through explicit text choice and restart', () => {
    const raw = '我背疼';
    let index = 0;
    const state = buildReceiverLoopState(raw, boardsFixture.advanced, {
      intl: {
        messages: zhMessages,
        formatMessage: ({ id }) => zhMessages[id] || id
      },
      createId: () => `pain-${index++}`
    });
    expect(state.missingTokens).toContain('背疼');
    let review = state.reviewItems;
    review
      .filter(item => !item.tile)
      .forEach(item => {
        review = retainReceiverReviewItemAsText(review, item.id);
      });
    const entry = buildReceiverHistoryEntry(raw, review);
    const restored = restoreReceiverLoopState(
      JSON.parse(JSON.stringify(entry)),
      boardsFixture.advanced
    );
    expect(restored.outputPreview.map(item => item.vocalization).join('')).toBe(
      raw
    );
    expect(
      restored.reviewItems.find(item => item.token === '背疼').tile.textOnly
    ).toBe(true);
  });

  test('double negation retains its words and spoken sequence through explicit text choices and restart', () => {
    const raw = '我不是不想吃饭';
    const boards = boardsFixture.advanced;
    let index = 0;
    const state = buildReceiverLoopState(raw, boards, {
      intl: {
        messages: zhMessages,
        formatMessage: ({ id }) => zhMessages[id] || id
      },
      createId: () => `negation-${index++}`
    });
    expect(state.missingTokens).toEqual(expect.arrayContaining(['不是']));
    let review = state.reviewItems;
    review
      .filter(item => !item.tile)
      .forEach(item => {
        review = retainReceiverReviewItemAsText(review, item.id);
      });
    const entry = buildReceiverHistoryEntry(raw, review);
    expect(entry.output.map(item => item.vocalization).join('')).toBe(raw);
    const restored = restoreReceiverLoopState(
      JSON.parse(JSON.stringify(entry)),
      boards
    );
    expect(restored.outputPreview.map(item => item.vocalization).join('')).toBe(
      raw
    );
    expect(
      restored.reviewItems
        .filter(item => item.token === '不是')
        .every(item => item.tile.textOnly)
    ).toBe(true);
  });

  test('keeps an unresolved negative unresolved until explicitly retained, then restores without a catalog', () => {
    const raw = ' 不要不要水吗？🙂 ';
    let index = 0;
    const state = buildReceiverLoopState(raw, [], {
      createId: () => `r-${index++}`
    });
    expect(state.reviewItems.map(item => item.token).join('')).toBe(raw);
    expect(state.missingTokens).toContain('不要');
    let review = state.reviewItems;
    review
      .filter(item => !item.tile)
      .forEach(item => {
        review = retainReceiverReviewItemAsText(review, item.id);
      });
    expect(state.reviewItems.some(item => !item.tile)).toBe(true);
    const entry = buildReceiverHistoryEntry(raw, review);
    const normalized = normalizeCommunicationHistory([
      { ...JSON.parse(JSON.stringify(entry)), id: 'local', createdAt: 1 }
    ])[0];
    expect(normalized.inputText).toBe(raw);
    expect(
      normalized.pictogramSequence.every(
        item => item.textOnly && item.pictogramId === null
      )
    ).toBe(true);
    expect(
      normalized.pictogramSequence.map(item => item.originalToken).join('')
    ).toBe(raw);
    const restored = restoreReceiverLoopState(normalized, []);
    expect(restored.reviewItems.every(item => item.tile.textOnly)).toBe(true);
    expect(restored.outputPreview.map(item => item.label).join('')).toBe(
      raw.replace(/\s/g, '')
    );
    expect(restored.reviewItems.map(item => item.sourceSpan)).toEqual(
      state.reviewItems.map(item => item.sourceSpan)
    );
    expect(buildConfirmedReceiverSyncPayload([normalized])).toEqual([]);
  });

  test('keeps text in history revisions and never learns a fake image ID', () => {
    const state = buildReceiverLoopState('不要', [], { createId: () => 'r' });
    const original = buildReceiverHistoryEntry('不要', state.reviewItems);
    const confirmed = confirmReceiverDraftEntry(
      createReceiverDraftEntry(original, {
        identity: { workspaceId: 'test-family' }
      }),
      original
    );
    const after = retainReceiverReviewItemAsText(state.reviewItems, 'r');
    const correction = buildReceiverCorrectionFromHistoryEdit(
      confirmed,
      RECEIVER_CORRECTION_ACTIONS.replace,
      state.reviewItems,
      after,
      'r'
    );
    expect(correction.pictogramIdAfter).toBeNull();
    const saved = normalizeCommunicationReceiverCorrections([
      JSON.parse(JSON.stringify(correction))
    ]);
    const effective = getEffectiveReceiverHistoryEntry(confirmed, saved);
    expect(effective.labels).toEqual(['不要']);
    expect(effective.output[0]).toMatchObject({
      textOnly: true,
      label: '不要'
    });
    expect(effective.pictogramSequence[0]).toMatchObject({
      pictogramId: null,
      textOnly: true,
      originalToken: '不要'
    });
    expect(
      buildWorkspaceCorrectionMemory(saved, { workspaceId: 'test-family' })
        .rules
    ).toEqual([]);
  });
});
