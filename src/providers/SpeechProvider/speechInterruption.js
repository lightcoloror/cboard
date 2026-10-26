// In-memory glue for CBoard's existing speak/cancel actions. No text or media
// is stored: an owner only lets a multi-frame queue keep its own next utterance.
const listeners = new Set();

export function subscribeSpeechInterruption(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function interruptSpeechQueues(owner) {
  listeners.forEach(listener => listener(owner));
}
