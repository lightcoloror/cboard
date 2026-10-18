import { createBrowserExpressionAudio } from './browserExpressionAudio';
import { playExpressionSentence } from './expressionPlaybackCoordinator';

test('mixed playback waits for recording completion, then resumes speech', async () => {
  const audio = { play: jest.fn(() => Promise.resolve()), pause: jest.fn() };
  const audioPort = createBrowserExpressionAudio(() => audio);
  const spoken = [],
    speechPort = {
      speak: async text => {
        spoken.push(text);
        return { ok: true };
      }
    };
  const output = [
    { label: '我' },
    { label: '喝水', sound: 'data:audio/wav;base64,c3ludGhldGlj' },
    { label: '谢谢' }
  ];
  const task = playExpressionSentence({
    sentence: '我喝水谢谢',
    output,
    speechPort,
    audioPort,
    rate: 0.8
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(spoken).toEqual(['我']);
  expect(audio.playbackRate).toBe(0.8);
  audio.onended();
  await expect(task).resolves.toMatchObject({ ok: true });
  expect(spoken).toEqual(['我', '谢谢']);
});
test.each(['error', 'stop'])(
  'recording %s uses fallback only when playback failed, never after stopping',
  async mode => {
    const audio = { play: () => Promise.resolve(), pause: jest.fn() };
    const audioPort = createBrowserExpressionAudio(() => audio);
    const speak = jest.fn(async () => ({ ok: true }));
    const task = playExpressionSentence({
      sentence: '喝水',
      output: [{ label: '喝水', sound: 'blob:synthetic' }],
      speechPort: { speak },
      audioPort
    });
    if (mode === 'error') audio.onerror();
    else audioPort.stop();
    const result = await task;
    expect(result.ok).toBe(mode === 'error');
    expect(speak).toHaveBeenCalledTimes(mode === 'error' ? 1 : 0);
    expect(audio.pause).toHaveBeenCalled();
  }
);
