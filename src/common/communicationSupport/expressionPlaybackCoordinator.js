// Reused from the existing mini-program playback coordinator.
import {
  EXPRESSION_PLAYBACK_FRAME_TYPES,
  canUseTileAudioForSentence,
  createExpressionPlaybackFrames
} from './expressionPlayback';

const stopped = () => ({ ok: false, reason: 'stopped', message: '朗读已停止。' });

export async function playExpressionSentence({
  sentence,
  output,
  speechPort,
  audioPort,
  rate,
  isCurrent = () => true
}) {
  if (!isCurrent()) return stopped();
  if (!canUseTileAudioForSentence(output, sentence)) {
    const result = await speechPort.speak(sentence, { rate });
    return isCurrent() ? result : stopped();
  }
  return playExpressionOutput({ output, speechPort, audioPort, rate, isCurrent });
}

// Native CBoard output uses tile vocalization/action even without recordings.
// Share the same ordering/fallback policy without converting it into an AI sentence.
export async function playExpressionOutput({
  output, speechPort, audioPort, rate, isCurrent = () => true
}) {
  const frames = createExpressionPlaybackFrames(output);
  for (const frame of frames) {
    if (!isCurrent()) return stopped();
    if (frame.type === EXPRESSION_PLAYBACK_FRAME_TYPES.speech) {
      const result = await speechPort.speak(frame.text, { rate });
      if (!isCurrent()) return stopped();
      if (!result.ok) return result;
      continue;
    }
    for (const clip of frame.clips) {
      if (!isCurrent()) return stopped();
      const result = await audioPort.play(clip.source, { rate });
      if (!isCurrent()) return stopped();
      if (result.ok) continue;
      if (result.reason === 'stopped' || !clip.fallbackText) return result;
      const fallback = await speechPort.speak(clip.fallbackText, { rate });
      if (!isCurrent()) return stopped();
      if (!fallback.ok) return fallback;
    }
  }
  return { ok: true, message: '个性录音与文字已按图卡顺序播报。' };
}
export function stopExpressionPlayback(speechPort, audioPort) {
  speechPort.stop();
  audioPort.stop();
}
