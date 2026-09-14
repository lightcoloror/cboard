import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ResendVerification from './ResendVerification';
import { resendVerification } from './SignUp.actions';
jest.mock('./SignUp.actions', () => ({ resendVerification: jest.fn() }));
let wrapper;
afterEach(() => {
  if (wrapper) wrapper.unmount();
  jest.resetAllMocks();
});
async function submit() {
  await act(async () => {
    wrapper.find('button').simulate('click');
  });
  wrapper.update();
}
test('invalid email never sends a request', async () => {
  wrapper = mount(<ResendVerification email="invalid" />);
  await submit();
  expect(resendVerification).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('有效的邮箱');
});
test('resends with only normalized email and reports acceptance, not delivery', async () => {
  resendVerification.mockResolvedValue({ success: 1 });
  wrapper = mount(<ResendVerification email=" Family@Example.invalid " />);
  await submit();
  expect(resendVerification).toHaveBeenCalledWith('family@example.invalid');
  expect(wrapper.text()).toContain('请求已受理');
  expect(wrapper.text()).not.toContain('发送成功');
});
test.each([
  [
    {
      response: {
        status: 503,
        data: { error: { code: 'MAIL_SERVICE_UNAVAILABLE' } }
      }
    },
    '服务暂不可用'
  ],
  [{ response: { status: 429 } }, '请求过于频繁'],
  [new Error('network'), '检查网络']
])('shows recoverable failure %s', async (error, text) => {
  resendVerification.mockRejectedValue(error);
  wrapper = mount(<ResendVerification email="family@example.invalid" />);
  await submit();
  expect(wrapper.text()).toContain(text);
  expect(wrapper.find('button').prop('disabled')).toBe(false);
});
test('does not show an old email request result after changing email', async () => {
  let finish;
  resendVerification.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  wrapper = mount(<ResendVerification email="first@example.invalid" />);
  act(() => {
    wrapper.find('button').simulate('click');
  });
  act(() => {
    wrapper.setProps({ email: 'second@example.invalid' });
  });
  await act(async () => {
    finish({ success: 1 });
  });
  wrapper.update();
  expect(wrapper.text()).not.toContain('请求已受理');
});
