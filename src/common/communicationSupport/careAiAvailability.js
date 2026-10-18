// Reuse the existing trial boundary and funding selection. This is a UI gate;
// the server remains responsible for entitlement, profile and spending grants.
export function careTextAiEnabled() {
  return (
    process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL !== 'true' ||
    process.env.REACT_APP_CARE_AI_TRIAL === 'true'
  );
}

export function getCareTextAiAvailability({
  isLogged,
  accountId,
  careMode,
  storage = window.localStorage
} = {}) {
  const unavailable = message => ({ available: false, message });
  if (!careTextAiEnabled())
    return unavailable(
      '本次试用尚未开放在线 AI；本地分词和图片匹配可继续使用。'
    );
  if (!isLogged)
    return unavailable(
      '请先登录，再使用在线 AI；本地分词和图片匹配可继续使用。'
    );
  if (!careMode) return { available: true, message: '' };
  if (!accountId)
    return unavailable('请重新登录以确认当前账号；本地结果仍保留。');
  try {
    const profile = JSON.parse(
      storage.getItem(`care-selection-v1:${accountId}`) || 'null'
    );
    if (!profile || !profile.id)
      return unavailable('请先在家庭设置中选择患者档案，再使用在线 AI。');
    if (profile.locked)
      return unavailable(
        '当前患者档案的云端访问已锁定，请在家庭设置中核对授权。'
      );
    const funding = storage.getItem(
      `care-funding-v1:${accountId}:${profile.id}`
    );
    if (!funding)
      return unavailable(
        '请先在家庭设置中选择 AI 额度来源；不会自动扣用其他家庭的额度。'
      );
    return { available: true, message: '' };
  } catch (_) {
    return unavailable(
      '无法读取当前档案与额度来源，请在家庭设置中重新选择；本地结果仍保留。'
    );
  }
}
