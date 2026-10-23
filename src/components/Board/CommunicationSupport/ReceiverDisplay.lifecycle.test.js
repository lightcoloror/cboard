import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ReceiverDisplay from './ReceiverDisplay.component';
import PatientActionButton from './PatientActionButton.component';
import FullScreenDialog from '../../UI/FullScreenDialog';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import { createBrowserCommunicationSharePort } from '../../../common/communicationSupport/browserCommunicationShare';

jest.mock('../../UI/FullScreenDialog', () => ({
  __esModule: true,
  default: function Dialog({ open, children }) {
    return open ? <section>{children}</section> : null;
  },
  FullScreenDialogContent: function Content({ children }) {
    return <div>{children}</div>;
  }
}));
jest.mock(
  '../Symbol',
  () =>
    function Symbol({ label }) {
      return <span>{label}</span>;
    }
);
jest.mock(
  './PatientActionButton.component',
  () =>
    function Action({ onClick, disabled, label }) {
      return (
        <button onClick={onClick} disabled={disabled}>
          {label}
        </button>
      );
    }
);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let wrappers = [];
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount());
  wrappers = [];
});
function fixture(overrides = {}) {
  const props = {
    open: true,
    title: '合成接收页',
    items: [{ id: 'person-a', label: '合成人甲', image: 'blob:synthetic-a' }],
    speechText: '合成人甲不喝水',
    feedbackQuestion: '明白吗？',
    understoodLabel: '明白',
    notUnderstoodLabel: '不懂',
    repeatRequestedLabel: '再说',
    onClose: jest.fn(),
    onFeedback: jest.fn(),
    onReplay: jest.fn(),
    onShare: jest.fn(),
    ...overrides
  };
  let wrapper;
  act(() => {
    wrapper = mount(<ReceiverDisplay {...props} />);
  });
  wrappers.push(wrapper);
  return {
    props,
    wrapper,
    share: () =>
      wrapper
        .find(PatientActionButton)
        .filterWhere(
          button => button.prop('action') === PATIENT_ACTION_IDS.share
        )
        .prop('onClick')()
  };
}
const done = { ok: true, message: '合成分享完成' };

test('opening preserves existing entry playback while closing stops it', () => {
  const stop = jest.fn(), f = fixture({ open: false, onStop: stop });
  act(() => { f.wrapper.setProps({ open: true }); });
  expect(stop).not.toHaveBeenCalled();
  act(() => { f.wrapper.setProps({ open: false }); });
  expect(stop).toHaveBeenCalledTimes(1);
});

test('two clicks on the same pre-render handler start one export', async () => {
  const pending = [],
    f = fixture({
      onShare: jest.fn(() => {
        const p = deferred();
        pending.push(p);
        return p.promise;
      })
    });
  let tasks;
  act(() => {
    const click = f.wrapper
      .find(PatientActionButton)
      .filterWhere(button => button.prop('action') === PATIENT_ACTION_IDS.share)
      .prop('onClick');
    tasks = [click(), click()];
  });
  const calls = f.props.onShare.mock.calls.length;
  await act(async () => {
    pending.forEach(p => p.resolve(done));
    await Promise.all(tasks);
  });
  expect(calls).toBe(1);
});

test('close invalidates the in-flight guard before the parent renders closed state', async () => {
  const pending = deferred(),
    f = fixture({ onShare: jest.fn(() => pending.promise) });
  let task;
  act(() => {
    task = f.share();
    f.wrapper.find(FullScreenDialog).prop('onClose')();
  });
  expect(f.props.onShare.mock.calls[0][1].isCurrent()).toBe(false);
  await act(async () => {
    pending.resolve(done);
    await task;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).not.toContain(done.message);
  expect(f.props.onClose).toHaveBeenCalledTimes(1);
});

test('changing the selected person invalidates the old export even when the full name matches', async () => {
  const pending = deferred(),
    f = fixture({ onShare: jest.fn(() => pending.promise) });
  let task;
  act(() => {
    task = f.share();
  });
  const guard = f.props.onShare.mock.calls[0][1].isCurrent;
  act(() => {
    f.wrapper.setProps({
      items: [{ id: 'person-b', label: '合成人甲', image: 'blob:synthetic-b' }]
    });
  });
  expect(guard()).toBe(false);
  await act(async () => {
    pending.resolve(done);
    await task;
  });
  expect(f.wrapper.text()).not.toContain(done.message);
});

test('closing then reopening allows a new export and ignores completion of the previous one', async () => {
  const old = deferred(),
    next = deferred(),
    onShare = jest
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
  const f = fixture({ onShare });
  let first, second;
  act(() => {
    first = f.share();
    f.wrapper.setProps({ open: false });
  });
  act(() => {
    f.wrapper.setProps({ open: true });
  });
  act(() => {
    second = f.share();
  });
  await act(async () => {
    old.resolve({ ok: true, message: '旧结果' });
    await first;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain('生成中');
  expect(f.wrapper.text()).not.toContain('旧结果');
  await act(async () => {
    next.resolve(done);
    await second;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain(done.message);
});

test('unmount prevents late callbacks from remaining current', async () => {
  const pending = deferred(),
    f = fixture({ onShare: jest.fn(() => pending.promise) });
  let task;
  act(() => {
    task = f.share();
  });
  const guard = f.props.onShare.mock.calls[0][1].isCurrent;
  act(() => {
    f.wrapper.unmount();
  });
  wrappers = [];
  expect(guard()).toBe(false);
  await act(async () => {
    pending.resolve(done);
    await task;
  });
});

test('unexpected failure clears busy state and permits explicit retry', async () => {
  const f = fixture({
    onShare: jest
      .fn()
      .mockRejectedValueOnce(new Error('synthetic offline'))
      .mockResolvedValueOnce(done)
  });
  await act(async () => {
    await f.share();
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain('图片分享失败');
  await act(async () => {
    await f.share();
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain(done.message);
  expect(f.props.onShare).toHaveBeenCalledTimes(2);
});

test.each([PATIENT_ACTION_IDS.understood, PATIENT_ACTION_IDS.notUnderstood])(
  'ending feedback %s invalidates pending share immediately',
  async action => {
    const pending = deferred(),
      f = fixture({ onShare: jest.fn(() => pending.promise) });
    let task;
    act(() => {
      task = f.share();
      f.wrapper
        .find(PatientActionButton)
        .filterWhere(button => button.prop('action') === action)
        .prop('onClick')();
    });
    expect(f.props.onShare.mock.calls[0][1].isCurrent()).toBe(false);
    await act(async () => {
      pending.resolve(done);
      await task;
    });
    expect(f.props.onFeedback).toHaveBeenCalledTimes(1);
  }
);

test('real share adapter stops a late export on close and shares normally after reopening', async () => {
  const png = deferred();
  const context = {
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn()
  };
  const navigatorRef = {
    canShare: () => true,
    share: jest.fn().mockResolvedValue(undefined)
  };
  const downloadBlob = jest.fn();
  const canvasToBlob = jest
    .fn()
    .mockReturnValueOnce(png.promise)
    .mockResolvedValue(new Blob(['synthetic retry png']));
  const port = createBrowserCommunicationSharePort({
    navigatorRef,
    downloadBlob,
    canvasToBlob,
    createCanvas: () => ({ getContext: () => context }),
    loadImage: async () => ({ width: 100, height: 100 }),
    createFile: blob => ({ name: 'synthetic.png', blob })
  });
  const f = fixture({ onShare: port.shareReceiverImage });
  let first;
  await act(async () => {
    first = f.share();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  expect(canvasToBlob).toHaveBeenCalledTimes(1);
  act(() => {
    f.wrapper.find(FullScreenDialog).prop('onClose')();
    f.wrapper.setProps({ open: false });
  });
  await act(async () => {
    png.resolve(new Blob(['synthetic obsolete png']));
    await first;
  });
  expect(navigatorRef.share).not.toHaveBeenCalled();
  expect(downloadBlob).not.toHaveBeenCalled();
  act(() => {
    f.wrapper.setProps({ open: true });
  });
  await act(async () => {
    await f.share();
  });
  f.wrapper.update();
  expect(navigatorRef.share).toHaveBeenCalledTimes(1);
  expect(f.wrapper.text()).toContain('图片分享面板已打开');
  expect(f.props.items[0].image).toBe('blob:synthetic-a');
});
