import {
  buildCandidateAutoplayPlan,
  createCandidateAutoplayController
} from './candidateAutoplay';

function createHarness(playCandidates = jest.fn(() => Promise.resolve())) {
  let timerCallback = null;
  const timerId = {};
  const clearTimer = jest.fn();
  const stopPlayback = jest.fn();
  const onPendingChange = jest.fn();
  const controller = createCandidateAutoplayController({
    setTimer: jest.fn((callback, delay) => {
      timerCallback = callback;
      timerId.delay = delay;
      return timerId;
    }),
    clearTimer,
    playCandidates,
    stopPlayback,
    onPendingChange
  });

  return {
    controller,
    clearTimer,
    stopPlayback,
    onPendingChange,
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

  test('reports only a real pending timer, including cancel, start and disabled plans', async () => {
    const harness = createHarness();
    expect(harness.controller.schedule([], 5)).toBe(false);
    expect(harness.onPendingChange).not.toHaveBeenCalled();
    harness.controller.schedule(['第一句。'], 5);
    expect(harness.onPendingChange.mock.calls).toEqual([[5000]]);
    harness.controller.cancel();
    harness.controller.cancel();
    expect(harness.onPendingChange.mock.calls).toEqual([[5000], [0]]);
    harness.controller.schedule(['第二句。'], 10);
    await harness.runTimer();
    expect(harness.onPendingChange.mock.calls).toEqual([[5000], [0], [10000], [0]]);
    expect(harness.controller.schedule(['关闭。'], 0)).toBe(false);
    expect(harness.onPendingChange).toHaveBeenCalledTimes(4);
  });

  test('a canceled callback cannot erase the new timer or countdown state', async () => {
    const timers = [];
    const clearTimer = jest.fn();
    const playCandidates = jest.fn();
    const onPendingChange = jest.fn();
    const controller = createCandidateAutoplayController({
      setTimer: callback => { const timer = { callback }; timers.push(timer); return timer; },
      clearTimer, playCandidates, onPendingChange, stopPlayback: jest.fn()
    });
    controller.schedule(['旧候选。'], 5);
    controller.schedule(['新候选。'], 10);
    await timers[0].callback();
    expect(onPendingChange.mock.calls).toEqual([[5000], [0], [10000]]);
    expect(playCandidates).not.toHaveBeenCalled();
    expect(controller.cancel()).toEqual({ hadPending: true, hadActive: false });
    expect(clearTimer).toHaveBeenLastCalledWith(timers[1]);
    expect(onPendingChange).toHaveBeenLastCalledWith(0);
    await timers[1].callback();
    expect(playCandidates).not.toHaveBeenCalled();
  });
});
