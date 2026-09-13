import { careErrorMessage } from './careErrors';

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
