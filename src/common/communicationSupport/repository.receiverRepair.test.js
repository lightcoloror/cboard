import { createCommunicationRepository } from './repository';
import { getReceiverRepairSource, withReceiverRepair } from './receiverRepair';
import { mergeConfirmedReceiverRecords, buildConfirmedReceiverSyncPayload } from './receiverSync';

function fixture() {
  const values = new Map();
  let time = 100, id = 0;
  const open = () => createCommunicationRepository({
    storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    now: () => time++, createId: prefix => `${prefix}-${++id}`
  });
  const repo = open();
  const entry = { direction: 'receive', inputText: '合成人甲不喝水', labels: ['合成人甲', '不', '喝水'],
    output: [{ id: 'synthetic', label: '合成人甲', image: 'blob:synthetic-private-photo' }] };
  const source = repo.confirmReceiverDraft(repo.createReceiverDraft(entry), entry);
  repo.recordReceiverPatientFeedback(source.id, 'not_understood');
  return { repo, source, entry, open, idle: () => { time += 31 * 60 * 1000; } };
}
test('manual repair survives update, confirm, duplicate click, offline reopen without overwriting original', () => {
  const f = fixture(), before = f.repo.loadReceiverRecords().find(r => r.id === f.source.id);
  const draft = f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source));
  expect(f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source)).id).toBe(draft.id);
  const changed = { ...f.entry, inputText: '合成人甲不想喝水' };
  const updated = f.repo.updateReceiverDraft(draft, changed);
  const reopened = f.open(), restored = reopened.loadResumableReceiverRecord();
  expect(restored.repairOfRecordId).toBe(f.source.id);
  expect(getReceiverRepairSource(restored, reopened.loadReceiverRecords()).inputText).toBe(f.entry.inputText);
  const confirmed = reopened.confirmReceiverDraft(updated, changed);
  expect(reopened.confirmReceiverDraft(updated, changed)).toEqual(confirmed);
  expect(reopened.loadCommunicationHistory()).toHaveLength(2);
  expect(reopened.loadReceiverRecords().find(r => r.id === f.source.id)).toEqual(before);
  expect(buildConfirmedReceiverSyncPayload(reopened.loadReceiverRecords())).toEqual([]);
});
test('idle rotation preserves the original conversation lineage without restoring AI context', () => {
  const f = fixture();
  f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source));
  f.idle();
  const repo = f.open(), draft = repo.loadResumableReceiverRecord();
  expect(draft.sessionId).not.toBe(f.source.sessionId);
  expect(draft.repairSourceSessionId).toBe(f.source.sessionId);
  expect(getReceiverRepairSource(draft, repo.loadReceiverRecords()).id).toBe(f.source.id);
  expect(repo.loadConversationContext().turns).toEqual([]);
});
test('cancel returns the original resumable record and leaves original content unchanged', () => {
  const f = fixture(), draft = f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source));
  expect(f.repo.discardResumableReceiverRecord(draft.id)).toBe(true);
  expect(f.open().loadResumableReceiverRecord().id).toBe(f.source.id);
  expect(f.repo.loadCommunicationHistory()).toHaveLength(1);
});

test('idle restore then cancel retains original and allows one new repair in the carried conversation', () => {
  const f = fixture();
  f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source));
  f.idle();
  const repo = f.open(), carried = repo.loadResumableReceiverRecord();
  repo.discardResumableReceiverRecord(carried.id);
  expect(repo.loadResumableReceiverRecord().id).toBe(f.source.id);
  repo.recordReceiverPatientFeedback(f.source.id, 'not_understood');
  expect(repo.loadResumableReceiverRecord().id).toBe(f.source.id);
  const next = repo.createReceiverDraft(withReceiverRepair(f.entry, f.source));
  expect(next.repairSourceSessionId).toBe(f.source.sessionId);
  repo.discardResumableReceiverRecord(next.id);
  expect(repo.discardResumableReceiverRecord(f.source.id)).toBe(true);
  expect(repo.loadResumableReceiverRecord()).toBeNull();
  expect(repo.loadCommunicationHistory()).toHaveLength(1);
  repo.resetConversationSession();
  expect(() => repo.createReceiverDraft(withReceiverRepair(f.entry, f.source))).toThrow('source unavailable');
});
test('missing source keeps repair text usable, scope mismatch cannot expose another person', () => {
  const f = fixture(), draft = f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source));
  expect(getReceiverRepairSource(draft, [{ ...f.source, patientId: 'other' }])).toBeNull();
  expect(getReceiverRepairSource(draft, [{ ...f.source, workspaceId: 'other' }])).toBeNull();
  expect(getReceiverRepairSource(draft, [{ ...f.source, sessionId: 'other' }])).toBeNull();
  f.repo.overwriteReceiverRecords([draft]);
  const reopened = f.open().loadResumableReceiverRecord();
  expect(reopened.inputText).toBe(f.entry.inputText);
  expect(getReceiverRepairSource(reopened, [draft])).toBeNull();
});
test('rejects new links across conversations and prevents link injection on update', () => {
  const f = fixture();
  f.repo.resetConversationSession();
  expect(() => f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source))).toThrow('source unavailable');
  const draft = f.repo.createReceiverDraft(f.entry);
  expect(f.repo.updateReceiverDraft(draft, withReceiverRepair(f.entry, f.source)).repairOfRecordId).toBeUndefined();
});
test('remote history refresh preserves only this local scope linkage', () => {
  const f = fixture(), draft = f.repo.createReceiverDraft(withReceiverRepair(f.entry, f.source));
  const local = f.repo.confirmReceiverDraft(draft, f.entry);
  const remote = { ...local, serverVersion: 2, updatedAt: local.updatedAt + 100 };
  delete remote.repairOfRecordId; delete remote.repairSourceSessionId;
  expect(mergeConfirmedReceiverRecords([local], [remote])[0].repairOfRecordId).toBe(f.source.id);
  expect(mergeConfirmedReceiverRecords([local], [{ ...remote, patientId: 'other' }])[0].repairOfRecordId).toBeUndefined();
});
