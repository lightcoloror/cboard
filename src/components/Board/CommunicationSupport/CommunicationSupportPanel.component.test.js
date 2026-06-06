import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import CommunicationSupportPanel from './CommunicationSupportPanel.component';
import * as symbolMatching from '../../../common/communicationSupport/symbolMatching';
import * as localData from '../../../common/communicationSupport/localData';

const mockedOutput = [
  {
    id: 'want',
    label: '想',
    image: '/want.png'
  },
  {
    id: 'water',
    label: '水',
    image: '/water.png'
  }
];

const mockedMatches = [
  {
    token: '想',
    matchType: 'exact',
    tile: {
      id: 'want',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'want',
        label: '想',
        image: '/want.png'
      }
    }
  },
  {
    token: '水',
    matchType: 'exact',
    tile: {
      id: 'water',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'water',
        label: '水',
        image: '/water.png'
      }
    }
  }
];

const mockedEditableMatches = [
  {
    token: '想',
    matchType: 'exact',
    tile: {
      id: 'want',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'want',
        label: '想',
        image: '/want.png'
      }
    }
  },
  {
    token: '喝',
    matchType: 'exact',
    tile: {
      id: 'drink',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'drink',
        label: '喝',
        image: '/drink.png'
      }
    }
  },
  {
    token: '水',
    matchType: 'exact',
    tile: {
      id: 'water',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'water',
        label: '水',
        image: '/water.png'
      }
    }
  }
];

const mockAppendCommunicationHistory = jest.fn();

jest.mock('../../../api', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../../common/communicationSupport/symbolMatching', () => ({
  buildCommunicationTileCatalog: jest.fn(),
  createCommunicationOutputFromMatches: jest.fn(),
  matchTextToCommunicationTiles: jest.fn()
}));

jest.mock('../../../common/communicationSupport/localData', () => ({
  appendCommunicationHistory: jest.fn(),
  buildCommunicationSettingsPayload: jest.fn(),
  loadCommunicationHistory: jest.fn(),
  loadCommunicationSavedPhrases: jest.fn(),
  mergeCommunicationSettings: jest.fn(),
  overwriteCommunicationSettings: jest.fn(),
  saveCommunicationPhrase: jest.fn()
}));

jest.mock('../../../common/communicationSupport/browserSpeech', () => ({
  useBrowserSpeechRecognition: () => ({
    isListening: false,
    interimText: '',
    error: '',
    stopListening: jest.fn(),
    startListening: jest.fn()
  })
}));

jest.mock('../Symbol', () => {
  return function MockSymbol(props) {
    return <div className="MockSymbol">{props.label}</div>;
  };
});

async function setReceiveInput(wrapper, value) {
  const textFields = wrapper.find('ForwardRef(TextField)');
  await act(async () => {
    textFields.at(0).prop('onChange')({
      target: { value }
    });
  });
  wrapper.update();
}

async function openReceiveReview(wrapper, value) {
  const receiveTabButton = wrapper
    .find('button')
    .filterWhere(node => node.text() === '接收理解')
    .first();

  receiveTabButton.simulate('click');
  await setReceiveInput(wrapper, value);

  const generateButton = wrapper
    .find('ForwardRef(Button)')
    .filterWhere(node => node.text() === '生成图片序列')
    .first();

  generateButton.simulate('click');

  await act(async () => {
    jest.runAllTimers();
  });
  wrapper.update();
}

describe('CommunicationSupportPanel receiver flow', () => {
  const onApplyOutput = jest.fn();

  const props = {
    boards: [],
    output: [],
    activeBoardId: 'home',
    onApplyOutput,
    onJumpBoard: jest.fn(),
    intl: null,
    isLogged: false,
    copyOverrides: null
  };

  beforeEach(() => {
    jest.useFakeTimers();
    onApplyOutput.mockClear();
    mockAppendCommunicationHistory.mockClear();
    symbolMatching.buildCommunicationTileCatalog.mockReturnValue([
      {
        id: 'want',
        boardName: '首页',
        labels: ['想'],
        synonyms: [],
        tile: {
          id: 'want',
          label: '想',
          image: '/want.png'
        }
      },
      {
        id: 'water',
        boardName: '首页',
        labels: ['水'],
        synonyms: [],
        tile: {
          id: 'water',
          label: '水',
          image: '/water.png'
        }
      },
      {
        id: 'drink',
        boardName: '饮品',
        labels: ['饮料'],
        synonyms: ['喝的'],
        tile: {
          id: 'drink',
          label: '饮料',
          image: '/drink.png'
        }
      }
    ]);
    symbolMatching.createCommunicationOutputFromMatches.mockImplementation(
      matches =>
        matches
          .filter(item => item.tile && item.tile.tile)
          .map(item => ({
            id: item.tile.tile.id,
            label: item.tile.tile.label,
            image: item.tile.tile.image
          }))
    );
    symbolMatching.matchTextToCommunicationTiles.mockReturnValue({
      matches: mockedMatches,
      matchRate: 1
    });
    localData.appendCommunicationHistory.mockImplementation((...args) =>
      mockAppendCommunicationHistory(...args)
    );
    localData.buildCommunicationSettingsPayload.mockReturnValue({
      savedPhrases: [],
      history: []
    });
    localData.loadCommunicationHistory.mockReturnValue([]);
    localData.loadCommunicationSavedPhrases.mockReturnValue([]);
    localData.mergeCommunicationSettings.mockImplementation(
      localValue => localValue
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('supports a closed receiver loop from text input to output apply', async () => {
    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    await openReceiveReview(wrapper, '我想喝水');

    expect(wrapper.text().includes('预览图片：想 / 水')).toBe(true);

    const sendButton = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '发送到输出栏')
      .first();

    sendButton.simulate('click');

    expect(onApplyOutput).toHaveBeenCalledWith(mockedOutput);
    expect(mockAppendCommunicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['想', '水']
      })
    );
  });

  test('lets the receiver reorder and replace matches before sending to output', async () => {
    symbolMatching.matchTextToCommunicationTiles.mockReturnValue({
      matches: mockedEditableMatches,
      matchRate: 1
    });

    const wrapper = mount(<CommunicationSupportPanel {...props} />);
    await openReceiveReview(wrapper, '我想喝水');

    expect(wrapper.text()).toContain('预览图片：想 / 喝 / 水');

    const rightButtons = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '右移');
    rightButtons.at(0).simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('预览图片：喝 / 想 / 水');

    const replaceButtons = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '换图');
    replaceButtons.at(2).simulate('click');
    wrapper.update();

    const swapOption = wrapper
      .find('button')
      .filterWhere(node => node.text().includes('饮料'))
      .first();
    swapOption.simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('预览图片：喝 / 想 / 饮料');

    const sendButton = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '发送到输出栏')
      .first();
    sendButton.simulate('click');

    expect(onApplyOutput).toHaveBeenCalledWith([
      {
        id: 'drink',
        label: '喝',
        image: '/drink.png'
      },
      {
        id: 'want',
        label: '想',
        image: '/want.png'
      },
      {
        id: 'drink',
        label: '饮料',
        image: '/drink.png'
      }
    ]);
    expect(mockAppendCommunicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['喝', '想', '饮料']
      })
    );
  });

  test('can open directly in receive mode for integrated board entry', () => {
    const wrapper = mount(
      <CommunicationSupportPanel {...props} initialMode="receive" />
    );

    expect(wrapper.text()).toContain('文字转图片');
    expect(wrapper.text()).toContain('生成图片序列');
    expect(wrapper.text()).not.toContain('候选句播报');
  });
});
