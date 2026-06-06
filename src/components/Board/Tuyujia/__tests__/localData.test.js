import {
  buildTuyujiaSettingsPayload,
  loadHistory,
  loadSavedPhrases,
  mergeTuyujiaSettings,
  overwriteTuyujiaSettings
} from '../localData';

describe('tuyujia localData', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('buildTuyujiaSettingsPayload normalizes duplicates and invalid rows', () => {
    const payload = buildTuyujiaSettingsPayload(
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

  test('mergeTuyujiaSettings keeps newest local and remote data', () => {
    const merged = mergeTuyujiaSettings(
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

  test('overwriteTuyujiaSettings persists normalized local data', () => {
    overwriteTuyujiaSettings({
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

    expect(loadSavedPhrases()[0].sentence).toBe('我要去厕所');
    expect(loadHistory()[0].direction).toBe('express');
  });
});
