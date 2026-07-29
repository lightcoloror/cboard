const DEFAULT_FFT_SIZE = 256;
const DEFAULT_SAMPLE_INTERVAL_MS = 80;
const DEFAULT_NOISE_FLOOR = 0.015;
const DEFAULT_ACTIVE_RANGE = 0.2;
const DEFAULT_QUANTIZATION_STEP = 0.05;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateBrowserAudioLevel(samples, options = {}) {
  if (!samples || samples.length === 0) return 0;

  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centeredSample = (samples[index] - 128) / 128;
    sumSquares += centeredSample * centeredSample;
  }

  const rootMeanSquare = Math.sqrt(sumSquares / samples.length);
  const noiseFloor = Number.isFinite(options.noiseFloor)
    ? Math.max(0, options.noiseFloor)
    : DEFAULT_NOISE_FLOOR;
  const activeRange =
    Number.isFinite(options.activeRange) && options.activeRange > 0
      ? options.activeRange
      : DEFAULT_ACTIVE_RANGE;

  return clamp((rootMeanSquare - noiseFloor) / activeRange, 0, 1);
}

export function quantizeBrowserAudioLevel(
  level,
  step = DEFAULT_QUANTIZATION_STEP
) {
  const normalizedLevel = clamp(Number.isFinite(level) ? level : 0, 0, 1);
  const normalizedStep = Number.isFinite(step) && step > 0 ? step : 1;
  return Number(
    clamp(
      Math.round(normalizedLevel / normalizedStep) * normalizedStep,
      0,
      1
    ).toFixed(2)
  );
}

function getDefaultGetUserMedia() {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return null;
  }

  return constraints => navigator.mediaDevices.getUserMedia(constraints);
}

function getDefaultAudioContext() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  stream.getTracks().forEach(track => {
    if (track && typeof track.stop === 'function') track.stop();
  });
}

function disconnectSource(source) {
  if (!source || typeof source.disconnect !== 'function') return;
  try {
    source.disconnect();
  } catch (error) {
    // The source may already have been disconnected by the browser.
  }
}

function closeAudioContext(audioContext) {
  if (!audioContext || typeof audioContext.close !== 'function') return;
  try {
    const closeResult = audioContext.close();
    if (closeResult && typeof closeResult.catch === 'function') {
      closeResult.catch(() => {});
    }
  } catch (error) {
    // Closing is best-effort during cancellation and page teardown.
  }
}

function resolveDependency(options, name, fallback) {
  return Object.prototype.hasOwnProperty.call(options, name)
    ? options[name]
    : fallback;
}

export function createBrowserAudioLevelMonitor(options = {}) {
  const getUserMedia = resolveDependency(
    options,
    'getUserMedia',
    getDefaultGetUserMedia()
  );
  const AudioContextImpl = resolveDependency(
    options,
    'AudioContextImpl',
    getDefaultAudioContext()
  );
  const setIntervalImpl = resolveDependency(
    options,
    'setIntervalImpl',
    setInterval
  );
  const clearIntervalImpl = resolveDependency(
    options,
    'clearIntervalImpl',
    clearInterval
  );
  const onLevel =
    typeof options.onLevel === 'function' ? options.onLevel : () => {};
  const onAvailabilityChange =
    typeof options.onAvailabilityChange === 'function'
      ? options.onAvailabilityChange
      : () => {};
  const sampleIntervalMs =
    Number.isFinite(options.sampleIntervalMs) && options.sampleIntervalMs > 0
      ? options.sampleIntervalMs
      : DEFAULT_SAMPLE_INTERVAL_MS;
  const quantizationStep =
    Number.isFinite(options.quantizationStep) && options.quantizationStep > 0
      ? options.quantizationStep
      : DEFAULT_QUANTIZATION_STEP;

  let generation = 0;
  let stream = null;
  let audioContext = null;
  let source = null;
  let analyser = null;
  let samples = null;
  let intervalId = null;
  let lastLevel = null;
  let available = false;

  function emitLevel(level) {
    const nextLevel = quantizeBrowserAudioLevel(level, quantizationStep);
    if (nextLevel === lastLevel) return;
    lastLevel = nextLevel;
    onLevel(nextLevel);
  }

  function emitAvailability(nextAvailable) {
    if (available === nextAvailable) return;
    available = nextAvailable;
    onAvailabilityChange(nextAvailable);
  }

  function releaseResources() {
    if (intervalId !== null) {
      clearIntervalImpl(intervalId);
      intervalId = null;
    }
    disconnectSource(source);
    source = null;
    analyser = null;
    samples = null;
    stopStream(stream);
    stream = null;
    closeAudioContext(audioContext);
    audioContext = null;
  }

  function sampleCurrentLevel() {
    if (!analyser || !samples) return;
    analyser.getByteTimeDomainData(samples);
    emitLevel(calculateBrowserAudioLevel(samples, options));
  }

  async function start() {
    generation += 1;
    const startGeneration = generation;
    releaseResources();
    lastLevel = null;
    emitLevel(0);
    emitAvailability(false);

    if (
      typeof getUserMedia !== 'function' ||
      typeof AudioContextImpl !== 'function'
    ) {
      return false;
    }

    let pendingStream = null;
    let pendingAudioContext = null;
    let pendingSource = null;

    try {
      pendingStream = await getUserMedia({ audio: true, video: false });
      if (generation !== startGeneration) {
        stopStream(pendingStream);
        return false;
      }

      pendingAudioContext = new AudioContextImpl();
      pendingSource = pendingAudioContext.createMediaStreamSource(
        pendingStream
      );
      const pendingAnalyser = pendingAudioContext.createAnalyser();
      pendingAnalyser.fftSize = DEFAULT_FFT_SIZE;
      pendingAnalyser.smoothingTimeConstant = 0.35;
      pendingSource.connect(pendingAnalyser);

      if (generation !== startGeneration) {
        disconnectSource(pendingSource);
        stopStream(pendingStream);
        closeAudioContext(pendingAudioContext);
        return false;
      }

      stream = pendingStream;
      audioContext = pendingAudioContext;
      source = pendingSource;
      analyser = pendingAnalyser;
      samples = new Uint8Array(analyser.fftSize);
      emitAvailability(true);
      sampleCurrentLevel();
      intervalId = setIntervalImpl(sampleCurrentLevel, sampleIntervalMs);
      return true;
    } catch (error) {
      disconnectSource(pendingSource);
      stopStream(pendingStream);
      closeAudioContext(pendingAudioContext);
      if (generation === startGeneration) {
        releaseResources();
        emitLevel(0);
        emitAvailability(false);
      }
      return false;
    }
  }

  function stop() {
    generation += 1;
    releaseResources();
    emitLevel(0);
    emitAvailability(false);
  }

  return { start, stop };
}
