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

  test('preserves the expression snapshot and candidates in history', () => {
    overwriteCommunicationSettings({
      savedPhrases: [],
      history: [
        {
          contractVersion: 1,
          direction: 'express',
          sentence: '我想喝水。',
          labels: ['想', '水'],
          output: [{ id: 'want', label: '想' }, { id: 'water', label: '水' }],
          candidateSentences: ['想水。', '我想喝水。']
        }
      ]
    });

    expect(loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        sentence: '我想喝水。',
        output: [{ id: 'want', label: '想' }, { id: 'water', label: '水' }],
        candidateSentences: ['想水。', '我想喝水。']
      })
    );
  });

  test('preserves confirmed receiver match provenance in local history', () => {
    overwriteCommunicationSettings({
      savedPhrases: [],
      history: [
        {
          contractVersion: 1,
          direction: 'receive',
          inputText: '我想喝水',
          labels: ['想', '水'],
          output: [{ id: 'want', label: '想' }, { id: 'water', label: '水' }],
          pictogramSequence: [
            {
              pictogramId: 'want',
              label: '想',
              source: 'local_dict',
              boardId: 'home',
              matchType: 'lexicon',
              confidence: 0.8,
              originalToken: '想'
            },
            {
              pictogramId: null,
              label: '水',
              source: 'unresolved',
              boardId: '',
              matchType: 'missing',
              confidence: 0,
              originalToken: '水'
            }
          ]
        }
      ]
    });

    expect(loadCommunicationHistory()[0]).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        direction: 'receive',
        pictogramSequence: [
          expect.objectContaining({
            pictogramId: 'want',
            matchType: 'lexicon',
            confidence: 0.8,
            originalToken: '想'
          }),
          expect.objectContaining({
            pictogramId: null,
            matchType: 'missing',
            confidence: 0,
            originalToken: '水'
          })
        ]
      })
    );
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
  test('normalizes legacy receiver match aliases and stage confidence', () => {
    overwriteCommunicationSettings({
      savedPhrases: [],
      history: [
        {
          direction: 'receive',
          inputText: '希望头疼',
          labels: ['想', '痛'],
          pictogramSequence: [
            {
              pictogramId: 'want',
              label: '想',
              source: 'local_dict',
              matchType: 'lexicon-synonym',
              originalToken: '希望'
            },
            {
              pictogramId: 'pain',
              label: '痛',
              source: 'local_dict',
              matchType: 'partial',
              originalToken: '头疼'
            }
          ]
        }
      ]
    });

    expect(loadCommunicationHistory()[0].pictogramSequence).toEqual([
      expect.objectContaining({ matchType: 'lexicon', confidence: 0.8 }),
      expect.objectContaining({ matchType: 'partial', confidence: 0.6 })
    ]);
  });
});
