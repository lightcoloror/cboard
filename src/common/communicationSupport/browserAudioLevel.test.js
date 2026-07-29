import {
  calculateBrowserAudioLevel,
  createBrowserAudioLevelMonitor,
  quantizeBrowserAudioLevel
} from './browserAudioLevel';

function createStream() {
  const track = { stop: jest.fn() };
  return {
    getTracks: jest.fn(() => [track]),
    track
  };
}

function createAudioContextHarness(fillSamples = samples => samples.fill(128)) {
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    getByteTimeDomainData: jest.fn(fillSamples)
  };
  const source = {
    connect: jest.fn(),
    disconnect: jest.fn()
  };
  const audioContext = {
    createMediaStreamSource: jest.fn(() => source),
    createAnalyser: jest.fn(() => analyser),
    close: jest.fn(() => Promise.resolve())
  };
  const AudioContextImpl = jest.fn(() => audioContext);

  return { analyser, source, audioContext, AudioContextImpl };
}

describe('browser audio level', () => {
  test('maps digital silence and values below the noise floor to zero', () => {
    expect(calculateBrowserAudioLevel(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(calculateBrowserAudioLevel(new Uint8Array([129, 127]))).toBe(0);
  });

  test('maps stronger time-domain displacement to a larger clamped level', () => {
    const quiet = calculateBrowserAudioLevel(
      new Uint8Array([132, 124, 132, 124])
    );
    const loud = calculateBrowserAudioLevel(new Uint8Array([176, 80, 176, 80]));

    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(calculateBrowserAudioLevel(new Uint8Array([255, 0, 255, 0]))).toBe(
      1
    );
  });

  test('quantizes levels so React is not updated for every sample fluctuation', () => {
    expect(quantizeBrowserAudioLevel(0.62)).toBe(0.6);
    expect(quantizeBrowserAudioLevel(0.63)).toBe(0.65);
    expect(quantizeBrowserAudioLevel(10)).toBe(1);
    expect(quantizeBrowserAudioLevel(-1)).toBe(0);
  });

  test('samples the microphone and releases every browser resource on stop', async () => {
    const stream = createStream();
    const harness = createAudioContextHarness(samples => {
      samples.fill(128);
      samples[0] = 176;
      samples[1] = 80;
    });
    const onLevel = jest.fn();
    const onAvailabilityChange = jest.fn();
    const clearIntervalImpl = jest.fn();
    let sampleAgain;
    const setIntervalImpl = jest.fn(callback => {
      sampleAgain = callback;
      return 42;
    });
    const monitor = createBrowserAudioLevelMonitor({
      getUserMedia: jest.fn().mockResolvedValue(stream),
      AudioContextImpl: harness.AudioContextImpl,
      setIntervalImpl,
      clearIntervalImpl,
      onLevel,
      onAvailabilityChange
    });

    await expect(monitor.start()).resolves.toBe(true);
    expect(harness.audioContext.createMediaStreamSource).toHaveBeenCalledWith(
      stream
    );
    expect(harness.analyser.fftSize).toBe(256);
    expect(harness.analyser.smoothingTimeConstant).toBe(0.35);
    expect(harness.source.connect).toHaveBeenCalledWith(harness.analyser);
    expect(setIntervalImpl).toHaveBeenCalledWith(expect.any(Function), 80);
    expect(onAvailabilityChange).toHaveBeenCalledWith(true);
    expect(onLevel.mock.calls.some(([level]) => level > 0)).toBe(true);

    sampleAgain();
    monitor.stop();

    expect(clearIntervalImpl).toHaveBeenCalledWith(42);
    expect(harness.source.disconnect).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(harness.audioContext.close).toHaveBeenCalledTimes(1);
    expect(onLevel).toHaveBeenLastCalledWith(0);
    expect(onAvailabilityChange).toHaveBeenLastCalledWith(false);
  });

  test('closes a microphone stream that resolves after cancellation', async () => {
    let resolveStream;
    const getUserMedia = jest.fn(
      () =>
        new Promise(resolve => {
          resolveStream = resolve;
        })
    );
    const stream = createStream();
    const harness = createAudioContextHarness();
    const monitor = createBrowserAudioLevelMonitor({
      getUserMedia,
      AudioContextImpl: harness.AudioContextImpl
    });

    const pendingStart = monitor.start();
    monitor.stop();
    resolveStream(stream);

    await expect(pendingStart).resolves.toBe(false);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(harness.AudioContextImpl).not.toHaveBeenCalled();
  });

  test('fails closed when microphone or Web Audio support is unavailable', async () => {
    const onAvailabilityChange = jest.fn();
    const onLevel = jest.fn();
    const monitor = createBrowserAudioLevelMonitor({
      getUserMedia: null,
      AudioContextImpl: null,
      onAvailabilityChange,
      onLevel
    });

    await expect(monitor.start()).resolves.toBe(false);
    expect(onLevel).toHaveBeenCalledWith(0);
    expect(onAvailabilityChange).not.toHaveBeenCalledWith(true);
  });

  test('treats permission rejection as a visual fallback, not a speech error', async () => {
    const harness = createAudioContextHarness();
    const monitor = createBrowserAudioLevelMonitor({
      getUserMedia: jest.fn().mockRejectedValue(new Error('denied')),
      AudioContextImpl: harness.AudioContextImpl
    });

    await expect(monitor.start()).resolves.toBe(false);
    expect(harness.AudioContextImpl).not.toHaveBeenCalled();
  });
});
