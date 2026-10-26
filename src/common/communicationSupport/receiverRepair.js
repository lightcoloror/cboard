export const RECEIVER_PARTNER_GUIDANCE =
  '等对方回应；一次说一个意思；可以用指图、手势或是／否回答；核对理解，不替对方作答。';

export function getReceiverRepairSource(record, records = []) {
  if (!record || !record.repairOfRecordId) return null;
  return records.find(source => source.id === record.repairOfRecordId &&
    source.id !== record.id && source.direction === 'receive' &&
    source.recordStatus === 'confirmed' && source.patientId === record.patientId &&
    source.workspaceId === record.workspaceId &&
    source.sessionId === (record.repairSourceSessionId || record.sessionId)) || null;
}

export function withReceiverRepair(entry, source) {
  return source && source.recordStatus === 'confirmed'
    ? { ...entry, repairOfRecordId: source.id }
    : entry;
}
