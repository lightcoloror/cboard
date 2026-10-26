import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import { cancelSpeech, speak } from '../SpeechProvider.actions';
import { START_SPEECH, END_SPEECH } from '../SpeechProvider.constants';
import tts from '../tts';

jest.mock('../tts', () => ({ speak: jest.fn(), cancel: jest.fn() }));
const mockStore = configureMockStore([thunk]);
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('speech action completion state', () => {
  let store;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    store = mockStore({
      speech: { options: { lang: 'zh-CN', voiceURI: 'synthetic-local' } }
    });
  });
  afterEach(() => {
    store.dispatch(cancelSpeech());
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  const ends = () =>
    store.getActions().filter(action => action.type === END_SPEECH);

  test('async provider rejection ends speaking and reports failure exactly once', async () => {
    const done = jest.fn();
    tts.speak.mockRejectedValueOnce(new Error('synthetic failure'));
    await store.dispatch(speak('synthetic text', done));
    await flush();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toMatchObject({ error: true });
    expect(ends()).toHaveLength(1);
  });
  test('synchronous provider failure also settles the caller', () => {
    tts.speak.mockImplementationOnce(() => {
      throw new Error('synthetic failure');
    });
    const done = jest.fn();
    expect(() => store.dispatch(speak('synthetic text', done))).not.toThrow();
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ error: true }));
    expect(ends()).toHaveLength(1);
  });
  test('finishing an old request does not mark the remaining request stopped', () => {
    store.dispatch(speak('synthetic first'));
    store.dispatch(speak('synthetic second'));
    tts.speak.mock.calls[0][1].onend();
    expect(ends()).toHaveLength(0);
    tts.speak.mock.calls[1][1].onend();
    expect(ends()).toHaveLength(1);
  });
  test('cancel settles pending callbacks but suppresses late results and alerts', () => {
    const done = jest.fn();
    store.dispatch(speak('synthetic canceled', done));
    const [, options, alert] = tts.speak.mock.calls[0];
    alert();
    store.dispatch(cancelSpeech());
    const count = store.getActions().length;
    options.onend({ error: true });
    jest.advanceTimersByTime(60000);
    expect(store.getActions()).toHaveLength(count);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ error: true, reason: 'stopped' })
    );
  });
  test('callback starting the next utterance cannot be overwritten by old END_SPEECH', () => {
    store.dispatch(
      speak('synthetic first', () => store.dispatch(speak('synthetic second')))
    );
    const oldEnd = tts.speak.mock.calls[0][1].onend;
    oldEnd();
    expect(store.getActions().slice(-1)[0].type).toBe(START_SPEECH);
    const count = store.getActions().length;
    oldEnd({ error: true });
    expect(store.getActions()).toHaveLength(count);
  });
});
