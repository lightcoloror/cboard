import { createCommunicationRepository } from './repository';
import {
  RECEIVER_CORRECTION_ACTIONS,
  buildReceiverCorrectionFromEdit,
  buildReceiverCorrectionFromHistoryEdit
} from './receiverLifecycle';

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

const receiverEntry = {
  contractVersion: 1,
  direction: 'receive',
  inputText: '想喝水',
  labels: ['想', '水'],
  output: [{ id: 'want', label: '想' }, { id: 'water', label: '水' }],
  pictogramSequence: [
    {
      pictogramId: 'water',
      label: '水',
      source: 'local_dict',
      boardId: 'home',
      matchType: 'exact',
      confidence: 1,
      originalToken: '水'
    }
  ]
};

describe('communication repository receiver lifecycle', () => {
  test('keeps drafts private until fullscreen confirmation', () => {
    const storage = createMemoryStorage();
    let timestamp = 0;
    let id = 0;
    const repository = createCommunicationRepository({
      storage,
      now: () => ++timestamp,
      createId: prefix => `${prefix}-${++id}`
    });

    const draft = repository.createReceiverDraft(receiverEntry);

    expect(draft).toEqual(
      expect.objectContaining({
        recordStatus: 'draft',
        patientId: expect.stringMatching(/^patient-/),
        workspaceId: expect.stringMatching(/^workspace-/)
      })
    );
    expect(repository.loadCommunicationHistory()).toEqual([]);
    expect(repository.loadReceiverRecords()).toEqual([
      expect.objectContaining({ id: draft.id, recordStatus: 'draft' })
    ]);

    const confirmed = repository.confirmReceiverDraft(draft, receiverEntry);

    expect(confirmed.recordStatus).toBe('confirmed');
    expect(repository.loadReceiverRecords()[0].recordStatus).toBe('confirmed');
    expect(repository.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        id: draft.id,
        direction: 'receive',
        recordStatus: 'confirmed'
      })
    );
  });

  test('keeps one resumable draft per identity and session', () => {
    const storage = createMemoryStorage();
    let timestamp = 0;
    let id = 0;
    const repository = createCommunicationRepository({
      storage,
      now: () => ++timestamp,
      createId: prefix => `${prefix}-${++id}`
    });

    const first = repository.createReceiverDraft(receiverEntry);
    const second = repository.createReceiverDraft({
      ...receiverEntry,
      inputText: '需要休息'
    });

    expect(second.id).not.toBe(first.id);
    expect(
      repository
        .loadReceiverRecords()
        .filter(record => record.recordStatus === 'draft')
    ).toEqual([
      expect.objectContaining({
        id: second.id,
        inputText: '需要休息'
      })
    ]);
    expect(repository.loadResumableReceiverRecord()).toEqual(
      expect.objectContaining({ id: second.id })
    );
    expect(repository.discardResumableReceiverRecord(second.id)).toBe(true);
    expect(repository.loadResumableReceiverRecord()).toBeNull();
  });

  test('persists caregiver corrections outside visible history', () => {
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => 100,
      createId: prefix => `${prefix}-fixed`
    });
    const draft = repository.createReceiverDraft(receiverEntry);
    const before = [{ id: 'review-water', token: '水', tile: { id: 'water' } }];
    const after = [{ id: 'review-water', token: '水', tile: { id: 'drink' } }];
    const correction = buildReceiverCorrectionFromEdit(
      draft,
      RECEIVER_CORRECTION_ACTIONS.replace,
      before,
      after,
      'review-water',
      { now: () => 101, createId: prefix => `${prefix}-1` }
    );

    repository.appendReceiverCorrection(correction);

    expect(repository.loadReceiverCorrections()).toEqual([
      expect.objectContaining({
        expressionId: draft.id,
        action: 'replace_pictogram',
        pictogramIdBefore: 'water',
        pictogramIdAfter: 'drink',
        pictogramIdsBefore: ['water'],
        pictogramIdsAfter: ['drink'],
        isUsedForLearning: true
      })
    ]);
    expect(repository.loadCommunicationHistory()).toEqual([]);
  });

  test('persists historical review snapshots separately from the original record', () => {
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => 100,
      createId: prefix => `${prefix}-fixed`
    });
    const draft = repository.createReceiverDraft(receiverEntry);
    const confirmed = repository.confirmReceiverDraft(draft, receiverEntry);
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
        tile: {
          id: 'drink',
          boardId: 'home',
          displayLabel: '喝',
          tile: { id: 'drink', label: '喝', image: '/drink.png' }
        }
      }
    ];

    repository.appendReceiverCorrection(
      buildReceiverCorrectionFromHistoryEdit(
        confirmed,
        RECEIVER_CORRECTION_ACTIONS.replace,
        before,
        after,
        'review-water',
        { now: () => 101, createId: prefix => `${prefix}-history` }
      )
    );

    expect(repository.loadReceiverCorrections()[0]).toEqual(
      expect.objectContaining({
        context: 'caregiver_history_review',
        expressionId: confirmed.id,
        revisionAfter: expect.objectContaining({
          labels: ['喝'],
          pictogramSequence: [expect.objectContaining({ pictogramId: 'drink' })]
        })
      })
    );
    expect(repository.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        id: confirmed.id,
        labels: receiverEntry.labels
      })
    );
  });

  test('persists patient feedback on the confirmed record and visible history', () => {
    let timestamp = 10;
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => ++timestamp,
      createId: prefix => `${prefix}-fixed`
    });
    const draft = repository.createReceiverDraft(receiverEntry);
    const confirmed = repository.confirmReceiverDraft(draft, receiverEntry);
    const feedback = repository.recordReceiverPatientFeedback(
      confirmed.id,
      'not_understood'
    );

    expect(feedback).toEqual(
      expect.objectContaining({
        id: confirmed.id,
        recordStatus: 'confirmed',
        patientFeedback: 'not_understood',
        patientFeedbackEvents: [
          expect.objectContaining({ type: 'not_understood' })
        ]
      })
    );
    expect(repository.loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        id: confirmed.id,
        patientFeedback: 'not_understood'
      })
    );
    expect(repository.loadResumableReceiverRecord()).toEqual(
      expect.objectContaining({
        id: confirmed.id,
        patientFeedback: 'not_understood'
      })
    );
    expect(repository.discardResumableReceiverRecord(confirmed.id)).toBe(true);
    expect(repository.loadResumableReceiverRecord()).toBeNull();
    repository.recordReceiverPatientFeedback(confirmed.id, 'not_understood');
    repository.recordReceiverPatientFeedback(confirmed.id, 'understood');
    expect(repository.loadResumableReceiverRecord()).toBeNull();
    expect(
      repository.recordReceiverPatientFeedback('missing-record', 'understood')
    ).toBeNull();
  });

  test('overwrites normalized correction learning flags without deleting audit rows', () => {
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      now: () => 100,
      createId: prefix => `${prefix}-fixed`
    });
    const draft = repository.createReceiverDraft(receiverEntry);
    const correction = buildReceiverCorrectionFromEdit(
      draft,
      RECEIVER_CORRECTION_ACTIONS.replace,
      [{ id: 'review-water', token: '水', tile: { id: 'water' } }],
      [{ id: 'review-water', token: '水', tile: { id: 'drink' } }],
      'review-water',
      { now: () => 101, createId: prefix => `${prefix}-1` }
    );

    repository.appendReceiverCorrection(correction);
    const saved = repository.overwriteReceiverCorrections([
      {
        ...correction,
        isUsedForLearning: false
      }
    ]);

    expect(saved).toEqual([
      expect.objectContaining({
        id: correction.id,
        action: 'replace_pictogram',
        isUsedForLearning: false
      })
    ]);
    expect(repository.loadReceiverCorrections()).toEqual(saved);
  });

  test('reuses stable anonymous patient and workspace identities', () => {
    const repository = createCommunicationRepository({
      storage: createMemoryStorage(),
      createId: prefix => `${prefix}-stable`
    });

    expect(repository.loadCommunicationIdentity()).toEqual(
      repository.loadCommunicationIdentity()
    );
  });
});
