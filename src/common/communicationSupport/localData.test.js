import {
  buildCommunicationSettingsPayload,
  loadCommunicationHistory,
  loadCommunicationSavedPhrases,
  mergeCommunicationSettings,
  overwriteCommunicationSettings
} from './localData';

describe('communication support local data', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('buildCommunicationSettingsPayload normalizes duplicates and invalid rows', () => {
    const payload = buildCommunicationSettingsPayload(
      [
        {
          sentence: '我想喝水',
          output: [{ id: 'water', label: '水' }],
          createdAt: 10
        },
        {
          sentence: '我想喝水',
          output: [{ id: 'water-2', label: '水' }],
          createdAt: 5
        },
        {
          sentence: '',
          output: []
        }
      ],
      [
        {
          direction: 'receive',
          inputText: '我想喝水',
          labels: ['想', '水'],
          createdAt: 7
        },
        {
          direction: 'receive',
          inputText: '我想喝水',
          labels: ['想', '水'],
          createdAt: 3
        },
        {
          direction: '',
          labels: []
        }
      ]
    );

    expect(payload.savedPhrases).toHaveLength(1);
    expect(payload.savedPhrases[0].sentence).toBe('我想喝水');
    expect(payload.history).toHaveLength(1);
    expect(payload.history[0].labels).toEqual(['想', '水']);
  });

  test('mergeCommunicationSettings keeps newest local and remote data', () => {
    const merged = mergeCommunicationSettings(
      {
        savedPhrases: [
          {
            sentence: '我要休息',
            output: [{ id: 'rest', label: '休息' }],
            createdAt: 20
          }
        ],
        history: []
      },
      {
        savedPhrases: [
          {
            sentence: '我要喝水',
            output: [{ id: 'water', label: '水' }],
            createdAt: 10
          }
        ],
        history: [
          {
            direction: 'receive',
            inputText: '我要喝水',
            labels: ['想', '水'],
            createdAt: 15
          }
        ]
      }
    );

    expect(merged.savedPhrases.map(item => item.sentence)).toEqual([
      '我要休息',
      '我要喝水'
    ]);
    expect(merged.history).toHaveLength(1);
  });

  test('overwriteCommunicationSettings persists both neutral and legacy local keys', () => {
    overwriteCommunicationSettings({
      savedPhrases: [
        {
          sentence: '我要去厕所',
          output: [{ id: 'toilet', label: '厕所' }]
        }
      ],
      history: [
        {
          direction: 'express',
          sentence: '我要去厕所',
          labels: ['想', '厕所']
        }
      ]
    });

    expect(loadCommunicationSavedPhrases()[0].sentence).toBe('我要去厕所');
    expect(loadCommunicationHistory()[0].direction).toBe('express');
    expect(
      JSON.parse(
        window.localStorage.getItem('cboard_communication_saved_phrases')
      )[0].sentence
    ).toBe('我要去厕所');
    expect(
      JSON.parse(window.localStorage.getItem('cboard_tuyujia_saved_phrases'))[0]
        .sentence
    ).toBe('我要去厕所');
  });

  test('loadCommunicationSavedPhrases falls back to legacy storage when neutral keys are absent', () => {
    window.localStorage.setItem(
      'cboard_tuyujia_saved_phrases',
      JSON.stringify([
        {
          sentence: '旧常用语',
          output: [{ id: 'legacy', label: '旧图' }],
          createdAt: 1
        }
      ])
    );

    expect(loadCommunicationSavedPhrases()[0].sentence).toBe('旧常用语');
  });
});
