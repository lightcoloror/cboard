import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ReceiverLoopPanel from './ReceiverLoopPanel.component';
import * as symbolMatching from '../../../common/communicationSupport/symbolMatching';

const mockedMatches = [
  {
    token: '想',
    matchType: 'exact',
    tile: {
      id: 'want',
      boardId: 'home',
      boardName: '首页',
      displayLabel: '想',
      tile: {
        id: 'want',
        label: '我想',
        image: '/want.png'
      }
    }
  },
  {
    token: '喝',
    matchType: 'exact',
    tile: {
      id: 'drink-verb',
      boardId: 'home',
      boardName: '首页',
      tile: {
        id: 'drink-verb',
        label: '喝',
        image: '/drink-verb.png'
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

jest.mock('../../../common/communicationSupport/symbolMatching', () => ({
  buildCommunicationTileCatalog: jest.fn(),
  createCommunicationOutputFromMatches: jest.fn(),
  matchTextToCommunicationTiles: jest.fn()
}));

jest.mock('../Symbol', () => {
  return function MockSymbol(props) {
    return (
      <div className={`MockSymbol ${props.className || ''}`}>{props.label}</div>
    );
  };
});

async function setInput(wrapper, value) {
  const textField = wrapper.find('ForwardRef(TextField)').at(0);
  await act(async () => {
    textField.prop('onChange')({
      target: { value }
    });
  });
  wrapper.update();
}

describe('ReceiverLoopPanel', () => {
  const onApplyOutput = jest.fn();
  const onAppendHistory = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    onApplyOutput.mockClear();
    onAppendHistory.mockClear();
    symbolMatching.buildCommunicationTileCatalog.mockReturnValue([
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
    symbolMatching.matchTextToCommunicationTiles.mockClear();
    symbolMatching.matchTextToCommunicationTiles.mockReturnValue({
      matches: mockedMatches,
      matchRate: 1
    });
    symbolMatching.createCommunicationOutputFromMatches.mockImplementation(
      matches =>
        matches
          .filter(item => item.tile && item.tile.tile)
          .map(item => ({
            id: item.tile.tile.id,
            label: item.tile.displayLabel || item.tile.tile.label,
            image: item.tile.tile.image
          }))
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('supports a text-token-image receiver loop without wrapper dependencies', async () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onAppendHistory={onAppendHistory}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');

    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    expect(wrapper.text()).toContain('匹配结果：3/3');
    expect(wrapper.text()).toContain('已全部匹配，发送前请确认');
    expect(wrapper.text()).toContain('精确匹配');
    expect(wrapper.text()).toContain('预览图片：想 / 喝 / 水');
    expect(
      wrapper.find('div.MockSymbol.CommunicationSupportPanel__symbol--preview')
    ).toHaveLength(3);
    expect(
      wrapper
        .find('div.MockSymbol.CommunicationSupportPanel__symbol--preview')
        .at(0)
        .text()
    ).toBe('想');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '右移')
      .at(0)
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('预览图片：喝 / 想 / 水');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '换图')
      .at(2)
      .simulate('click');
    wrapper.update();

    expect(
      wrapper.find('div.MockSymbol.CommunicationSupportPanel__symbol--swap')
        .length
    ).toBeGreaterThan(0);

    wrapper
      .find('button')
      .filterWhere(node => node.text().includes('饮料'))
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('预览图片：喝 / 想 / 饮料');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '发送到输出栏')
      .first()
      .simulate('click');

    expect(onApplyOutput).toHaveBeenCalledWith([
      {
        id: 'drink-verb',
        label: '喝',
        image: '/drink-verb.png'
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
    expect(onAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: 1,
        direction: 'receive',
        inputText: '我想喝水',
        labels: ['喝', '想', '饮料'],
        output: expect.any(Array),
        pictogramSequence: expect.arrayContaining([
          expect.objectContaining({
            pictogramId: 'drink',
            matchType: 'manual',
            originalToken: '水'
          })
        ])
      })
    );
  });

  test('cancels a delayed match when the caregiver resets the input', async () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        onAppendHistory={onAppendHistory}
        historyItems={[]}
      />
    );

    await setInput(wrapper, '我想喝水');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '生成图片序列')
      .first()
      .simulate('click');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '重新输入')
      .first()
      .simulate('click');

    await act(async () => {
      jest.runAllTimers();
    });
    wrapper.update();

    expect(symbolMatching.matchTextToCommunicationTiles).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('预览图片：');
    wrapper.unmount();
  });

  test('hides unsupported browser speech and keeps text input available', () => {
    const wrapper = mount(
      <ReceiverLoopPanel
        boards={[]}
        intl={null}
        onApplyOutput={onApplyOutput}
        onJumpBoard={jest.fn()}
        historyItems={[]}
        speech={{
          isAvailable: false,
          isListening: false,
          interimText: '',
          error: '',
          startListening: jest.fn(),
          stopListening: jest.fn()
        }}
      />
    );

    expect(wrapper.text()).toContain(
      '当前环境不支持浏览器语音输入，请使用文字输入。'
    );
    expect(
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '语音输入')
    ).toHaveLength(0);
    expect(wrapper.find('ForwardRef(TextField)')).toHaveLength(1);
    wrapper.unmount();
  });
});
