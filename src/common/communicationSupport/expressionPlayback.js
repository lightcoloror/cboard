export const EXPRESSION_PLAYBACK_FRAME_TYPES = {
  speech: 'speech',
  audio: 'audio'
};

function normalizeText(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function getTileSpeechText(tile) {
  const action = normalizeText(tile && tile.action);
  if (action.startsWith('+')) return action.slice(1);
  return normalizeText(tile && (tile.vocalization || tile.label));
}

function createFrame(type) {
  return type === EXPRESSION_PLAYBACK_FRAME_TYPES.audio
    ? { type, clips: [] }
    : { type, textParts: [] };
}

export function createExpressionPlaybackFrames(output) {
  const frames = [];

  (Array.isArray(output) ? output : []).forEach(tile => {
    if (!tile || typeof tile !== 'object') return;
    const sound = normalizeText(tile.sound);
    const speechText = getTileSpeechText(tile);
    if (!sound && !speechText) return;

    const type = sound
      ? EXPRESSION_PLAYBACK_FRAME_TYPES.audio
      : EXPRESSION_PLAYBACK_FRAME_TYPES.speech;
    let frame = frames[frames.length - 1];
    if (!frame || frame.type !== type) {
      frame = createFrame(type);
      frames.push(frame);
    }

    if (type === EXPRESSION_PLAYBACK_FRAME_TYPES.audio) {
      frame.clips.push({ source: sound, fallbackText: speechText });
    } else if (speechText) {
      frame.textParts.push(speechText);
    }
  });

  return frames.map(frame =>
    frame.type === EXPRESSION_PLAYBACK_FRAME_TYPES.audio
      ? frame
      : { type: frame.type, text: frame.textParts.join(' ').trim() }
  );
}

function normalizeSentence(value) {
  return normalizeText(value)
    .replace(/[\s，。！？、,.!?;；:：]+/g, '')
    .toLocaleLowerCase();
}

export function canUseTileAudioForSentence(output, sentence) {
  const tiles = Array.isArray(output) ? output : [];
  if (!tiles.some(tile => normalizeText(tile && tile.sound))) return false;
  const labelSentence = tiles
    .map(tile => normalizeText(tile && tile.label))
    .join('');
  return Boolean(
    normalizeSentence(labelSentence) &&
      normalizeSentence(labelSentence) === normalizeSentence(sentence)
  );
}
