export function careErrorMessage(error) {
  const code = error?.data?.code || error?.response?.data?.code || error?.code;
  const messages = {
    CARE_STORAGE_UNAVAILABLE:
      '云端存储暂时不可用；本地内容和待同步修改仍保留，请稍后重试。',
    SESSION_STORAGE_UNAVAILABLE:
      '登录服务暂时不可用，请稍后重试；本地内容仍保留。',
    FAVORITE_ADMIN_REQUIRED:
      '您无权修改这项共享收藏；本机修改已保留，请联系家庭管理员处理。',
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
    FUNDING_ACCESS_DENIED: '没有使用此额度来源的授权，请在设置中核对。',
    CARE_TRIAL_DISABLED: '家庭体验暂未开放。',
    TRIAL_NOT_CONFIGURED: '家庭体验尚未配置，暂不可开通。',
    TRIAL_ACCOUNT_ALREADY_CLAIMED: '此账号已经领取过家庭体验。',
    TRIAL_FAMILY_ALREADY_CLAIMED: '此家庭已经领取过家庭体验。',
    FAMILY_OWNER_REQUIRED: '只有家庭管理员可以开通家庭体验。',
    CARE_TRIAL_RATE_LIMITED: '体验开通请求过于频繁，请稍后再试。',
    CARE_TRIAL_RATE_LIMIT_UNAVAILABLE: '体验服务暂时不可用，请稍后再试。',
    CARE_TRIAL_UNAVAILABLE: '体验开通未完成，请稍后重试。',
    FAMILY_NOT_FOUND: '找不到这个家庭，请刷新家庭列表后重试。',
    CARE_FAMILY_CREATE_RATE_LIMITED:
      '创建家庭过于频繁，请稍后再试；已有家庭和本机沟通仍可使用。',
    CARE_PROFILE_CREATE_RATE_LIMITED:
      '创建患者档案过于频繁，请稍后再试；已有档案和本机沟通仍可使用。',
    CARE_FAMILY_CREATE_RATE_LIMIT_UNAVAILABLE:
      '家庭创建服务暂不可用，尚未创建，请稍后再试。',
    CARE_PROFILE_CREATE_RATE_LIMIT_UNAVAILABLE:
      '档案创建服务暂不可用，尚未创建，请稍后再试。',
    ACCOUNT_VERIFICATION_REQUIRED: '请先完成账号验证，再开通家庭体验。',
    TRIAL_SUBSCRIPTION_EXISTS: '此家庭已有有效服务，不能重复开通体验。',
    TRIAL_FUNDING_CONFLICT: '家庭体验状态正在变更，请刷新后重试。',
    TRIAL_CLAIM_CORRUPT: '家庭体验记录异常，请联系支持人员处理。',
    RETRY_CONCURRENT_CHANGE: '家庭状态刚刚发生变化，请刷新后重试。',
    INVALID_TRIAL_CLAIM: '家庭体验请求无效，请刷新后重试。',
    FAMILY_MEDIA_QUOTA_EXCEEDED:
      '家庭云存储空间或文件数已达上限；本地内容仍保留。',
    MEDIA_QUOTA_NOT_CONFIGURED: '家庭云存储服务尚未配置，暂不可上传。',
    MEDIA_UPLOAD_PENDING_RECONCILIATION:
      '上传尚未完成，本地修改仍待同步。请稍后重试；若持续失败，请联系支持人员。',
    MEDIA_UPLOAD_RECONCILIATION_REQUIRED:
      '上传状态需要核对，系统已保留本地内容，请联系支持人员处理。',
    MEDIA_QUOTA_RECONCILIATION_REQUIRED:
      '家庭云存储额度状态需要核对，系统已保留本地内容，请联系支持人员处理。',
    MEDIA_FILE_DELETED: '该云端媒体已删除，不能继续上传此版本。'
  };
  if (messages[code]) return messages[code];
  if (error?.status === 401 || error?.response?.status === 401)
    return '登录已失效，请重新登录；本地内容仍保留。';
  if (error?.errMsg?.includes('url not in domain list'))
    return '当前客户端未获准连接配置的云端地址，请联系管理员检查服务配置；本地内容仍保留。';
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
