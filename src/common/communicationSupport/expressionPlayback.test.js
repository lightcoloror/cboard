import {
  EXPRESSION_PLAYBACK_FRAME_TYPES,
  canUseTileAudioForSentence,
  createExpressionPlaybackFrames
} from './expressionPlayback';

describe('CBoard expression playback core', () => {
  test('keeps CBoard speech and personalized recordings in selection order', () => {
    expect(
      createExpressionPlaybackFrames([
        { label: '我' },
        { label: '想', vocalization: '想要' },
        {
          label: '喝水',
          sound: 'https://cdn.example.test/my-water.mp3'
        },
        { label: '谢谢' }
      ])
    ).toEqual([
      {
        type: EXPRESSION_PLAYBACK_FRAME_TYPES.speech,
        text: '我 想要'
      },
      {
        type: EXPRESSION_PLAYBACK_FRAME_TYPES.audio,
        clips: [
          {
            source: 'https://cdn.example.test/my-water.mp3',
            fallbackText: '喝水'
          }
        ]
      },
      {
        type: EXPRESSION_PLAYBACK_FRAME_TYPES.speech,
        text: '谢谢'
      }
    ]);
  });

  test('uses tile recordings only when the sentence still represents the tiles', () => {
    const output = [
      { label: '我' },
      { label: '喝水', sound: 'wxfile://personal/water.mp3' }
    ];

    expect(canUseTileAudioForSentence(output, '我喝水。')).toBe(true);
    expect(canUseTileAudioForSentence(output, '请帮我倒一杯温水。')).toBe(
      false
    );
    expect(canUseTileAudioForSentence([{ label: '我喝水' }], '我喝水。')).toBe(
      false
    );
  });
});
