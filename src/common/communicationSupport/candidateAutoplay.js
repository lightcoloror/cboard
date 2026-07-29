import {
  COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS,
  DEFAULT_COMMUNICATION_PREFERENCES
} from './communicationPreferences';

export function buildCandidateAutoplayPlan(candidateSentences, delaySeconds) {
  const requestedDelay = Number(delaySeconds);
  const normalizedDelay = COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS.includes(
    requestedDelay
  )
    ? requestedDelay
    : DEFAULT_COMMUNICATION_PREFERENCES.candidateAutoplayDelaySeconds;
  const sentences = (Array.isArray(candidateSentences)
    ? candidateSentences
    : []
  )
    .map(sentence => String(sentence || '').trim())
    .filter(Boolean)
    .slice(0, 10);

  if (!normalizedDelay || !sentences.length) {
    return null;
  }

  return {
    delayMs: normalizedDelay * 1000,
    sentences
  };
}

export function createCandidateAutoplayController({
  setTimer,
  clearTimer,
  playCandidates,
  stopPlayback
}) {
  let timerId = null;
  let generation = 0;
  let active = false;

  function clearPendingTimer() {
    if (timerId === null) return false;
    clearTimer(timerId);
    timerId = null;
    return true;
  }

  function cancel({ stopActivePlayback = true } = {}) {
    const hadPending = clearPendingTimer();
    const hadActive = active;
    generation += 1;
    active = false;

    if (hadActive && stopActivePlayback) {
      stopPlayback();
    }

    return { hadPending, hadActive };
  }

  function schedule(candidateSentences, delaySeconds) {
    cancel();
    const plan = buildCandidateAutoplayPlan(candidateSentences, delaySeconds);
    if (!plan) return false;

    const scheduledGeneration = generation;
    timerId = setTimer(async () => {
      timerId = null;
      if (generation !== scheduledGeneration) return;

      active = true;
      try {
        await playCandidates(plan.sentences);
      } catch (error) {
        // Speech adapters report their own user-facing failures.
      } finally {
        if (generation === scheduledGeneration) {
          active = false;
        }
      }
    }, plan.delayMs);
    return true;
  }

  return {
    schedule,
    cancel,
    dispose() {
      cancel();
    }
  };
}
