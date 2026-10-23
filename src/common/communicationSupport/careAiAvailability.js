// Reuse the existing trial boundary and funding selection. This is a UI gate;
// the server remains responsible for entitlement, profile and spending grants.
export function careTextAiEnabled() {
  return (
    process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL !== 'true' ||
    process.env.REACT_APP_CARE_AI_TRIAL === 'true'
  );
}

// Pure policy shared by Web and Taro; it never reads storage or sends requests.
export function evaluateCareTextAiAvailability({
  enabled, isLogged, accountId, careMode, profile, fundingId,
  storageFailed = false, quotaInsufficient = false
} = {}) {
  const unavailable = (message, action = '', code = '') => ({ available: false, message, action, code });
  if (!enabled)
    return unavailable(
      '本次试用尚未开放在线 AI；本地分词和图片匹配可继续使用。', '', 'TEXT_AI_DISABLED'
    );
  if (!isLogged)
    return unavailable(
      '请先登录，再使用在线 AI；本地分词和图片匹配可继续使用。', 'login', 'LOGIN_REQUIRED'
    );
  if (!careMode) return { available: true, message: '' };
  if (!accountId)
    return unavailable('请重新登录以确认当前账号；本地结果仍保留。', 'login', 'LOGIN_REQUIRED');
  if (storageFailed)
    return unavailable('无法读取当前档案与额度来源，请在家庭设置中重新选择；本地结果仍保留。', 'care', 'AI_REQUEST_STORAGE_UNAVAILABLE');
  if (!profile || !profile.id)
    return unavailable('请先在家庭设置中选择患者档案，再使用在线 AI。', 'care', 'PROFILE_REQUIRED');
  if (profile.locked)
    return unavailable('当前患者档案的云端访问已锁定，请在家庭设置中核对授权。', 'care', 'PROFILE_ACCESS_DENIED');
  if (!fundingId)
    return unavailable('请先在家庭设置中选择 AI 额度来源；不会自动扣用其他家庭的额度。', 'care', 'EXPLICIT_FUNDING_REQUIRED');
  if (quotaInsufficient)
    return unavailable('当前来源的 AI 额度不足，请在家庭设置中核对；不会自动切换额度来源。', 'care', 'AI_QUOTA_EXCEEDED');
  return { available: true, message: '' };
}

export function getCareTextAiAvailability({
  isLogged, accountId, careMode, storage = window.localStorage
} = {}) {
  const input = { enabled: careTextAiEnabled(), isLogged, accountId, careMode };
  if (!input.enabled || !isLogged || !careMode || !accountId)
    return evaluateCareTextAiAvailability(input);
  try {
    const profile = JSON.parse(
      storage.getItem(`care-selection-v1:${accountId}`) || 'null'
    );
    const fundingId = profile?.id && storage.getItem(`care-funding-v1:${accountId}:${profile.id}`);
    return evaluateCareTextAiAvailability({ ...input, profile, fundingId });
  } catch (_) {
    return evaluateCareTextAiAvailability({ ...input, storageFailed: true });
  }
}
