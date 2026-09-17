import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import Activate from './Activate.container';
import { activate } from './Activate.actions';
import { resendVerification } from '../SignUp/SignUp.actions';
jest.mock('../SignUp/SignUp.actions', () => ({
  resendVerification: jest.fn()
}));

let mockUrl = 'first';
const mockHistory = { replace: jest.fn() };
jest.mock('./Activate.actions', () => ({ activate: jest.fn() }));
jest.mock('react-router-dom', () => ({
  useParams: () => ({ url: mockUrl }),
  useHistory: () => mockHistory,
  Link: ({ children }) => <a>{children}</a>
}));
jest.mock('react-intl', () => ({
  defineMessages: value => value,
  FormattedMessage: ({ defaultMessage }) => <span>{defaultMessage}</span>
}));
let wrapper;
beforeEach(() => {
  jest.useFakeTimers();
  mockUrl = 'first';
});
afterEach(() => {
  if (wrapper) wrapper.unmount();
  wrapper = null;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.resetAllMocks();
});
async function render() {
  await act(async () => {
    wrapper = mount(<Activate />);
  });
  wrapper.update();
}
test('keeps failed activation visible without a timed redirect', async () => {
  activate.mockResolvedValue({ success: false });
  await render();
  expect(wrapper.text()).toContain('FAILED');
  act(() => jest.advanceTimersByTime(3000));
  expect(mockHistory.replace).not.toHaveBeenCalled();
});
test('lets a failed activation request a new email without leaving the page', async () => {
  activate.mockResolvedValue({ success: false });
  resendVerification.mockResolvedValue({ success: 1 });
  await render();
  expect(resendVerification).not.toHaveBeenCalled();
  act(() =>
    wrapper
      .find('input[type="email"]')
      .simulate('change', { target: { value: ' Family@Example.test ' } })
  );
  await act(async () => {
    wrapper.find('button').simulate('click');
  });
  wrapper.update();
  expect(resendVerification).toHaveBeenCalledWith('family@example.test');
  expect(wrapper.text()).toContain('请求已受理');
  expect(mockHistory.replace).not.toHaveBeenCalled();
});
test('redirects only after success and cancels scheduled navigation on unmount', async () => {
  activate.mockResolvedValue({ success: true });
  await render();
  expect(wrapper.text()).toContain('CONFIRMED');
  act(() => jest.advanceTimersByTime(2000));
  expect(mockHistory.replace).toHaveBeenCalledWith('/login-signup');
  mockHistory.replace.mockClear();
  wrapper.unmount();
  await render();
  wrapper.unmount();
  wrapper = null;
  act(() => jest.advanceTimersByTime(2000));
  expect(mockHistory.replace).not.toHaveBeenCalled();
});
test('ignores the old link response when another activation link is opened', async () => {
  let resolveOld;
  activate
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve;
        })
    )
    .mockResolvedValueOnce({ success: false });
  await render();
  mockUrl = 'second';
  await act(async () => {
    wrapper.setProps({});
  });
  await act(async () => {
    resolveOld({ success: true });
  });
  wrapper.update();
  expect(wrapper.text()).toContain('FAILED');
  act(() => jest.advanceTimersByTime(3000));
  expect(mockHistory.replace).not.toHaveBeenCalled();
});
