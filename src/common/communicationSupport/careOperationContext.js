import { currentImageOperationEpoch } from './imageOperationEpoch';

// A local continuation check, reusing the existing cleanup generation. It does
// not cancel server work, revoke a session, or create persistent operation data.
export function captureCareOperation({ identity = () => null, isCurrent = () => true } = {}) {
  const who = identity();
  const epoch = currentImageOperationEpoch();
  return () => epoch === currentImageOperationEpoch() && isCurrent() &&
    identity()?.id === who?.id && identity()?.token === who?.token;
}

export function assertCareOperation(isCurrent) {
  if (!isCurrent()) throw Object.assign(new Error('旧操作已停止，请重新选择。'), {
    code: 'CARE_OPERATION_CANCELLED'
  });
}
