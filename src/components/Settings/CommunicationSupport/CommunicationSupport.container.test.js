import React from 'react';
import { shallow } from 'enzyme';
import API from '../../../api';
import * as localData from '../../../common/communicationSupport/localData';
import { CommunicationSupportContainer } from './CommunicationSupport.container';

jest.mock('../../../api', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../../common/communicationSupport/localData', () => ({
  buildCommunicationSettingsPayload: jest.fn(),
  loadCommunicationHistory: jest.fn(),
  loadCommunicationSavedPhrases: jest.fn(),
  mergeCommunicationSettings: jest.fn(),
  normalizeCommunicationSettings: jest.fn(),
  overwriteCommunicationHistory: jest.fn(),
  overwriteCommunicationSavedPhrases: jest.fn(),
  overwriteCommunicationSettings: jest.fn()
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
    uploadSuccess: {
      id: 'uploadSuccess',
      defaultMessage:
        'Local communication support data was uploaded to your account.'
    },
    importSuccess: {
      id: 'importSuccess',
      defaultMessage:
        'Communication support data was imported and merged locally.'
    },
    importFailed: {
      id: 'importFailed',
      defaultMessage: 'The selected file could not be imported.'
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
    isLogged: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localData.loadCommunicationSavedPhrases.mockReturnValue([
      {
        sentence: '我想喝水',
        output: [{ id: 'water', label: '水' }],
        createdAt: 100
      }
    ]);
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
    expect(localData.overwriteCommunicationSettings).toHaveBeenCalledWith({
      savedPhrases: [
        {
          sentence: '我想喝水',
          output: [{ id: 'water', label: '水' }],
          createdAt: 100
        },
        {
          sentence: '我要去厕所',
          output: [{ id: 'toilet', label: '厕所' }],
          createdAt: 300
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
    expect(API.updateSettings.mock.calls[0][0]).toMatchObject({
      communicationSupport: expect.any(Object),
      tuyujia: expect.any(Object)
    });
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultMessage: 'Remote settings synced successfully.'
      })
    );
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
    expect(API.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        communicationSupport: {
          savedPhrases: [
            {
              sentence: '我想喝水',
              output: [{ id: 'water', label: '水' }],
              createdAt: 100
            }
          ],
          history: []
        }
      })
    );
  });
});
