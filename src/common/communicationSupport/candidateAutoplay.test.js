import {
  buildCandidateAutoplayPlan,
  createCandidateAutoplayController
} from './candidateAutoplay';

function createHarness(playCandidates = jest.fn(() => Promise.resolve())) {
  let timerCallback = null;
  const timerId = {};
  const clearTimer = jest.fn();
  const stopPlayback = jest.fn();
  const controller = createCandidateAutoplayController({
    setTimer: jest.fn((callback, delay) => {
      timerCallback = callback;
      timerId.delay = delay;
      return timerId;
    }),
    clearTimer,
    playCandidates,
    stopPlayback
  });

  return {
    controller,
    clearTimer,
    stopPlayback,
    timerId,
    runTimer: () => timerCallback()
  };
}

describe('candidate autoplay controller', () => {
  test('builds only an enabled, bounded candidate plan', () => {
    expect(buildCandidateAutoplayPlan(['  我要喝水。  ', ''], 5)).toEqual({
      delayMs: 5000,
      sentences: ['我要喝水。']
    });
    expect(buildCandidateAutoplayPlan(['我要喝水。'], 0)).toBeNull();
    expect(buildCandidateAutoplayPlan([], 15)).toBeNull();
    expect(buildCandidateAutoplayPlan(['我要喝水。'], 7)).toEqual(
      expect.objectContaining({ delayMs: 15000 })
    );
  });

  test('plays the complete snapshot after the configured delay', async () => {
    const playCandidates = jest.fn(() => Promise.resolve());
    const harness = createHarness(playCandidates);

    expect(harness.controller.schedule(['第一句。', '第二句。'], 10)).toBe(
      true
    );
    expect(harness.timerId.delay).toBe(10000);

    await harness.runTimer();

    expect(playCandidates).toHaveBeenCalledWith(['第一句。', '第二句。']);
  });

  test('cancels pending playback and stops an active autoplay queue', async () => {
    let finishPlayback;
    const playCandidates = jest.fn(
      () =>
        new Promise(resolve => {
          finishPlayback = resolve;
        })
    );
    const harness = createHarness(playCandidates);

    harness.controller.schedule(['旧候选。'], 15);
    expect(harness.controller.cancel()).toEqual({
      hadPending: true,
      hadActive: false
    });
    expect(harness.clearTimer).toHaveBeenCalledTimes(1);

    harness.controller.schedule(['新候选。'], 5);
    const playback = harness.runTimer();
    await Promise.resolve();
    expect(harness.controller.cancel()).toEqual({
      hadPending: false,
      hadActive: true
    });
    expect(harness.stopPlayback).toHaveBeenCalledTimes(1);

    finishPlayback();
    await playback;
  });
});
