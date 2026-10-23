import { playExpressionSentence, playExpressionOutput } from './expressionPlaybackCoordinator';

test.each(['speech', 'audio', 'fallback'])(
  'cancel between %s completion and the next microtask never starts another frame',
  async phase => {
    let current = true;
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const speechPort = { speak: jest.fn(() => pending) };
    const audioPort = { play: jest.fn(() => phase === 'fallback'
      ? Promise.resolve({ ok: false, reason: 'playback' }) : pending) };
    const tiles = [
      { label: '喝水', sound: 'blob:synthetic' },
      { label: '谢谢' }
    ];
    if (phase === 'speech') tiles.unshift({ label: '我' });
    const task = playExpressionSentence({
      sentence: tiles.map(tile => tile.label).join(''),
      output: tiles, speechPort, audioPort, isCurrent: () => current
    });
    await Promise.resolve();
    const before = [speechPort.speak.mock.calls.length, audioPort.play.mock.calls.length];
    // Success was already queued, so stopping just the device cannot revoke it.
    finish({ ok: true });
    current = false;
    await expect(task).resolves.toMatchObject({ ok: false, reason: 'stopped' });
    expect([speechPort.speak.mock.calls.length, audioPort.play.mock.calls.length]).toEqual(before);
  }
);

test('cancelled recording failure never triggers its text fallback', async () => {
  let current = true;
  const speechPort = { speak: jest.fn() };
  const result = await playExpressionOutput({
    output: [{ label: '喝水', sound: 'blob:synthetic' }],
    speechPort,
    audioPort: { play: async () => {
      current = false;
      return { ok: false, reason: 'playback' };
    } },
    isCurrent: () => current
  });
  expect(result.reason).toBe('stopped');
  expect(speechPort.speak).not.toHaveBeenCalled();
});

test('an obsolete full sentence does not start speech or report success after stop', async () => {
  const speechPort = { speak: jest.fn(async () => ({ ok: true })) };
  const options = { sentence: '合成句', output: [], speechPort, isCurrent: () => false };
  await expect(playExpressionSentence(options)).resolves.toMatchObject({ reason: 'stopped' });
  expect(speechPort.speak).not.toHaveBeenCalled();
});
