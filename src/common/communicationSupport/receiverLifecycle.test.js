import {
  RECEIVER_CORRECTION_ACTIONS,
  buildReceiverCorrectionFromEdit,
  buildReceiverCorrectionFromHistoryEdit,
  confirmReceiverDraftEntry,
  createReceiverDraftEntry,
  getEffectiveReceiverHistoryEntry,
  updateReceiverDraftEntry
} from './receiverLifecycle';

const historyEntry = {
  contractVersion: 1,
  direction: 'receive',
  inputText: '想喝水',
  labels: ['想', '水'],
  output: [{ id: 'want', label: '想' }, { id: 'water', label: '水' }]
};

function createId(prefix) {
  return `${prefix}-fixed`;
}

describe('receiverLifecycle', () => {
  test('creates, updates, and confirms one receiver record', () => {
    const draft = createReceiverDraftEntry(historyEntry, {
      identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
      now: () => 10,
      createId
    });

    expect(draft).toEqual(
      expect.objectContaining({
        id: 'receiver-fixed',
        sessionId: 'session-fixed',
        patientId: 'patient-1',
        workspaceId: 'workspace-1',
        recordStatus: 'draft',
        createdAt: 10,
        updatedAt: 10
      })
    );

    const updated = updateReceiverDraftEntry(
      draft,
      { ...historyEntry, labels: ['水'] },
      { now: () => 20 }
    );
    const confirmed = confirmReceiverDraftEntry(
      updated,
      { ...historyEntry, labels: ['水'] },
      { now: () => 30 }
    );

    expect(updated).toEqual(
      expect.objectContaining({
        id: draft.id,
        labels: ['水'],
        recordStatus: 'draft',
        createdAt: 10,
        updatedAt: 20
      })
    );
    expect(confirmed).toEqual(
      expect.objectContaining({
        id: draft.id,
        labels: ['水'],
        recordStatus: 'confirmed',
        confirmedAt: 30
      })
    );
  });

  test('captures replacement evidence with the full sequence', () => {
    const draft = createReceiverDraftEntry(historyEntry, {
      identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
      now: () => 10,
      createId
    });
    const before = [
      { id: 'review-1', token: '想', tile: { id: 'want' } },
      { id: 'review-2', token: '水', tile: { id: 'water' } }
    ];
    const after = [
      { id: 'review-2', token: '水', tile: { id: 'drink' } },
      { id: 'review-1', token: '想', tile: { id: 'want' } }
    ];

    expect(
      buildReceiverCorrectionFromEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.replace,
        before,
        after,
        'review-2',
        { now: () => 40, createId }
      )
    ).toEqual(
      expect.objectContaining({
        id: 'correction-fixed',
        expressionId: draft.id,
        action: 'replace_pictogram',
        originalToken: '水',
        sequenceIndexBefore: 1,
        sequenceIndexAfter: 0,
        pictogramIdBefore: 'water',
        pictogramIdAfter: 'drink',
        pictogramIdsBefore: ['want', 'water'],
        pictogramIdsAfter: ['drink', 'want'],
        isUsedForLearning: true,
        createdAt: 40
      })
    );
  });

  test('allows a caregiver session to opt out of correction learning', () => {
    const draft = createReceiverDraftEntry(historyEntry, {
      identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
      now: () => 10,
      createId
    });
    const before = [{ id: 'review-1', token: '水', tile: { id: 'water' } }];
    const after = [{ id: 'review-1', token: '水', tile: { id: 'drink' } }];

    expect(
      buildReceiverCorrectionFromEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.replace,
        before,
        after,
        'review-1',
        {
          now: () => 40,
          createId,
          isUsedForLearning: false
        }
      ).isUsedForLearning
    ).toBe(false);
  });

  test('captures insertion, deletion, and reordering evidence', () => {
    const draft = createReceiverDraftEntry(historyEntry, {
      identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
      now: () => 10,
      createId
    });
    const before = [
      { id: 'review-1', token: '想', tile: { id: 'want' } },
      { id: 'review-2', token: '水', tile: { id: 'water' } }
    ];
    const inserted = [
      before[0],
      { id: 'review-inserted', token: '喝', tile: { id: 'drink' } },
      before[1]
    ];
    const deleted = [before[0]];
    const reordered = [before[1], before[0]];

    expect(
      buildReceiverCorrectionFromEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.insert,
        before,
        inserted,
        'review-inserted',
        { now: () => 41, createId }
      )
    ).toEqual(
      expect.objectContaining({
        action: 'insert_pictogram',
        originalToken: '',
        normalizedToken: '喝',
        sequenceIndexBefore: null,
        sequenceIndexAfter: 1,
        pictogramIdBefore: null,
        pictogramIdAfter: 'drink',
        pictogramIdsBefore: ['want', 'water'],
        pictogramIdsAfter: ['want', 'drink', 'water']
      })
    );
    expect(
      buildReceiverCorrectionFromEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.delete,
        before,
        deleted,
        'review-2',
        { now: () => 42, createId }
      )
    ).toEqual(
      expect.objectContaining({
        action: 'delete_pictogram',
        originalToken: '水',
        normalizedToken: '',
        sequenceIndexBefore: 1,
        sequenceIndexAfter: null,
        pictogramIdBefore: 'water',
        pictogramIdAfter: null,
        pictogramIdsBefore: ['want', 'water'],
        pictogramIdsAfter: ['want']
      })
    );
    expect(
      buildReceiverCorrectionFromEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.reorder,
        before,
        reordered,
        'review-2',
        { now: () => 43, createId }
      )
    ).toEqual(
      expect.objectContaining({
        action: 'reorder',
        sequenceIndexBefore: 1,
        sequenceIndexAfter: 0,
        pictogramIdsBefore: ['want', 'water'],
        pictogramIdsAfter: ['water', 'want']
      })
    );
  });

  test('captures the before and after token sequence for manual resegmentation', () => {
    const draft = createReceiverDraftEntry(historyEntry, {
      identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
      now: () => 10,
      createId
    });
    const before = [
      { id: 'review-1', token: '我想', tile: { id: 'want' } },
      { id: 'review-2', token: '喝水', tile: { id: 'water' } }
    ];
    const after = [
      { id: 'review-3', token: '我', tile: { id: 'me' } },
      { id: 'review-4', token: '想', tile: { id: 'want' } },
      { id: 'review-5', token: '喝', tile: { id: 'drink' } },
      { id: 'review-6', token: '水', tile: { id: 'water' } }
    ];

    expect(
      buildReceiverCorrectionFromEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.resegment,
        before,
        after,
        'segmentation',
        { now: () => 50, createId }
      )
    ).toEqual(
      expect.objectContaining({
        action: 'resegment',
        originalToken: '我想 / 喝水',
        normalizedToken: '我 / 想 / 喝 / 水',
        sequenceIndexBefore: null,
        sequenceIndexAfter: null,
        pictogramIdsBefore: ['want', 'water'],
        pictogramIdsAfter: ['me', 'want', 'drink', 'water'],
        createdAt: 50
      })
    );
  });
  test('rejects edits after a receiver record is confirmed', () => {
    const draft = createReceiverDraftEntry(historyEntry, {
      identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
      createId
    });
    const confirmed = confirmReceiverDraftEntry(draft, historyEntry);

    expect(() => updateReceiverDraftEntry(confirmed, historyEntry)).toThrow(
      'active draft'
    );
  });

  test('projects caregiver history corrections without mutating the confirmed record', () => {
    const draft = createReceiverDraftEntry(historyEntry, {
      identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
      now: () => 10,
      createId
    });
    const confirmed = confirmReceiverDraftEntry(draft, historyEntry, {
      now: () => 20
    });
    const before = [
      {
        id: 'review-water',
        token: '水',
        matchType: 'exact',
        tile: {
          id: 'water',
          boardId: 'home',
          displayLabel: '水',
          tile: { id: 'water', label: '水', image: '/water.png' }
        }
      }
    ];
    const after = [
      {
        id: 'review-water',
        token: '喝',
        matchType: 'manual',
        source: 'corrected',
        tile: {
          id: 'drink',
          boardId: 'home',
          displayLabel: '喝',
          tile: { id: 'drink', label: '喝', image: '/drink.png' }
        }
      }
    ];
    const correction = buildReceiverCorrectionFromHistoryEdit(
      confirmed,
      RECEIVER_CORRECTION_ACTIONS.replace,
      before,
      after,
      'review-water',
      { now: () => 30, createId }
    );
    const projected = getEffectiveReceiverHistoryEntry(confirmed, [correction]);

    expect(correction).toEqual(
      expect.objectContaining({
        context: 'caregiver_history_review',
        expressionId: confirmed.id,
        revisionBefore: expect.objectContaining({ labels: ['水'] }),
        revisionAfter: expect.objectContaining({ labels: ['喝'] })
      })
    );
    expect(projected).toEqual(
      expect.objectContaining({
        id: confirmed.id,
        labels: ['喝'],
        pictogramSequence: [
          expect.objectContaining({
            pictogramId: 'drink',
            originalToken: '喝'
          })
        ],
        receiverHistoryRevision: {
          correctionId: 'correction-fixed',
          createdAt: 30
        }
      })
    );
    expect(confirmed.labels).toEqual(['想', '水']);
    expect(confirmed).not.toHaveProperty('receiverHistoryRevision');
  });

  test('rejects caregiver history correction for an unconfirmed draft', () => {
    const draft = createReceiverDraftEntry(historyEntry, { createId });

    expect(() =>
      buildReceiverCorrectionFromHistoryEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.delete,
        [],
        [],
        'review-water'
      )
    ).toThrow('confirmed receive record');
  });
});
