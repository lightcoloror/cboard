import API from './api';

jest.mock('../store');

describe('communication API calls', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('posts sentence requests with the CBoard bearer token', async () => {
    const post = jest
      .spyOn(API.axiosInstance, 'post')
      .mockResolvedValue({ data: { candidates: ['我要喝水。'] } });

    await expect(
      API.generateCommunicationSentences({ pictogramLabels: ['水'] })
    ).resolves.toEqual({ candidates: ['我要喝水。'] });
    expect(post).toHaveBeenCalledWith(
      '/gpt/communication/sentences',
      { pictogramLabels: ['水'] },
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /)
        }
      }
    );
  });

  test('applies a bounded timeout when a sentence caller requests one', async () => {
    const post = jest
      .spyOn(API.axiosInstance, 'post')
      .mockResolvedValue({ data: { candidates: ['我要喝水。'] } });

    await API.generateCommunicationSentences(
      { pictogramLabels: ['我', '喝水'] },
      { timeout: 120000 }
    );

    expect(post).toHaveBeenCalledWith(
      '/gpt/communication/sentences',
      { pictogramLabels: ['我', '喝水'] },
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /)
        },
        timeout: 60000
      }
    );
  });

  test('posts bounded resegmentation requests through the existing route', async () => {
    const request = {
      text: '我要喝水',
      pictogramVocabulary: ['我', '要', '喝', '水']
    };
    const post = jest
      .spyOn(API.axiosInstance, 'post')
      .mockResolvedValue({ data: { tokens: ['我', '要', '喝', '水'] } });

    await expect(API.resegmentCommunicationText(request)).resolves.toEqual({
      tokens: ['我', '要', '喝', '水']
    });
    expect(post).toHaveBeenCalledWith('/gpt/communication/resegment', request, {
      headers: {
        Authorization: expect.stringMatching(/^Bearer /)
      }
    });
  });

  test('sends only bounded missing tokens and trusts only API-hosted images', async () => {
    const post = jest.spyOn(API.axiosInstance, 'post').mockResolvedValue({
      data: {
        results: [
          {
            token: '苹果',
            pictogram: {
              id: 'runtime-apple',
              imageUrl: '/pictograms/arasaac/123/image'
            }
          },
          {
            token: '药瓶',
            pictogram: {
              id: 'runtime-mulberry-medicine',
              imageUrl:
                '/pictograms/opensymbols/signed-candidate.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/image',
              source: {
                provider: 'opensymbols',
                name: 'OpenSymbols / mulberry',
                license: 'CC BY-SA 2.0 UK'
              }
            }
          },
          {
            token: '危险',
            pictogram: {
              id: 'runtime-evil',
              imageUrl: 'https://evil.example/image.png'
            }
          }
        ]
      }
    });

    const result = await API.searchCommunicationPictograms([
      '苹果',
      '苹果',
      '',
      ...Array.from({ length: 20 }, (_, index) => `词${index}`)
    ]);

    expect(post).toHaveBeenCalledWith('/pictograms/search', {
      tokens: expect.any(Array)
    });
    expect(post.mock.calls[0][1].tokens).toHaveLength(12);
    expect(result).toHaveLength(2);
    expect(result[0].pictogram.image).toMatch(
      /^https?:\/\/[^/]+\/pictograms\/arasaac\/123\/image$/
    );
    expect(result[1].pictogram.image).toMatch(
      /^https?:\/\/[^/]+\/pictograms\/opensymbols\/signed-candidate\.a{32}\/image$/
    );
    expect(result[1].pictogram.source).toEqual(
      expect.objectContaining({
        provider: 'opensymbols',
        license: 'CC BY-SA 2.0 UK'
      })
    );
  });

  test('syncs only confirmed receiver records through the bearer route', async () => {
    const confirmed = {
      id: 'receiver-1',
      sessionId: 'session-1',
      patientId: 'patient-1',
      workspaceId: 'workspace-1',
      direction: 'receive',
      recordStatus: 'confirmed',
      inputText: '我想喝水',
      labels: ['想', '水'],
      pictogramSequence: [
        {
          pictogramId: 'water',
          label: '水',
          source: 'local_dict',
          boardId: 'home',
          matchType: 'exact',
          confidence: 1,
          originalToken: '水'
        }
      ],
      createdAt: 10,
      updatedAt: 20,
      confirmedAt: 20
    };
    const post = jest.spyOn(API.axiosInstance, 'post').mockResolvedValue({
      data: {
        acceptedCount: 1,
        conflictCount: 1,
        conflictedRecordIds: ['receiver-1'],
        records: [
          {
            ...confirmed,
            serverVersion: 2,
            conflicted: true
          }
        ],
        deletedRecordIds: [],
        deletedRecords: [
          {
            id: 'receiver-deleted',
            deletedAt: 30,
            deletedBy: 'user-1',
            serverVersion: 2
          }
        ]
      }
    });

    await expect(
      API.syncConfirmedReceiverRecords([
        confirmed,
        { ...confirmed, id: 'draft-1', recordStatus: 'draft' }
      ])
    ).resolves.toEqual({
      acceptedCount: 1,
      conflictCount: 1,
      conflictedRecordIds: ['receiver-1'],
      records: [
        {
          ...confirmed,
          serverVersion: 2,
          conflicted: true
        }
      ],
      deletedRecordIds: ['receiver-deleted'],
      deletedRecords: [
        {
          id: 'receiver-deleted',
          deletedAt: 30,
          deletedBy: 'user-1',
          serverVersion: 2
        }
      ]
    });

    expect(post).toHaveBeenCalledWith(
      '/communication/receiver-records/sync',
      {
        records: [
          expect.objectContaining({
            id: 'receiver-1',
            recordStatus: 'confirmed'
          })
        ]
      },
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /)
        }
      }
    );
    expect(post.mock.calls[0][1].records).toHaveLength(1);
    expect(
      post.mock.calls[0][1].records[0].pictogramSequence[0]
    ).not.toHaveProperty('boardId');
  });

  test('marks selected receiver records as deleted through the bearer route', async () => {
    const remove = jest.spyOn(API.axiosInstance, 'delete').mockResolvedValue({
      data: {
        deletedCount: 1,
        deletedRecordIds: ['receiver-1']
      }
    });

    await expect(
      API.deleteConfirmedReceiverRecords(['receiver-1'])
    ).resolves.toEqual({
      deletedCount: 1,
      deletedRecordIds: ['receiver-1'],
      deletedRecords: []
    });
    expect(remove).toHaveBeenCalledWith('/communication/receiver-records', {
      data: { recordIds: ['receiver-1'] },
      headers: {
        Authorization: expect.stringMatching(/^Bearer /)
      }
    });
  });

  test('syncs versioned saved phrases without device-private image data', async () => {
    const phrase = {
      id: 'phrase-water',
      sentence: '我要喝水',
      output: [
        {
          id: 'device_private_family-cup',
          label: '家庭杯子',
          image: 'wxfile://private/cup.png',
          source: 'user'
        },
        { id: 'water', label: '水' }
      ],
      usageCount: 1,
      createdAt: 10,
      lastUsedAt: 15,
      updatedAt: 20,
      serverVersion: 2
    };
    const post = jest.spyOn(API.axiosInstance, 'post').mockResolvedValue({
      data: {
        acceptedCount: 1,
        conflictCount: 0,
        conflictedPhraseIds: [],
        phrases: [{ ...phrase, serverVersion: 3 }],
        deletedPhraseIds: [],
        deletedPhrases: [
          {
            id: 'phrase-old',
            deletedAt: 30,
            deletedBy: 'user-1',
            serverVersion: 2
          }
        ]
      }
    });

    await expect(API.syncCommunicationSavedPhrases([phrase])).resolves.toEqual(
      expect.objectContaining({
        acceptedCount: 1,
        conflictCount: 0,
        deletedPhraseIds: ['phrase-old']
      })
    );
    expect(post).toHaveBeenCalledWith(
      '/communication/saved-phrases/sync',
      {
        phrases: [
          expect.objectContaining({
            id: 'phrase-water',
            baseVersion: 2,
            output: [
              { label: '家庭杯子' },
              expect.objectContaining({ id: 'water', label: '水' })
            ]
          })
        ]
      },
      {
        headers: {
          Authorization: expect.stringMatching(/^Bearer /)
        }
      }
    );
    expect(post.mock.calls[0][1].phrases[0]).not.toHaveProperty(
      'serverVersion'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).not.toContain('wxfile:');
  });

  test('marks saved phrases as deleted through the bearer route', async () => {
    const remove = jest.spyOn(API.axiosInstance, 'delete').mockResolvedValue({
      data: {
        deletedCount: 1,
        deletedPhraseIds: ['phrase-water'],
        deletedPhrases: [
          {
            id: 'phrase-water',
            deletedAt: 30,
            deletedBy: 'user-1',
            serverVersion: 3
          }
        ]
      }
    });

    await expect(
      API.deleteCommunicationSavedPhrases(['phrase-water'])
    ).resolves.toEqual({
      deletedCount: 1,
      deletedPhraseIds: ['phrase-water'],
      deletedPhrases: [
        {
          id: 'phrase-water',
          deletedAt: 30,
          deletedBy: 'user-1',
          serverVersion: 3
        }
      ]
    });
    expect(remove).toHaveBeenCalledWith('/communication/saved-phrases', {
      data: { phraseIds: ['phrase-water'] },
      headers: {
        Authorization: expect.stringMatching(/^Bearer /)
      }
    });
  });
});
