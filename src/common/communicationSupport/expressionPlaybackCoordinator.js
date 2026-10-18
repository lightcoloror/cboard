// Reused from the existing mini-program playback coordinator.
import {
  EXPRESSION_PLAYBACK_FRAME_TYPES,
  canUseTileAudioForSentence,
  createExpressionPlaybackFrames
} from './expressionPlayback';
export async function playExpressionSentence({
  sentence,
  output,
  speechPort,
  audioPort,
  rate
}) {
  if (!canUseTileAudioForSentence(output, sentence)) {
    return speechPort.speak(sentence, { rate });
  }
  const frames = createExpressionPlaybackFrames(output);
  for (const frame of frames) {
    if (frame.type === EXPRESSION_PLAYBACK_FRAME_TYPES.speech) {
      const result = await speechPort.speak(frame.text, { rate });
      if (!result.ok) return result;
      continue;
    }
    for (const clip of frame.clips) {
      const result = await audioPort.play(clip.source, { rate });
      if (result.ok) continue;
      if (result.reason === 'stopped' || !clip.fallbackText) return result;
      const fallback = await speechPort.speak(clip.fallbackText, { rate });
      if (!fallback.ok) return fallback;
    }
  }
  return { ok: true, message: '个性录音与文字已按图卡顺序播报。' };
}
export function stopExpressionPlayback(speechPort, audioPort) {
  speechPort.stop();
  audioPort.stop();
}
