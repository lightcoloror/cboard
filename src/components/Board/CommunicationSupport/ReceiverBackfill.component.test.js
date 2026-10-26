import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ReceiverLoopPanel from './ReceiverLoopPanel.component';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';

jest.mock('../Symbol', () => props => (
  <img src={props.image} alt={props.label} />
));
const boards = [
  { id: 'b', tiles: [{ id: 'grape', label: '葡萄', image: '/grape.png' }] }
];
const candidate = {
  id: 'grapefruit',
  label: '葡萄柚',
  image: 'data:image/png;base64,aGVsbG8=',
  source: {
    provider: 'opensymbols',
    originalId: 'grapefruit',
    name: 'OpenSymbols',
    license: 'CC BY-SA',
    sourceUrl: 'https://example.test/grapefruit'
  }
};

test('real matching queues grapefruit and a confirmed image updates the current review without regeneration', async () => {
  jest.useFakeTimers();
  localStorage.clear();
  const repo = createCommunicationRepository({ storage: localStorage });
  const record = jest.fn(entry => repo.recordMissingTokens(entry));
  const wrapper = mount(
    <ReceiverLoopPanel
      boards={boards}
      onRecordMissingTokens={record}
      missingTokenRecords={[]}
      onApplyOutput={jest.fn()}
      onJumpBoard={jest.fn()}
      onAppendHistory={jest.fn()}
    />
  );
  try {
    await act(async () => {
      wrapper
        .find('ForwardRef(TextField)')
        .first()
        .prop('onChange')({ target: { value: '葡萄柚' } });
    });
    wrapper.update();
    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(n => n.text() === '生成图片序列')
        .first()
        .simulate('click');
      jest.runAllTimers();
    });
    wrapper.update();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['葡萄柚'] })
    );
    expect(wrapper.text()).toContain('图片匹配：0/1');
    const gap = repo.loadMissingTokens()[0];
    repo.reviewMissingToken(gap.id, {
      status: 'suggested',
      suggestedPictogram: candidate,
      source: 'online'
    });
    await act(async () => {
      wrapper.setProps({ missingTokenRecords: repo.loadMissingTokens() });
    });
    wrapper.update();
    expect(wrapper.text()).toContain('图片匹配：0/1');
    repo.reviewMissingToken(gap.id, {
      status: 'resolved',
      resolvedPictogram: candidate,
      resolvedPictogramId: candidate.id,
      source: 'online',
      reviewedByCaregiver: true
    });
    await act(async () => {
      wrapper.setProps({ missingTokenRecords: repo.loadMissingTokens() });
    });
    wrapper.update();
    expect(wrapper.text()).toContain('图片匹配：1/1');
    expect(
      wrapper.find('img').someWhere(n => n.prop('src') === candidate.image)
    ).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
  } finally {
    wrapper.unmount();
    jest.useRealTimers();
    localStorage.clear();
  }
});

test('token-level confirmation cannot reintroduce the person-heat picture in water context', async () => {
  jest.useFakeTimers();
  localStorage.clear();
  const temperatureBoards = [
    {
      id: 'b',
      tiles: [
        { id: 'water', label: '水', image: '/water.png' },
        {
          id: 'SyS0fA96XqtW',
          label: '热',
          image: '/symbols/mulberry/hot_person.svg'
        }
      ]
    }
  ];
  const repo = createCommunicationRepository({ storage: localStorage });
  const wrapper = mount(
    <ReceiverLoopPanel
      boards={temperatureBoards}
      missingTokenRecords={[]}
      onRecordMissingTokens={entry => repo.recordMissingTokens(entry)}
      onApplyOutput={jest.fn()}
      onJumpBoard={jest.fn()}
      onAppendHistory={jest.fn()}
    />
  );
  try {
    await act(async () => {
      wrapper
        .find('ForwardRef(TextField)')
        .first()
        .prop('onChange')({ target: { value: '水太热' } });
    });
    wrapper.update();
    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(n => n.text() === '生成图片序列')
        .first()
        .simulate('click');
      jest.runAllTimers();
    });
    wrapper.update();
    const hot = repo
      .loadMissingTokens()
      .find(item => item.normalizedToken === '热');
    expect(hot).toBeDefined();
    repo.reviewMissingToken(hot.id, {
      status: 'resolved',
      resolvedPictogramId: 'SyS0fA96XqtW',
      reviewedByCaregiver: true
    });
    await act(async () => {
      wrapper.setProps({ missingTokenRecords: repo.loadMissingTokens() });
    });
    wrapper.update();
    expect(
      wrapper
        .find('img')
        .someWhere(n => n.prop('src') === '/symbols/mulberry/hot_person.svg')
    ).toBe(false);
    expect(
      wrapper
        .find('ForwardRef(TextField)')
        .first()
        .prop('value')
    ).toBe('水太热');
  } finally {
    wrapper.unmount();
    jest.useRealTimers();
    localStorage.clear();
  }
});
