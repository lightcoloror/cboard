export function careErrorMessage(error) {
  const code = error?.data?.code || error?.response?.data?.code || error?.code;
  const messages = {
    PROFILE_ACCESS_DENIED: '此患者档案的访问已撤销或尚未授权。',
    SUBSCRIPTION_EXPIRED:
      '订阅已到期，新增同步暂停；本地内容和待同步修改仍然保留。',
    DOWNLOAD_PERIOD_ENDED:
      '30 天云端下载期已结束；已有本地内容仍可使用和导出。',
    AI_QUOTA_EXCEEDED:
      '当前来源的 AI 额度不足，请等待重置或自行选择可用的其他额度来源。',
    DELEGATED_QUOTA_EXCEEDED: '已达到家庭或机构授予您的 AI 使用限额。',
    EXPLICIT_FUNDING_REQUIRED: '请先在设置中明确选择 AI 额度来源。',
    AI_PRICE_POLICY_NOT_CONFIGURED: 'AI 计量策略尚未配置，暂未启用付费 AI。',
    AI_REQUEST_PENDING_RECONCILIATION:
      '这次 AI 请求的结果尚待核对，系统不会重复执行或扣减。',
    AI_REQUEST_ALREADY_COMPLETED: '这次 AI 请求已处理，不会重复执行或扣减。',
    FUNDING_ACCESS_DENIED: '没有使用此额度来源的授权，请在设置中核对。'
  };
  if (messages[code]) return messages[code];
  if (error?.status === 401 || error?.response?.status === 401)
    return '登录已失效，请重新登录；本地内容仍保留。';
  if (
    !error?.status &&
    !error?.response?.status &&
    [
      'Failed to fetch',
      'Network request failed',
      'Load failed',
      'NetworkError when attempting to fetch resource.'
    ].includes(error?.message)
  )
    return '暂时无法连接云端；本地内容可继续使用，待同步修改会在恢复连接后上传。';
  return error?.message || '暂时无法连接；本地修改保留，联网后可继续同步。';
}
