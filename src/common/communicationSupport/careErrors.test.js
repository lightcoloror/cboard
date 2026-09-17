import { careErrorMessage } from './careErrors';

test('creation throttles preserve local use and distinguish unavailable limit storage', () => {
  for (const kind of ['FAMILY', 'PROFILE']) {
    expect(
      careErrorMessage({ data: { code: `CARE_${kind}_CREATE_RATE_LIMITED` } })
    ).toContain('本机沟通仍可使用');
    expect(
      careErrorMessage({
        data: { code: `CARE_${kind}_CREATE_RATE_LIMIT_UNAVAILABLE` }
      })
    ).toContain('尚未创建');
  }
});

test('network outage retains a distinct message from authentication and revocation', () => {
  expect(careErrorMessage(new TypeError('Failed to fetch'))).toContain(
    '待同步修改会在恢复连接后上传'
  );
  expect(
    careErrorMessage({ status: 401, message: 'Failed to fetch' })
  ).toContain('登录已失效');
  expect(
    careErrorMessage({ status: 403, code: 'PROFILE_ACCESS_DENIED' })
  ).toContain('撤销或尚未授权');
  expect(careErrorMessage(new TypeError('Unexpected programming error'))).toBe(
    'Unexpected programming error'
  );
});

test('maps public trial claim outcomes without implying payment or email delivery', () => {
  expect(
    careErrorMessage({ data: { code: 'TRIAL_NOT_CONFIGURED' } })
  ).toContain('尚未配置');
  expect(
    careErrorMessage({ data: { code: 'TRIAL_FAMILY_ALREADY_CLAIMED' } })
  ).toContain('已经领取过');
  expect(
    careErrorMessage({ data: { code: 'CARE_TRIAL_RATE_LIMITED' } })
  ).toContain('过于频繁');
  expect(
    careErrorMessage({ data: { code: 'CARE_TRIAL_UNAVAILABLE' } })
  ).toContain('未完成');
  expect(careErrorMessage({ data: { code: 'TRIAL_CLAIM_CORRUPT' } })).toContain(
    '联系支持人员处理'
  );
  expect(
    careErrorMessage({ data: { code: 'FAMILY_MEDIA_QUOTA_EXCEEDED' } })
  ).toContain('存储空间或文件数已达上限');
  expect(
    careErrorMessage({ data: { code: 'MEDIA_QUOTA_NOT_CONFIGURED' } })
  ).toContain('尚未配置');
  expect(
    careErrorMessage({ data: { code: 'MEDIA_UPLOAD_PENDING_RECONCILIATION' } })
  ).toContain('本地修改仍待同步');
  expect(
    careErrorMessage({ data: { code: 'MEDIA_UPLOAD_RECONCILIATION_REQUIRED' } })
  ).toContain('需要核对');
  expect(
    careErrorMessage({ data: { code: 'MEDIA_QUOTA_RECONCILIATION_REQUIRED' } })
  ).toContain('额度状态需要核对');
  expect(careErrorMessage({ data: { code: 'MEDIA_FILE_DELETED' } })).toContain(
    '不能继续上传此版本'
  );
});
