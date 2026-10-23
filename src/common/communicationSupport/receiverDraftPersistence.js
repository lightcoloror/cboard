import { normalizeCommunicationReceiverRecords } from './storage';

// Compare the same normalized snapshot on both sides of the storage adapter.
// IDs/timestamps/session metadata do not describe the content shown for review.
export function receiverDraftContentSignature(entry) {
  if (!entry) return '';
  const normalized = normalizeCommunicationReceiverRecords([{
    ...entry, id: 'signature', createdAt: 1, updatedAt: 1,
    direction: 'receive', recordStatus: 'draft'
  }])[0];
  if (!normalized) return '';
  return JSON.stringify([normalized.inputText || '', normalized.output || [], normalized.pictogramSequence || []]);
}
