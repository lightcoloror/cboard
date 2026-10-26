import React from 'react';
import { shallow, mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import Dialog from '@material-ui/core/Dialog';
import Button from '@material-ui/core/Button';
import IconButton from '../../UI/IconButton';

import EditToolbar from './EditToolbar.component';

jest.mock('../../PremiumFeature', () => ({ children }) => <>{children}</>);
jest.mock('../../UI/SelectedCounter', () => () => null);
jest.mock('./EditToolbar.messages', () => ({ __esModule: true,
  default: new Proxy({}, { get: (_, key) => ({ id: String(key), defaultMessage: String(key) }) })
}));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const wrappers = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => { if (wrapper.length) wrapper.unmount(); }); });
function setup(extra = {}) {
  const props = {
    board: { id: 'board-a', name: 'Synthetic' },
    intl: { formatMessage: message => message.defaultMessage },
    isSelecting: true, selectedItemsCount: 1, copiedTiles: [],
    deleteContextKey: 'scope-a', onDeleteClick: jest.fn().mockResolvedValue(true),
    ...extra
  };
  const Component = EditToolbar.WrappedComponent || EditToolbar;
  const wrapper = mount(<Component {...props} />);
  wrappers.push(wrapper);
  const open = () => act(() => wrapper.find(IconButton).at(0).prop('onClick')());
  const accept = () => wrapper.find(Dialog).find(Button).filterWhere(button => button.prop('autoFocus')).prop('onClick')();
  const cancel = () => act(() => wrapper.find(Dialog).prop('onClose')());
  open(); wrapper.update();
  return { props, wrapper, open, accept, cancel };
}

it('renders without crashing', () => {
  shallow(<EditToolbar selectedItemsCount={42} />);
});

test('waits for verified true and blocks duplicate clicks before closing delete confirmation', async () => {
  const gate = deferred();
  const { props, wrapper, accept } = setup({ onDeleteClick: jest.fn(() => gate.promise) });
  let result;
  act(() => { result = accept(); accept(); });
  wrapper.update();
  expect(wrapper.find(Dialog).prop('open')).toBe(true);
  expect(props.onDeleteClick).toHaveBeenCalledTimes(1);
  expect(props.onDeleteClick.mock.calls[0][0].guard()).toBe(true);
  expect(wrapper.find(Dialog).find(Button).filterWhere(button => button.prop('autoFocus')).prop('disabled')).toBe(true);
  await act(async () => { gate.resolve(true); await result; });
  wrapper.update();
  expect(wrapper.find(Dialog).prop('open')).toBe(false);
});

test.each(['false', 'reject', 'undefined'])('unconfirmed %s keeps the original delete button available for retry', async mode => {
  const gate = deferred();
  const callback = jest.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(true);
  const { wrapper, accept } = setup({ onDeleteClick: callback });
  let result;
  act(() => { result = accept(); });
  await act(async () => {
    if (mode === 'reject') gate.reject(new Error('synthetic write failure'));
    else gate.resolve(mode === 'false' ? false : undefined);
    await result;
  });
  wrapper.update();
  expect(wrapper.find(Dialog).prop('open')).toBe(true);
  expect(wrapper.find('[role="alert"]').text()).toContain('deleteFailed');
  expect(wrapper.find(Dialog).find(Button).filterWhere(button => button.prop('autoFocus')).prop('disabled')).toBe(false);
  await act(async () => { await accept(); });
  wrapper.update();
  expect(callback).toHaveBeenCalledTimes(2);
  expect(wrapper.find(Dialog).prop('open')).toBe(false);
});

test.each(['resolve', 'reject'])('cancellation invalidates the container guard and ignores late %s after reopening', async outcome => {
  const old = deferred(), next = deferred();
  const callback = jest.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => next.promise);
  const { wrapper, open, accept, cancel } = setup({ onDeleteClick: callback });
  let first, second;
  act(() => { first = accept(); });
  const guard = callback.mock.calls[0][0].guard;
  cancel(); open(); wrapper.update();
  act(() => { second = accept(); });
  expect(guard()).toBe(false);
  await act(async () => { outcome === 'resolve' ? old.resolve(true) : old.reject(new Error('late')); await first; });
  wrapper.update();
  expect(wrapper.find(Dialog).prop('open')).toBe(true);
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.find(Dialog).find(Button).filterWhere(button => button.prop('autoFocus')).prop('disabled')).toBe(true);
  await act(async () => { next.resolve(false); await second; });
});

test.each(['scope', 'board', 'selection', 'unmount'])('changing %s invalidates pending delete and cannot close a later dialog', async change => {
  const gate = deferred();
  const { props, wrapper, open, accept } = setup({ onDeleteClick: jest.fn(() => gate.promise) });
  let pending;
  act(() => { pending = accept(); });
  const guard = props.onDeleteClick.mock.calls[0][0].guard;
  act(() => {
    if (change === 'unmount') wrapper.unmount();
    else wrapper.setProps(change === 'scope' ? { deleteContextKey: 'scope-b' }
      : change === 'board' ? { board: { id: 'board-b', name: 'Other' } } : { isSelecting: false });
  });
  expect(guard()).toBe(false);
  if (change !== 'unmount') {
    if (change === 'selection') act(() => wrapper.setProps({ isSelecting: true }));
    open(); wrapper.update();
  }
  await act(async () => { gate.resolve(true); await pending; });
  if (change !== 'unmount') {
    wrapper.update();
    expect(wrapper.find(Dialog).prop('open')).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  }
});

test('legacy synchronous delete callbacks keep their no-argument contract and close normally', async () => {
  const callback = jest.fn();
  const { wrapper, accept } = setup({ deleteContextKey: undefined, onDeleteClick: callback });
  await act(async () => { await accept(); });
  wrapper.update();
  expect(callback).toHaveBeenCalledWith();
  expect(wrapper.find(Dialog).prop('open')).toBe(false);
});
