import { cancelSpeech, speak } from './SpeechProvider.actions';
import { subscribeSpeechInterruption } from './speechInterruption';
import tts from './tts';

jest.mock('./tts', () => ({ cancel: jest.fn(), speak: jest.fn() }));

test('CBoard cancel stops registered queues before cancelling the speech device', () => {
  const events = [];
  const unsubscribe = subscribeSpeechInterruption(owner => events.push(['queue', owner]));
  tts.cancel.mockImplementation(() => events.push(['device']));
  cancelSpeech()(() => events.push(['dispatch']));
  unsubscribe();
  expect(events).toEqual([['queue', undefined], ['dispatch'], ['device']]);
});

test('CBoard speak hands off queues but never sends the local owner into TTS options', () => {
  const calls = [];
  const owner = {};
  const unsubscribe = subscribeSpeechInterruption(value => calls.push(value));
  const dispatch = jest.fn();
  speak('合成文本', () => {}, { playbackOwner: owner, rate: 0.8 })(dispatch, () => ({ speech: { options: { lang: 'zh-CN' } } }));
  unsubscribe();
  expect(calls).toEqual([owner]);
  expect(tts.speak).toHaveBeenLastCalledWith('合成文本', expect.objectContaining({ lang: 'zh-CN', rate: 0.8 }), expect.any(Function));
  expect(tts.speak.mock.calls.slice(-1)[0][1]).not.toHaveProperty('playbackOwner');
  cancelSpeech()(dispatch);
  expect(calls).toEqual([owner]);
});
