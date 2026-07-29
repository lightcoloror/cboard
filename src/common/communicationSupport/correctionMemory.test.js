import boardsFixture from '../../api/boards.json';
import zhMessages from '../../translations/zh-CN.communication';
import {
  RECEIVER_CORRECTION_RECENCY_HALF_LIFE_MS,
  RECEIVER_CORRECTION_TOMBSTONE_RETENTION_MS,
  buildCorrectionMemoryManagementRows,
  buildWorkspaceCorrectionMemory,
  disableWorkspaceCorrectionMemoryToken
} from './correctionMemory';
import { createCommunicationRepository } from './repository';
import {
  RECEIVER_CORRECTION_ACTIONS,
  buildReceiverCorrectionFromEdit
} from './receiverLifecycle';
import {
  buildReceiverHistoryEntry,
  buildReceiverLoopState,
  deleteReceiverReviewItem
} from './receiverPipeline';

const boards = [
  {
    id: 'daily',
    name: '日常',
    tiles: [
      {
        id: 'water-default',
        label: '水',
        vocalization: '水',
        image: '/water-default.svg'
      },
      {
        id: 'water-preferred',
        label: '饮用水',
        vocalization: '饮用水',
        image: '/water-preferred.svg'
      }
    ]
  }
];

const realBoards = boardsFixture.advanced;
const realIntl = {
  messages: zhMessages,
  formatMessage: ({ id }) => zhMessages[id] || id
};

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

function createCorrection(overrides = {}) {
  return {
    id: 'correction-1',
    expressionId: 'receiver-1',
    workspaceId: 'workspace-a',
    action: 'replace_pictogram',
    originalToken: '水',
    normalizedToken: '水',
    pictogramIdBefore: 'water-default',
    pictogramIdAfter: 'water-preferred',
    isUsedForLearning: true,
    createdAt: 100,
    ...overrides
  };
}

describe('workspace receiver correction memory', () => {
  test('immediately reuses the latest learned replacement in the same workspace', () => {
    const memory = buildWorkspaceCorrectionMemory(
      [
        createCorrection({ id: 'first', createdAt: 90 }),
        createCorrection({ id: 'second', createdAt: 100 }),
        createCorrection({
          id: 'other-workspace',
          workspaceId: 'workspace-b',
          pictogramIdAfter: 'water-default',
          createdAt: 110
        }),
        createCorrection({
          id: 'learning-disabled',
          pictogramIdAfter: 'water-default',
          isUsedForLearning: false,
          createdAt: 120
        })
      ],
      { workspaceId: 'workspace-a', now: 100 }
    );
    const result = buildReceiverLoopState('水', boards, {
      preSegmented: ['水'],
      correctionMemory: memory,
      createId: () => 'review-1'
    });

    expect(result.reviewItems[0]).toEqual(
      expect.objectContaining({
        token: '水',
        matchType: 'manual',
        source: 'corrected'
      })
    );
    expect(result.reviewItems[0].tile.id).toBe('water-preferred');
    expect(memory.rules[0]).toEqual(
      expect.objectContaining({
        token: '水',
        preferredPictogramId: 'water-preferred',
        frequencyCount: 2,
        recencyWeight: 1,
        score: 2
      })
    );
  });

  test('decays the derived score without delaying the latest correction', () => {
    const memory = buildWorkspaceCorrectionMemory([createCorrection()], {
      workspaceId: 'workspace-a',
      now: 100 + RECEIVER_CORRECTION_RECENCY_HALF_LIFE_MS
    });

    expect(memory.rules[0].frequencyCount).toBe(1);
    expect(memory.rules[0].recencyWeight).toBeCloseTo(0.5);
    expect(memory.rules[0].score).toBeCloseTo(0.5);
  });

  test('suppresses a deleted token-picture pair for 90 days and then expires it', () => {
    const deleted = createCorrection({
      action: 'delete_pictogram',
      normalizedToken: '',
      pictogramIdBefore: 'water-default',
      pictogramIdAfter: null,
      createdAt: 200
    });
    const activeMemory = buildWorkspaceCorrectionMemory([deleted], {
      workspaceId: 'workspace-a',
      now: 201
    });
    const activeResult = buildReceiverLoopState('水', boards, {
      preSegmented: ['水'],
      correctionMemory: activeMemory
    });
    const expiredMemory = buildWorkspaceCorrectionMemory([deleted], {
      workspaceId: 'workspace-a',
      now: 200 + RECEIVER_CORRECTION_TOMBSTONE_RETENTION_MS
    });
    const expiredResult = buildReceiverLoopState('水', boards, {
      preSegmented: ['水'],
      correctionMemory: expiredMemory
    });

    expect(activeResult.reviewItems[0].tile).toBeNull();
    expect(activeResult.reviewItems[0].matchType).toBe('none');
    expect(activeMemory.rules[0].blockedPictogramIds).toEqual([
      'water-default'
    ]);
    expect(expiredMemory.rules).toEqual([]);
    expect(expiredResult.reviewItems[0].tile.id).toBe('water-default');
  });

  test('suppresses a deleted real CBoard pictogram after repository reload', () => {
    let timestamp = 1700000000000;
    let id = 0;
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => timestamp,
      createId: prefix => `${prefix}-${++id}`
    });
    const initial = buildReceiverLoopState('喝', realBoards, {
      intl: realIntl,
      preSegmented: ['喝'],
      createId: prefix => `${prefix}-drink`
    });
    const before = initial.reviewItems;
    const itemId = before[0].id;
    const deletedPictogramId = before[0].tile.id;
    const draft = repository.createReceiverDraft(
      buildReceiverHistoryEntry(initial.inputText, before)
    );
    const after = deleteReceiverReviewItem(before, itemId);

    timestamp += 1;
    repository.appendReceiverCorrection(
      buildReceiverCorrectionFromEdit(
        draft,
        RECEIVER_CORRECTION_ACTIONS.delete,
        before,
        after,
        itemId,
        { now: () => timestamp, createId: prefix => `${prefix}-delete` }
      )
    );

    const identity = repository.loadCommunicationIdentity();
    const storedCorrections = repository.loadReceiverCorrections();
    const memory = buildWorkspaceCorrectionMemory(storedCorrections, {
      workspaceId: identity.workspaceId,
      now: timestamp + 1
    });
    const rematched = buildReceiverLoopState('喝', realBoards, {
      intl: realIntl,
      preSegmented: ['喝'],
      correctionMemory: memory
    });

    expect(storedCorrections[0]).toEqual(
      expect.objectContaining({
        workspaceId: identity.workspaceId,
        pictogramIdBefore: deletedPictogramId,
        isUsedForLearning: true,
        createdAt: timestamp
      })
    );
    expect(memory.rules[0].blockedPictogramIds).toEqual([deletedPictogramId]);
    expect(rematched.reviewItems[0]).toEqual(
      expect.objectContaining({
        token: '喝',
        tile: null,
        matchType: 'none',
        source: 'corrected'
      })
    );
  });

  test('keeps manual deletion above auto resolution but allows a later caregiver decision', () => {
    const deleted = createCorrection({
      action: 'delete_pictogram',
      normalizedToken: '',
      pictogramIdBefore: 'water-default',
      pictogramIdAfter: null,
      createdAt: 200
    });
    const memory = buildWorkspaceCorrectionMemory([deleted], {
      workspaceId: 'workspace-a',
      now: 201
    });
    const createResolution = overrides => ({
      id: 'missing-water',
      normalizedToken: '水',
      status: 'resolved',
      resolvedPictogramId: 'water-default',
      source: 'catalog-auto',
      reviewedByCaregiver: false,
      updatedAt: 201,
      ...overrides
    });
    const autoResolved = buildReceiverLoopState('水', boards, {
      preSegmented: ['水'],
      correctionMemory: memory,
      missingTokenRecords: [createResolution()]
    });
    const olderCaregiverResolution = buildReceiverLoopState('水', boards, {
      preSegmented: ['水'],
      correctionMemory: memory,
      missingTokenRecords: [
        createResolution({
          source: 'caregiver',
          reviewedByCaregiver: true,
          updatedAt: 199
        })
      ]
    });
    const newerCaregiverResolution = buildReceiverLoopState('水', boards, {
      preSegmented: ['水'],
      correctionMemory: memory,
      missingTokenRecords: [
        createResolution({
          source: 'caregiver',
          reviewedByCaregiver: true,
          updatedAt: 202
        })
      ]
    });

    expect(autoResolved.reviewItems[0].tile).toBeNull();
    expect(olderCaregiverResolution.reviewItems[0].tile).toBeNull();
    expect(newerCaregiverResolution.reviewItems[0].tile.id).toBe(
      'water-default'
    );
  });

  test('disables one workspace token without deleting correction evidence', () => {
    const replacement = createCorrection({
      id: 'replacement',
      createdAt: 100
    });
    const deletion = createCorrection({
      id: 'deletion',
      action: 'delete_pictogram',
      normalizedToken: '',
      pictogramIdBefore: 'water-default',
      pictogramIdAfter: null,
      createdAt: 110
    });
    const otherToken = createCorrection({
      id: 'other-token',
      originalToken: '喝',
      normalizedToken: '喝',
      createdAt: 120
    });
    const otherWorkspace = createCorrection({
      id: 'other-workspace',
      workspaceId: 'workspace-b',
      createdAt: 130
    });
    const auditOnly = createCorrection({
      id: 'audit-only',
      action: 'reorder',
      createdAt: 140
    });
    const result = disableWorkspaceCorrectionMemoryToken(
      [replacement, deletion, otherToken, otherWorkspace, auditOnly],
      { workspaceId: 'workspace-a', token: ' 水 ' }
    );
    const memory = buildWorkspaceCorrectionMemory(result.items, {
      workspaceId: 'workspace-a',
      now: 150
    });

    expect(result.changed).toBe(true);
    expect(result.disabledCount).toBe(2);
    expect(result.items).toHaveLength(5);
    expect(
      result.items
        .filter(item => ['replacement', 'deletion'].includes(item.id))
        .every(item => item.isUsedForLearning === false)
    ).toBe(true);
    expect(
      result.items.find(item => item.id === 'other-token').isUsedForLearning
    ).toBe(true);
    expect(
      result.items.find(item => item.id === 'other-workspace').isUsedForLearning
    ).toBe(true);
    expect(result.items.find(item => item.id === 'audit-only').action).toBe(
      'reorder'
    );
    expect(memory.rules.map(rule => rule.token)).toEqual(['喝']);
  });

  test('builds caregiver-readable rows from the shared catalog', () => {
    const memory = buildWorkspaceCorrectionMemory(
      [
        createCorrection({ createdAt: 100 }),
        createCorrection({
          id: 'blocked',
          action: 'delete_pictogram',
          originalToken: '喝',
          normalizedToken: '',
          pictogramIdBefore: 'drink-blocked',
          pictogramIdAfter: null,
          createdAt: 110
        })
      ],
      { workspaceId: 'workspace-a', now: 120 }
    );
    const rows = buildCorrectionMemoryManagementRows(memory, [
      {
        id: 'water-preferred',
        displayLabel: '饮用水'
      },
      {
        tile: {
          id: 'drink-blocked',
          label: '喝'
        }
      }
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        token: '喝',
        preferredLabel: null,
        blockedLabels: ['喝'],
        lastCorrectedAt: 110
      }),
      expect.objectContaining({
        token: '水',
        preferredLabel: '饮用水',
        blockedLabels: [],
        frequencyCount: 1,
        lastCorrectedAt: 100
      })
    ]);
  });
});
