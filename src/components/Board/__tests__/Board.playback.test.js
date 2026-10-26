import React from 'react';
import { shallow } from 'enzyme';
import { BoardContainer } from '../Board.container';
import { OutputContainer } from '../Output/Output.container';
import { cancelSpeech, speak } from '../../../providers/SpeechProvider/SpeechProvider.actions';
import tts from '../../../providers/SpeechProvider/tts';
import { IS_BROWSING_FROM_SAFARI } from '../../../constants';
import { OGVPlayer } from 'ogv';

jest.mock('ogv', () => ({ OGVLoader: { base: '' }, OGVPlayer: jest.fn() }));
jest.mock('dom-to-image', () => ({}));
jest.mock('../Board.component', () => () => null);
jest.mock('../../../providers/SpeechProvider/tts', () => ({ cancel: jest.fn(), speak: jest.fn() }));
jest.mock('../../../constants', () => ({
  ...jest.requireActual('../../../constants'), IS_BROWSING_FROM_SAFARI: true
}));

const first = { id: 'one', label: '喝水', sound: 'blob:synthetic-water', vocalization: '喝温水' };
const second = { id: 'two', label: '谢谢', sound: 'blob:synthetic-thanks' };
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
let instance, props, audios, originalAudio;
beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  originalAudio = global.Audio;
  audios = [];
  const createAudio = () => {
    const audio = { pause: jest.fn(), play: jest.fn(() => Promise.resolve()) };
    audios.push(audio);
    return audio;
  };
  global.Audio = jest.fn(createAudio);
  OGVPlayer.mockImplementation(createAudio);
  const board = { id: 'root', tiles: [], isFixed: false };
  const dispatch = jest.fn(), getState = () => ({ speech: { options: {} } });
  props = {
    board, boards: [board], match: { params: { id: 'root' } },
    communicator: { id: 'person-one', rootBoard: 'root' },
    playbackScope: 'synthetic:one', output: [], isLiveMode: false,
    navigationSettings: {}, intl: { messages: {}, formatMessage: ({ id }) => id },
    history: { push: jest.fn(), replace: jest.fn() },
    changeBoard: jest.fn(), changeOutput: jest.fn(), clickSymbol: jest.fn(),
    showNotification: jest.fn(),
    cancelSpeech: jest.fn(() => cancelSpeech()(dispatch)),
    speak: jest.fn((text, onend, overrides) => speak(text, onend, overrides)(dispatch, getState))
  };
  instance = new BoardContainer(props);
  instance.setState = jest.fn();
  await instance.componentDidMount();
});
afterEach(() => {
  if (instance.componentWillUnmount) instance.componentWillUnmount();
  global.Audio = originalAudio;
  jest.clearAllTimers();
  jest.useRealTimers();
});
function updateProps(patch) {
  const previous = instance.props;
  instance.props = { ...previous, ...patch };
  instance.componentDidUpdate(previous);
}

test('two recorded tiles replace playback while preserving both selected cards', async () => {
  instance.handleTileClick(first);
  const lateEnd = audios[0].onended;
  updateProps({ output: [first] });
  expect(audios[0].pause).not.toHaveBeenCalled();
  instance.handleTileClick(second);
  expect(audios[0].pause).toHaveBeenCalled();
  expect(props.changeOutput.mock.calls[1][0]).toEqual([first, second]);
  if (lateEnd) lateEnd();
  await flush();
  expect(audios[1].pause).not.toHaveBeenCalled();
  expect(props.speak).not.toHaveBeenCalled();
});

test('CBoard cancel stops single-tile recording and blocks fallback after a late error', async () => {
  instance.handleTileClick(first);
  const lateError = audios[0].onerror;
  props.cancelSpeech();
  expect(audios[0].pause).toHaveBeenCalled();
  if (lateError) lateError();
  await flush();
  expect(props.speak).not.toHaveBeenCalled();
});

test('a spoken tile or AI candidate interrupts recording without being cancelled itself', () => {
  instance.handleTileClick(first);
  const cancels = tts.cancel.mock.calls.length;
  props.speak('合成候选');
  expect(audios[0].pause).toHaveBeenCalled();
  expect(tts.speak.mock.calls.slice(-1)[0][0]).toBe('合成候选');
  expect(tts.cancel).toHaveBeenCalledTimes(cancels);
});

test.each([
  { playbackScope: 'synthetic:other' },
  { board: { id: 'other', tiles: [], isFixed: false } },
  { isLiveMode: true }
])('scope/board/input-mode changes stop single-tile audio: %j', patch => {
  instance.handleTileClick(first);
  updateProps(patch);
  expect(audios[0].pause).toHaveBeenCalled();
});

test('leaving the board releases its recording', () => {
  instance.handleTileClick(first);
  if (instance.componentWillUnmount) instance.componentWillUnmount();
  expect(audios[0].pause).toHaveBeenCalled();
});

test('an unavailable recording falls back once to the original vocalization', async () => {
  instance.handleTileClick(first);
  expect(typeof audios[0].onerror).toBe('function');
  audios[0].onerror();
  await flush();
  expect(props.speak.mock.calls.map(call => call[0])).toEqual(['喝温水']);
});

test('recording failure queued before a new selection cannot speak the old label', async () => {
  instance.handleTileClick(first);
  expect(typeof audios[0].onerror).toBe('function');
  audios[0].onerror();
  instance.handleTileClick(second);
  await flush();
  expect(props.speak).not.toHaveBeenCalled();
  expect(audios[1].pause).not.toHaveBeenCalled();
});

test('quiet-builder clicks stop an old recording but do not start another sound', () => {
  instance.handleTileClick(first);
  updateProps({ navigationSettings: { quietBuilderMode: true } });
  instance.handleTileClick(second);
  expect(audios[0].pause).toHaveBeenCalled();
  expect(audios).toHaveLength(1);
  expect(props.changeOutput).toHaveBeenLastCalledWith([second]);
});

test('vocalized folders keep their new recording during the intended board transition', () => {
  const target = { id: 'food', tiles: [], isFixed: false };
  updateProps({ boards: [props.board, target], navigationSettings: { vocalizeFolders: true } });
  instance.handleTileClick({ ...first, loadBoard: 'food' });
  updateProps({ board: target });
  expect(props.changeBoard).toHaveBeenLastCalledWith('food');
  expect(props.history.push).toHaveBeenCalledWith('food');
  expect(props.changeOutput).not.toHaveBeenCalled();
  expect(audios[0].pause).not.toHaveBeenCalled();
});

test.each(['/synthetic.ogg', '/synthetic.ogg?version=1#preview'])(
  'Safari keeps the existing OGV decoder for Ogg recordings: %s', source => {
  expect(IS_BROWSING_FROM_SAFARI).toBe(true);
  instance.handleTileClick({ ...first, sound: source });
  expect(OGVPlayer).toHaveBeenCalledTimes(1);
  expect(audios[0].src).toBe(source);
});

test('editing selection mode and action-only tiles retain their original behavior', () => {
  instance.state.isSelecting = true;
  instance.toggleTileSelect = jest.fn();
  instance.handleTileClick(first);
  expect(instance.toggleTileSelect).toHaveBeenCalledWith('one');
  expect(audios).toHaveLength(0);
  instance.state.isSelecting = false;
  instance.handleTileClick({ label: '快捷动作', action: '+自定义动作' });
  expect(props.speak).not.toHaveBeenCalled();
});

test('a rejected Audio.play promise falls back once, even if a late error also arrives', async () => {
  let fail;
  global.Audio.mockImplementationOnce(() => {
    const audio = { pause: jest.fn(), play: () => new Promise((resolve, reject) => { fail = reject; }) };
    audios.push(audio);
    return audio;
  });
  instance.handleTileClick(first);
  const lateError = audios[0].onerror;
  fail(new Error('synthetic offline media'));
  await flush();
  lateError();
  await flush();
  expect(props.speak.mock.calls.map(call => call[0])).toEqual(['喝温水']);
  expect(audios[0].pause).toHaveBeenCalledTimes(1);
});

test('a never-ending recording times out and retains a single exact-text fallback', async () => {
  instance.handleTileClick(first);
  const lateEnd = audios[0].onended;
  jest.advanceTimersByTime(60000);
  await flush();
  expect(audios[0].pause).toHaveBeenCalled();
  expect(props.speak.mock.calls.map(call => call[0])).toEqual(['喝温水']);
  lateEnd();
  await flush();
  expect(props.speak).toHaveBeenCalledTimes(1);
});

test('successful completion never speaks a second copy of the selected recording', async () => {
  instance.handleTileClick(first);
  audios[0].onended();
  await flush();
  expect(props.speak).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('an unvoiced folder stops the old recording while preserving navigation', () => {
  instance.handleTileClick(first);
  const target = { id: 'food', tiles: [], isFixed: false };
  updateProps({ boards: [props.board, target] });
  instance.handleTileClick({ ...second, loadBoard: 'food' });
  expect(audios[0].pause).toHaveBeenCalled();
  expect(audios).toHaveLength(1);
  expect(props.changeBoard).toHaveBeenLastCalledWith('food');
});

test('remounting creates no audio until another explicit tile click', async () => {
  instance.handleTileClick(first);
  const lateEnd = audios[0].onended;
  instance.componentWillUnmount();
  instance = new BoardContainer(props);
  instance.setState = jest.fn();
  await instance.componentDidMount();
  lateEnd();
  await flush();
  expect(audios).toHaveLength(1);
  expect(props.speak).not.toHaveBeenCalled();
  instance.handleTileClick(second);
  expect(audios).toHaveLength(2);
});

test('the actual top clear handler stops a board tile recording, and undo only restores selection', async () => {
  const top = shallow(<OutputContainer
    output={[first]} outputScope='synthetic:one' intl={props.intl}
    cancelSpeech={props.cancelSpeech} speak={props.speak} clickOutput={jest.fn()}
    changeOutput={next => top.setProps({ output: next })}
  />);
  try {
    instance.handleTileClick(first);
    const lateEnd = audios[0].onended;
    top.instance().handleClearClick();
    expect(top.prop('symbols')).toEqual([]);
    expect(audios[0].pause).toHaveBeenCalled();
    top.instance().handleUndoDelete();
    lateEnd();
    await flush();
    expect(top.prop('symbols')).toEqual([first]);
    expect(audios).toHaveLength(1);
    expect(props.speak).not.toHaveBeenCalled();
  } finally { top.unmount(); }
});

test('board tile audio replaces a top sequence without a stale tail or cancelling the new recording', async () => {
  const top = shallow(<OutputContainer
    output={[first, { label: '旧句末尾' }]} outputScope='synthetic:one' intl={props.intl}
    cancelSpeech={props.cancelSpeech} speak={props.speak} clickOutput={jest.fn()}
    changeOutput={jest.fn()}
  />);
  try {
    const task = top.instance().play();
    const lateEnd = audios[0].onended;
    instance.handleTileClick(second);
    lateEnd();
    await expect(task).resolves.toMatchObject({ reason: 'stopped' });
    expect(audios[0].pause).toHaveBeenCalled();
    expect(audios[1].pause).not.toHaveBeenCalled();
    expect(props.speak).not.toHaveBeenCalled();
  } finally { top.unmount(); }
});
