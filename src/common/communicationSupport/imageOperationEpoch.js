// In-memory only: invalidate outstanding checks/downloads at privacy cleanup.
let epoch = 0;
export function currentImageOperationEpoch() { return epoch; }
export function invalidateImageOperations() { epoch += 1; }
