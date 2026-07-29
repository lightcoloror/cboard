import {
  buildCommunicationMergePreview,
  buildCommunicationCloudSettingsPayload,
  buildCommunicationSettingsPayload,
  getAnonymousAccountMergeState,
  loadCommunicationHistory,
  loadPersonalImagePreferences,
  loadPersonalImageRuntime,
  loadCommunicationSavedPhrases,
  mergeCommunicationSettings,
  overwriteCommunicationSettings,
  removePersonalImagePreference,
  resetDemoCommunicationStorage,
  retireAnonymousUserIdentity,
  savePersonalImagePreference
} from './localData';
import { setDemoModeOverride } from '../../demoMode';

describe('communication support local data', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDemoCommunicationStorage();
    setDemoModeOverride(null);
  });

  test('keeps an account-link tombstone after an explicit successful merge', () => {
    expect(getAnonymousAccountMergeState('account-1')).toEqual(
      expect.objectContaining({
        status: 'unlinked',
        shouldPrompt: true
      })
    );

    expect(retireAnonymousUserIdentity('account-1')).toEqual(
      expect.objectContaining({
        accountUserId: 'account-1',
        status: 'retired',
        shouldPrompt: false
      })
    );
    expect(getAnonymousAccountMergeState('account-1')).toEqual(
      expect.objectContaining({
        status: 'retired',
        shouldPrompt: false
      })
    );
  });

  test('isolates demo records from production browser storage', () => {
    try {
      setDemoModeOverride(true);
      overwriteCommunicationSettings({
        savedPhrases: [
          {
            sentence: '演示常用语',
            output: [{ id: 'water', label: '水' }],
            createdAt: 1
          }
        ],
        history: []
      });

      expect(loadCommunicationSavedPhrases()[0].sentence).toBe('演示常用语');
      expect(
        window.localStorage.getItem('cboard_communication_saved_phrases')
      ).toBeNull();
    } finally {
      setDemoModeOverride(null);
      resetDemoCommunicationStorage();
    }
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
    expect(payload.history).toHaveLength(2);
    expect(payload.history[0].labels).toEqual(['想', '水']);
  });

  test('cloud settings leave complete confirmed receiver records to the event API', () => {
    const payload = buildCommunicationCloudSettingsPayload(
      [],
      [
        {
          id: 'receiver-confirmed',
          sessionId: 'session-1',
          patientId: 'patient-1',
          workspaceId: 'workspace-1',
          direction: 'receive',
          recordStatus: 'confirmed',
          inputText: '我想喝水',
          labels: ['想', '水'],
          createdAt: 30,
          updatedAt: 30,
          confirmedAt: 30
        },
        {
          id: 'receiver-legacy',
          direction: 'receive',
          inputText: '旧接收记录',
          labels: ['旧接收记录'],
          createdAt: 20
        },
        {
          id: 'expression-1',
          direction: 'express',
          sentence: '我要休息',
          labels: ['休息'],
          createdAt: 10
        }
      ]
    );

    expect(payload.history.map(entry => entry.id)).toEqual([
      'receiver-legacy',
      'expression-1'
    ]);
  });

  test('cloud settings strip device-private assets without changing public pictograms', () => {
    const privateAttribution = {
      provider: 'device-private',
      originalId: 'family-photo',
      name: '当前设备私有图片',
      license: '用户提供，仅限本机使用',
      licenseUrl: null,
      author: null,
      authorUrl: null,
      sourceUrl: 'device-private://missing-token/family-photo',
      repoKey: null
    };
    const payload = buildCommunicationCloudSettingsPayload(
      [
        {
          sentence: '我要找妈妈',
          output: [
            {
              id: 'device_private_missing_family-photo',
              label: '妈妈',
              image: 'wxfile://usr/family-photo.png',
              boardId: 'device-private-pictograms',
              source: 'user',
              attribution: privateAttribution,
              tile: { image: 'data:image/png;base64,private' }
            },
            {
              id: 'water',
              label: '水',
              image: '/symbols/mulberry/water.svg'
            }
          ],
          createdAt: 10
        }
      ],
      [
        {
          id: 'expression-private',
          direction: 'express',
          sentence: '我要找妈妈',
          labels: ['妈妈'],
          output: [
            {
              id: 'family',
              label: '妈妈',
              image: 'data:image/png;base64,private'
            }
          ],
          createdAt: 20
        },
        {
          id: 'receiver-legacy-private',
          direction: 'receive',
          inputText: '妈妈来了',
          labels: ['妈妈'],
          pictogramSequence: [
            {
              pictogramId: 'device_private_missing_family-photo',
              label: '妈妈',
              source: 'user',
              boardId: 'device-private-pictograms',
              matchType: 'manual',
              confidence: 1,
              originalToken: '妈妈',
              attribution: privateAttribution
            }
          ],
          createdAt: 15
        }
      ]
    );

    expect(payload.savedPhrases[0].output).toEqual([
      { label: '妈妈' },
      expect.objectContaining({
        id: 'water',
        label: '水',
        image: '/symbols/mulberry/water.svg'
      })
    ]);
    expect(payload.history[0].output[0]).toEqual({
      id: 'family',
      label: '妈妈'
    });
    expect(payload.history[1].pictogramSequence[0]).toEqual({
      label: '妈妈',
      source: 'user',
      matchType: 'manual',
      confidence: 1,
      originalToken: '妈妈'
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('device-private://');
    expect(serialized).not.toContain('device_private_missing');
    expect(serialized).not.toContain('wxfile://');
    expect(serialized).not.toContain('data:image');
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

  test('merge preview exposes additions and resolves conflicts by updatedAt', () => {
    const localValue = {
      savedPhrases: [
        {
          sentence: '共同短语',
          output: [{ id: 'local', label: '本机' }],
          createdAt: 10,
          updatedAt: 300
        },
        {
          sentence: '仅本机',
          output: [{ id: 'local-only', label: '本机' }],
          createdAt: 20,
          updatedAt: 20
        }
      ],
      history: [
        {
          id: 'shared-history',
          direction: 'receive',
          inputText: '本机旧记录',
          labels: ['本机'],
          createdAt: 30,
          updatedAt: 100
        }
      ]
    };
    const remoteValue = {
      savedPhrases: [
        {
          sentence: '共同短语',
          output: [{ id: 'remote', label: '云端' }],
          createdAt: 10,
          updatedAt: 200
        },
        {
          sentence: '仅云端',
          output: [{ id: 'remote-only', label: '云端' }],
          createdAt: 25,
          updatedAt: 25
        }
      ],
      history: [
        {
          id: 'shared-history',
          direction: 'receive',
          inputText: '云端新记录',
          labels: ['云端'],
          createdAt: 30,
          updatedAt: 400
        },
        {
          id: 'remote-history',
          direction: 'express',
          sentence: '仅云端历史',
          labels: ['云端'],
          createdAt: 40,
          updatedAt: 40
        }
      ]
    };

    expect(buildCommunicationMergePreview(localValue, remoteValue)).toEqual(
      expect.objectContaining({
        localCount: 3,
        remoteCount: 4,
        resultCount: 5,
        localOnly: 1,
        remoteOnly: 2,
        conflicts: 2,
        localWins: 1,
        remoteWins: 1,
        unchanged: 0
      })
    );

    const merged = mergeCommunicationSettings(localValue, remoteValue);
    expect(
      merged.savedPhrases.find(item => item.sentence === '共同短语').output[0]
        .id
    ).toBe('local');
    expect(
      merged.history.find(item => item.id === 'shared-history').inputText
    ).toBe('云端新记录');
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

  test('keeps personal images in the browser-only repository boundary', () => {
    const saved = savePersonalImagePreference({
      tileId: 'water',
      boardId: 'home',
      labelSnapshot: 'Water',
      image: 'data:image/png;base64,private'
    });
    const runtime = loadPersonalImageRuntime();

    expect(loadPersonalImagePreferences()).toEqual([saved]);
    expect(runtime.identity).toEqual(
      expect.objectContaining({
        patientId: expect.any(String),
        workspaceId: expect.any(String)
      })
    );
    expect(runtime.preferences).toEqual([saved]);

    overwriteCommunicationSettings({
      savedPhrases: [],
      history: []
    });
    expect(loadPersonalImagePreferences()).toEqual([saved]);
    expect(removePersonalImagePreference('water', { boardId: 'home' })).toBe(
      true
    );
    expect(loadPersonalImagePreferences()).toEqual([]);
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
