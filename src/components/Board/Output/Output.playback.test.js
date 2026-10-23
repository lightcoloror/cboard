import React from 'react';
import { shallow } from 'enzyme';
import { OutputContainer } from './Output.container';
import { interruptSpeechQueues } from '../../../providers/SpeechProvider/speechInterruption';

// All media and speech here are synthetic; no network or sound device is used.
const output = [
  { id: 'water', label: '喝水', sound: 'blob:synthetic-water' },
  { id: 'thanks', label: '谢谢', vocalization: '谢谢你' }
];
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};
let wrapper, audios, callbacks, props, originalAudio;
beforeEach(() => {
  jest.useFakeTimers();
  originalAudio = global.Audio;
  audios = [];
  callbacks = [];
  global.Audio = jest.fn(() => {
    const audio = { play: jest.fn(() => Promise.resolve()), pause: jest.fn() };
    audios.push(audio);
    return audio;
  });
  props = {
    output,
    outputScope: 'synthetic:one',
    intl: { messages: {}, formatMessage: ({ id }) => id },
    cancelSpeech: jest.fn(),
    clickOutput: jest.fn(),
    changeOutput: jest.fn(),
    speak: jest.fn((text, callback) => callbacks.push(callback))
  };
  wrapper = shallow(<OutputContainer {...props} />);
});
afterEach(() => {
  wrapper.unmount();
  global.Audio = originalAudio;
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each(['handleClearClick', 'handleBackspaceClick'])(
  '%s stops the active recording and prevents late callbacks from speaking the old tail',
  async action => {
    const task = wrapper.instance().play();
    const lateEnd = audios[0].onended;
    wrapper.instance()[action]();
    expect(audios[0].pause).toHaveBeenCalled();
    lateEnd();
    await task;
    expect(props.speak).not.toHaveBeenCalled();
  }
);

test('a second play replaces the first queue instead of interleaving recordings', async () => {
  const first = wrapper.instance().play();
  const lateEnd = audios[0].onended;
  const second = wrapper.instance().play();
  expect(audios[0].pause).toHaveBeenCalled();
  lateEnd();
  await first;
  expect(props.speak).not.toHaveBeenCalled();
  audios[1].onended();
  await flush();
  expect(props.speak.mock.calls.map(call => call[0])).toEqual(['谢谢你']);
  callbacks[0]();
  await second;
});

test.each([
  { output: [] },
  { outputScope: 'synthetic:other-person' },
  { isLiveMode: true }
])('changing the active sequence or scope cancels playback: %j', async change => {
  const task = wrapper.instance().play();
  const lateEnd = audios[0].onended;
  wrapper.setProps(change);
  expect(audios[0].pause).toHaveBeenCalled();
  lateEnd();
  await task;
  expect(props.speak).not.toHaveBeenCalled();
});

test('unmount cancels audio and cannot start a trailing utterance', async () => {
  const task = wrapper.instance().play();
  const lateEnd = audios[0].onended;
  wrapper.unmount();
  expect(audios[0].pause).toHaveBeenCalled();
  lateEnd();
  await task;
  expect(props.speak).not.toHaveBeenCalled();
});

test('a stopped speech callback cannot start the next recording', async () => {
  wrapper.setProps({ output: [{ label: '我' }, ...output] });
  const task = wrapper.instance().play();
  wrapper.instance().handleClearClick();
  callbacks[0]();
  await task;
  expect(audios).toHaveLength(0);
});

test('an offline recording failure uses original vocalization and preserves order', async () => {
  const task = wrapper.instance().play();
  audios[0].onerror();
  await flush();
  expect(props.speak.mock.calls.map(call => call[0])).toEqual(['喝水']);
  callbacks[0]();
  await flush();
  expect(props.speak.mock.calls.map(call => call[0])).toEqual(['喝水', '谢谢你']);
  callbacks[1]();
  await task;
});

test('plain text still uses CBoard vocalization and action semantics', async () => {
  wrapper.setProps({ output: [{ label: '想', vocalization: '想要' }, { label: '问候', action: '+你好' }] });
  const task = wrapper.instance().play();
  expect(props.speak).toHaveBeenCalledWith('想要 你好', expect.any(Function), expect.objectContaining({ playbackOwner: wrapper.instance().playbackOwner }));
  callbacks[0]();
  await task;
});

test('live-mode Enter speaks submitted text while appending the next empty input', async () => {
  wrapper.setProps({ isLiveMode: true, output: [{ type: 'live', label: '你好' }] });
  wrapper.instance().handleOutputKeyDown({ keyCode: 13, target: { tagName: 'TEXTAREA', value: '你好' } });
  const next = props.changeOutput.mock.calls[0][0];
  wrapper.setProps({ output: next });
  expect(props.speak.mock.calls.map(call => call[0])).toEqual(['你好']);
  expect(wrapper.instance().playbackActive).toBe(true);
  callbacks[0]();
  await flush();
  expect(wrapper.instance().playbackActive).toBe(false);
});

test('speech timeout settles the queue and cannot continue after a late completion', async () => {
  wrapper.setProps({ output: [{ label: '我' }, ...output] });
  const task = wrapper.instance().play();
  jest.advanceTimersByTime(60000);
  await expect(task).resolves.toMatchObject({ ok: false, reason: 'timeout' });
  callbacks[0]();
  await flush();
  expect(audios).toHaveLength(0);
});

test('a speech provider rejection stops cleanly without an unhandled promise or extra recording', async () => {
  wrapper.setProps({ output: [{ label: '我' }, ...output], speak: () => Promise.reject(new Error('synthetic failure')) });
  await expect(wrapper.instance().play()).resolves.toMatchObject({ ok: false, reason: 'provider' });
  expect(audios).toHaveLength(0);
});

test('a new tile or candidate takes over without the old queue cancelling its speech', async () => {
  const task = wrapper.instance().play();
  const cancelCount = props.cancelSpeech.mock.calls.length;
  interruptSpeechQueues({ syntheticNewOwner: true });
  wrapper.setProps({ output: [...output, { label: '新选择' }] });
  await expect(task).resolves.toMatchObject({ reason: 'stopped' });
  expect(audios[0].pause).toHaveBeenCalled();
  expect(props.cancelSpeech).toHaveBeenCalledTimes(cancelCount);
});

test('its own speech frames keep the same owner and are not interrupted', async () => {
  wrapper.setProps({ output: [{ label: '我' }, ...output], speak: (text, callback, options) => {
    interruptSpeechQueues(options.playbackOwner);
    callbacks.push(callback);
  } });
  const task = wrapper.instance().play();
  callbacks[0]();
  await flush();
  expect(audios).toHaveLength(1);
  audios[0].onended();
  await flush();
  callbacks[1]();
  await expect(task).resolves.toMatchObject({ ok: true });
});

test('global cancel also settles an active speech without waiting for the device callback', async () => {
  wrapper.setProps({ output: [{ label: '我' }, ...output] });
  const task = wrapper.instance().play();
  interruptSpeechQueues();
  await expect(task).resolves.toMatchObject({ reason: 'stopped' });
  callbacks[0]();
  await flush();
  expect(audios).toHaveLength(0);
});
