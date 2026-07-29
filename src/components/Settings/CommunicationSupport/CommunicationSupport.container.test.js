import React from 'react';
import { shallow } from 'enzyme';
import API from '../../../api';
import * as localData from '../../../common/communicationSupport/localData';
import { CommunicationSupportContainer } from './CommunicationSupport.container';

jest.mock('../../../api', () => ({
  deleteCommunicationSavedPhrases: jest.fn(),
  deleteConfirmedReceiverRecords: jest.fn(),
  getCommunicationAiHealth: jest.fn(),
  getCommunicationAiUsage: jest.fn(),
  generateCommunicationSentences: jest.fn(),
  getCommunicationServiceHealth: jest.fn(),
  getSettings: jest.fn(),
  syncCommunicationSavedPhrases: jest.fn(),
  syncConfirmedReceiverRecords: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../../common/communicationSupport/localData', () => ({
  buildCommunicationMergePreview: jest.fn(),
  buildCommunicationCloudSettingsPayload: jest.fn(),
  buildCommunicationSettingsPayload: jest.fn(),
  clearCommunicationSavedPhrases: jest.fn(),
  loadCommunicationHistory: jest.fn(),
  loadCommunicationSavedPhraseTombstones: jest.fn(),
  loadCommunicationSavedPhrases: jest.fn(),
  loadReceiverRecords: jest.fn(),
  mergeCommunicationSettings: jest.fn(),
  normalizeCommunicationSettings: jest.fn(),
  overwriteCommunicationHistory: jest.fn(),
  overwriteCommunicationSavedPhraseTombstones: jest.fn(),
  overwriteCommunicationSavedPhrases: jest.fn(),
  overwriteCommunicationSettings: jest.fn(),
  overwriteReceiverRecords: jest.fn(),
  retireAnonymousUserIdentity: jest.fn()
}));

jest.mock('./CommunicationSupport.messages', () => ({
  __esModule: true,
  default: {
    syncSuccess: {
      id: 'syncSuccess',
      defaultMessage: 'Remote settings synced successfully.'
    },
    syncFailed: {
      id: 'syncFailed',
      defaultMessage: 'Remote sync failed. Local data is still available.'
    },
    syncSuccessWithSummary: {
      id: 'syncSuccessWithSummary',
      defaultMessage: 'Sync complete with receiver conflicts.'
    },
    syncPartial: {
      id: 'syncPartial',
      defaultMessage:
        'Some communication data is still pending. Local data and delete markers are safe.'
    },
    uploadSuccess: {
      id: 'uploadSuccess',
      defaultMessage:
        'Local communication support data was uploaded to your account.'
    },
    uploadSuccessWithReceiverConflicts: {
      id: 'uploadSuccessWithReceiverConflicts',
      defaultMessage: 'Uploaded with receiver conflicts.'
    },
    importSuccess: {
      id: 'importSuccess',
      defaultMessage:
        'Communication support data was imported and merged locally.'
    },
    importSuccessWithReceiverConflicts: {
      id: 'importSuccessWithReceiverConflicts',
      defaultMessage: 'Imported with receiver conflicts.'
    },
    importFailed: {
      id: 'importFailed',
      defaultMessage: 'The selected file could not be imported.'
    },
    serviceReady: {
      id: 'serviceReady',
      defaultMessage: 'Cloud service ready.'
    },
    serviceReadyWithoutPrivatePictures: {
      id: 'serviceReadyWithoutPrivatePictures',
      defaultMessage: 'Cloud service ready without private pictures.'
    },
    serviceDegraded: {
      id: 'serviceDegraded',
      defaultMessage: 'Cloud service degraded.'
    },
    serviceFailed: {
      id: 'serviceFailed',
      defaultMessage: 'Cloud service failed.'
    },
    aiReady: {
      id: 'aiReady',
      defaultMessage: 'Available: {provider} / {model}'
    },
    imageAiReady: {
      id: 'imageAiReady',
      defaultMessage: 'Image services configured'
    },
    dialectAsrReady: {
      id: 'dialectAsrReady',
      defaultMessage: 'Cantonese ASR configured'
    },
    backgroundRemovalReady: {
      id: 'backgroundRemovalReady',
      defaultMessage: 'Background removal configured'
    },
    speechReady: {
      id: 'speechReady',
      defaultMessage: 'Fallback speech configured'
    },
    enhancementLimitsReady: {
      id: 'enhancementLimitsReady',
      defaultMessage: 'Cost protection configured'
    },
    aiTokenQuotaConfigured: {
      id: 'aiTokenQuotaConfigured',
      defaultMessage: 'AI token allowance configured'
    },
    aiTokenQuotaRemaining: {
      id: 'aiTokenQuotaRemaining',
      defaultMessage: 'AI token allowance remaining'
    },
    aiUsageReady: {
      id: 'aiUsageReady',
      defaultMessage: 'Usage available'
    },
    aiUsageUnreported: {
      id: 'aiUsageUnreported',
      defaultMessage: 'Usage partially reported'
    },
    aiUsageEmpty: {
      id: 'aiUsageEmpty',
      defaultMessage: 'No metered calls'
    },
    enhancementsReady: {
      id: 'enhancementsReady',
      defaultMessage: 'Configured: {capabilities}'
    },
    aiUnavailable: {
      id: 'aiUnavailable',
      defaultMessage: 'AI is not configured.'
    },
    aiFailed: {
      id: 'aiFailed',
      defaultMessage: 'AI status check failed.'
    },
    aiTestSuccess: {
      id: 'aiTestSuccess',
      defaultMessage: 'Live AI test succeeded: {candidate}'
    },
    aiTestRateLimited: {
      id: 'aiTestRateLimited',
      defaultMessage: 'Live AI test rate limited.'
    },
    aiTestMonthlyQuota: {
      id: 'aiTestMonthlyQuota',
      defaultMessage: 'Monthly quota exhausted.'
    },
    aiTestTimedOut: {
      id: 'aiTestTimedOut',
      defaultMessage: 'Live AI test timed out.'
    },
    aiTestFailed: {
      id: 'aiTestFailed',
      defaultMessage: 'Live AI test failed.'
    }
  }
}));

describe('CommunicationSupportContainer', () => {
  const props = {
    intl: {
      formatMessage: jest.fn(message => message.defaultMessage)
    },
    history: {
      goBack: jest.fn()
    },
    isLogged: true,
    userId: 'user-1'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    API.getCommunicationAiUsage.mockResolvedValue({
      month: '2026-07',
      requestCount: 0,
      reportedRequestCount: 0,
      unreportedRequestCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      providerReported: false,
      breakdown: []
    });
    localData.loadCommunicationSavedPhrases.mockReturnValue([
      {
        sentence: '我想喝水',
        output: [{ id: 'water', label: '水' }],
        createdAt: 100
      }
    ]);
    localData.loadCommunicationSavedPhraseTombstones.mockReturnValue([]);
    localData.clearCommunicationSavedPhrases.mockImplementation(() => {
      localData.loadCommunicationSavedPhrases.mockReturnValue([]);
      return [];
    });
    localData.loadCommunicationHistory.mockReturnValue([
      {
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['水'],
        createdAt: 200
      }
    ]);
    localData.buildCommunicationSettingsPayload.mockImplementation(
      (savedPhrases, history) => ({
        savedPhrases,
        history
      })
    );
    localData.buildCommunicationCloudSettingsPayload.mockImplementation(
      (savedPhrases, history) => ({
        savedPhrases,
        history: history.filter(
          entry =>
            !(
              entry.direction === 'receive' &&
              entry.recordStatus === 'confirmed'
            )
        )
      })
    );
    localData.loadReceiverRecords.mockReturnValue([]);
    localData.buildCommunicationMergePreview.mockReturnValue({
      localOnly: 1,
      remoteOnly: 1,
      conflicts: 2,
      localWins: 1,
      remoteWins: 1
    });
    localData.mergeCommunicationSettings.mockImplementation(
      (localValue, remoteValue) => ({
        savedPhrases: [
          ...(localValue.savedPhrases || []),
          ...(remoteValue.savedPhrases || [])
        ],
        history: [...(localValue.history || []), ...(remoteValue.history || [])]
      })
    );
    localData.normalizeCommunicationSettings.mockImplementation(value => value);
    API.syncConfirmedReceiverRecords.mockResolvedValue({
      acceptedCount: 0,
      conflictCount: 0,
      conflictedRecordIds: [],
      records: [],
      deletedRecordIds: [],
      deletedRecords: []
    });
    API.syncCommunicationSavedPhrases.mockImplementation(async phrases => ({
      acceptedCount: phrases.length,
      conflictCount: 0,
      conflictedPhraseIds: [],
      phrases,
      deletedPhraseIds: [],
      deletedPhrases: []
    }));
    API.deleteCommunicationSavedPhrases.mockResolvedValue({
      deletedCount: 0,
      deletedPhraseIds: [],
      deletedPhrases: []
    });
    API.deleteConfirmedReceiverRecords.mockResolvedValue({
      deletedCount: 0,
      deletedRecordIds: []
    });
    localData.retireAnonymousUserIdentity.mockReturnValue({
      status: 'retired'
    });
  });

  test('syncRemote merges local and remote settings and uploads the merged value', async () => {
    const remoteSettings = {
      communicationSupport: {
        savedPhrases: [
          {
            sentence: '我要去厕所',
            output: [{ id: 'toilet', label: '厕所' }],
            createdAt: 300
          }
        ],
        history: []
      }
    };
    API.getSettings.mockResolvedValue(remoteSettings);
    API.updateSettings.mockResolvedValue({});

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    const instance = wrapper.instance();

    await instance.syncRemote();
    wrapper.update();

    expect(API.getSettings).toHaveBeenCalledTimes(1);
    expect(
      localData.buildCommunicationCloudSettingsPayload
    ).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          sentence: '我要去厕所'
        })
      ],
      []
    );
    expect(localData.overwriteCommunicationHistory).toHaveBeenCalledWith([
      {
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['水'],
        createdAt: 200
      }
    ]);
    expect(API.syncCommunicationSavedPhrases).toHaveBeenCalledWith([
      expect.objectContaining({ sentence: '我想喝水' }),
      expect.objectContaining({ sentence: '我要去厕所' })
    ]);
    expect(localData.overwriteCommunicationSavedPhrases).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.any(String),
        sentence: '我想喝水'
      }),
      expect.objectContaining({
        id: expect.any(String),
        sentence: '我要去厕所',
        usageCount: 0
      })
    ]);
    expect(API.updateSettings).toHaveBeenCalledTimes(1);
    expect(API.syncConfirmedReceiverRecords).toHaveBeenCalledWith([]);
    expect(localData.overwriteReceiverRecords).toHaveBeenCalledWith([]);
    expect(localData.retireAnonymousUserIdentity).toHaveBeenCalledWith(
      'user-1'
    );
    expect(API.updateSettings.mock.calls[0][0]).toMatchObject({
      communicationSupport: expect.any(Object),
      tuyujia: expect.any(Object)
    });
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'syncSuccessWithSummary'
      }),
      {
        remoteAdded: 1,
        localAdded: 1,
        conflicts: 2,
        localWins: 1,
        remoteWins: 1,
        savedPhraseConflicts: 0,
        receiverConflicts: 0
      }
    );
  });

  test('reports confirmed receiver record conflicts in the sync result', async () => {
    API.getSettings.mockResolvedValue({});
    API.updateSettings.mockResolvedValue({});
    API.syncConfirmedReceiverRecords.mockResolvedValue({
      acceptedCount: 0,
      conflictCount: 1,
      conflictedRecordIds: ['receiver-1'],
      records: [],
      deletedRecordIds: [],
      deletedRecords: []
    });

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().syncRemote();

    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'syncSuccessWithSummary' }),
      expect.objectContaining({ receiverConflicts: 1 })
    );
  });

  test('reports a partial sync when receiver records remain local', async () => {
    API.getSettings.mockResolvedValue({});
    API.updateSettings.mockResolvedValue({});
    API.syncConfirmedReceiverRecords.mockRejectedValue(
      new Error('event endpoint unavailable')
    );

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().syncRemote();

    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultMessage:
          'Some communication data is still pending. Local data and delete markers are safe.'
      })
    );
    expect(localData.retireAnonymousUserIdentity).not.toHaveBeenCalled();
  });

  test('checks the configured AI provider without exposing credentials', async () => {
    API.getCommunicationAiHealth.mockResolvedValue({
      configured: true,
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.example.test/v1',
      imageAiConfigured: true,
      dialectAsrConfigured: true,
      dialectAsrProvider: 'tencentcloud-asr',
      dialectAsrEngine: '16k_yue',
      backgroundRemovalConfigured: true,
      backgroundRemovalProvider: 'rembg',
      speechConfigured: true,
      speechProvider: 'openai-compatible-speech',
      speechModel: 'gpt-4o-mini-tts',
      enhancementRateLimitEnabled: true,
      enhancementPointsPerMinute: 30,
      enhancementMonthlyPoints: 1000,
      aiTokenQuotaEnabled: true,
      aiMonthlyTokenQuota: 1000000,
      aiTextTokenReservation: 4096,
      aiImageTokenReservation: 32768
    });
    API.getCommunicationAiUsage.mockResolvedValue({
      month: '2026-07',
      requestCount: 3,
      reportedRequestCount: 2,
      unreportedRequestCount: 1,
      promptTokens: 40,
      completionTokens: 12,
      totalTokens: 52,
      providerReported: false,
      tokenQuota: {
        enabled: true,
        month: '2026-07',
        limitTokens: 1000000,
        consumedTokens: 52,
        remainingTokens: 999948,
        resetAt: '2026-08-01T00:00:00.000Z'
      },
      breakdown: []
    });

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().checkAiStatus();

    expect(API.getCommunicationAiHealth).toHaveBeenCalledTimes(1);
    expect(API.getCommunicationAiUsage).toHaveBeenCalledTimes(1);
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiReady' }),
      {
        provider: 'openai-compatible',
        model: 'gpt-4o-mini'
      }
    );
    expect(wrapper.state('aiChecking')).toBe(false);
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'imageAiReady' })
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dialectAsrReady' }),
      {
        provider: 'tencentcloud-asr',
        engine: '16k_yue'
      }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'backgroundRemovalReady' }),
      { provider: 'rembg' }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'speechReady' }),
      {
        provider: 'openai-compatible-speech',
        model: 'gpt-4o-mini-tts'
      }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'enhancementLimitsReady' }),
      {
        pointsPerMinute: 30,
        monthlyPoints: 1000
      }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiTokenQuotaConfigured' }),
      { limitTokens: 1000000 }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiTokenQuotaRemaining' }),
      {
        month: '2026-07',
        remainingTokens: 999948,
        limitTokens: 1000000
      }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiUsageUnreported' }),
      {
        month: '2026-07',
        totalTokens: 52,
        requestCount: 3,
        unreportedRequestCount: 1
      }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'enhancementsReady' }),
      expect.objectContaining({
        capabilities: expect.any(String)
      })
    );
  });

  test('keeps AI health usable when the newer usage route is unavailable', async () => {
    API.getCommunicationAiHealth.mockResolvedValue({
      configured: true,
      provider: 'openai-compatible',
      model: 'gpt-4o-mini'
    });
    API.getCommunicationAiUsage.mockRejectedValue(new Error('404'));

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().checkAiStatus();

    expect(wrapper.state('aiChecking')).toBe(false);
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiReady' }),
      {
        provider: 'openai-compatible',
        model: 'gpt-4o-mini'
      }
    );
  });

  test('does not present an empty usage ledger or limits as configured AI', async () => {
    API.getCommunicationAiHealth.mockResolvedValue({
      configured: false,
      imageAiConfigured: false,
      dialectAsrConfigured: false,
      backgroundRemovalConfigured: false,
      speechConfigured: false,
      enhancementRateLimitEnabled: true,
      enhancementPointsPerMinute: 30,
      enhancementMonthlyPoints: 1000
    });

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().checkAiStatus();

    expect(API.getCommunicationAiUsage).not.toHaveBeenCalled();
    expect(props.intl.formatMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiUsageEmpty' }),
      expect.anything()
    );
    expect(props.intl.formatMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'enhancementLimitsReady' }),
      expect.anything()
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiUnavailable' })
    );
    expect(wrapper.state('aiChecking')).toBe(false);
  });

  test('runs a content-free live AI connection test through the existing endpoint', async () => {
    API.generateCommunicationSentences.mockResolvedValue({
      candidates: ['我想喝水'],
      provider: 'cboard-api-ai',
      isOfflineFallback: false
    });

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().testAiConnection();

    expect(API.generateCommunicationSentences).toHaveBeenCalledWith(
      {
        pictogramLabels: ['我', '喝水'],
        candidateCount: 1
      },
      { timeout: 10000 }
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiTestSuccess' }),
      { candidate: '我想喝水' }
    );
    expect(wrapper.state('aiTesting')).toBe(false);
  });

  test('reports monthly quota exhaustion without exposing an upstream message', async () => {
    API.generateCommunicationSentences.mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: {
            code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED',
            message: 'provider secret'
          }
        }
      }
    });

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().testAiConnection();

    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiTestMonthlyQuota' })
    );
    expect(props.intl.formatMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ defaultMessage: 'provider secret' })
    );
    expect(wrapper.state('aiTesting')).toBe(false);
  });

  test('releases a timed-out live AI test with a bounded local message', async () => {
    API.generateCommunicationSentences.mockRejectedValue({
      code: 'ECONNABORTED',
      message: 'provider timeout secret'
    });

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().testAiConnection();

    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'aiTestTimedOut' })
    );
    expect(props.intl.formatMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ defaultMessage: 'provider timeout secret' })
    );
    expect(wrapper.state('aiTesting')).toBe(false);
  });

  test('checks public API readiness without requiring account data', async () => {
    API.getCommunicationServiceHealth.mockResolvedValue({
      status: 'ok',
      database: 'connected',
      communicationIndexes: 'ready',
      privatePictureLibrary: 'unconfigured'
    });

    const wrapper = shallow(
      <CommunicationSupportContainer {...props} isLogged={false} />
    );
    await wrapper.instance().checkServiceStatus();

    expect(API.getCommunicationServiceHealth).toHaveBeenCalledTimes(1);
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'serviceReadyWithoutPrivatePictures' })
    );
    expect(wrapper.state('serviceChecking')).toBe(false);
  });

  test('reports a reachable but degraded communication API separately from AI', async () => {
    API.getCommunicationServiceHealth.mockResolvedValue({
      status: 'degraded',
      database: 'connected',
      communicationIndexes: 'building',
      privatePictureLibrary: 'unconfigured'
    });

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().checkServiceStatus();

    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'serviceDegraded' })
    );
    expect(API.getCommunicationAiHealth).not.toHaveBeenCalled();
  });

  test('importJson merges imported data locally and syncs when logged in', async () => {
    API.updateSettings.mockResolvedValue({});

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    const instance = wrapper.instance();
    const event = {
      target: {
        files: [
          {
            text: async () =>
              JSON.stringify({
                savedPhrases: [
                  {
                    sentence: '需要吃药',
                    output: [{ id: 'medicine', label: '药' }],
                    createdAt: 400
                  }
                ],
                history: []
              })
          }
        ],
        value: 'selected'
      }
    };

    await instance.importJson(event);
    wrapper.update();

    expect(localData.overwriteCommunicationSettings).toHaveBeenCalledWith({
      savedPhrases: [
        {
          sentence: '我想喝水',
          output: [{ id: 'water', label: '水' }],
          createdAt: 100
        },
        {
          sentence: '需要吃药',
          output: [{ id: 'medicine', label: '药' }],
          createdAt: 400
        }
      ],
      history: [
        {
          direction: 'receive',
          inputText: '我想喝水',
          labels: ['水'],
          createdAt: 200
        }
      ]
    });
    expect(API.updateSettings).toHaveBeenCalledTimes(1);
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultMessage:
          'Communication support data was imported and merged locally.'
      })
    );
    expect(event.target.value).toBe('');
  });

  test('clearHistory keeps saved phrases and syncs the cleared history remotely', async () => {
    API.updateSettings.mockResolvedValue({});

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    const instance = wrapper.instance();

    await instance.clearHistory();

    expect(localData.overwriteCommunicationHistory).toHaveBeenCalledWith([]);
    expect(localData.overwriteReceiverRecords).toHaveBeenCalledWith([]);
    expect(API.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        communicationSupport: {
          savedPhrases: [
            expect.objectContaining({
              id: expect.any(String),
              sentence: '我想喝水',
              output: [{ id: 'water', label: '水' }],
              usageCount: 0,
              createdAt: 100,
              lastUsedAt: 100,
              updatedAt: 100
            })
          ],
          history: []
        }
      })
    );
    expect(API.deleteConfirmedReceiverRecords).toHaveBeenCalledWith([], {
      deleteAll: true
    });
  });

  test('clearSaved keeps local tombstones and requests a server-wide deletion', async () => {
    API.updateSettings.mockResolvedValue({});

    const wrapper = shallow(<CommunicationSupportContainer {...props} />);
    await wrapper.instance().clearSaved();

    expect(localData.clearCommunicationSavedPhrases).toHaveBeenCalledWith({
      deletedBy: 'user-1'
    });
    expect(API.deleteCommunicationSavedPhrases).toHaveBeenCalledWith([], {
      deleteAll: true
    });
    expect(API.syncCommunicationSavedPhrases).toHaveBeenCalledWith([]);
    expect(API.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        communicationSupport: expect.objectContaining({
          savedPhrases: []
        })
      })
    );
  });
});
