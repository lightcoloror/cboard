import React, { useState } from 'react';
import { mount } from 'enzyme';
import { IntlProvider } from 'react-intl';
import { Scanner } from 'react-scannable';
import { OutputContainer } from './Output.container';
import SymbolOutput from './SymbolOutput';
import zhMessages from '../../../translations/zh-CN.json';

// The repository's default IntlProvider mock renders no children. Exercise the
// actual button and Chinese label for this integration test.
jest.unmock('react-intl');

const intl = { locale: 'zh-CN', messages: {}, formatMessage: ({ id }) => id };
const initial = [
  { id: 'a', label: '我', image: '/symbols/person.svg' },
  {
    id: 'b',
    label: '喝水',
    image: '/symbols/water.svg',
    vocalization: '喝温水',
    audio: '/synthetic-audio.mp3',
    source: { provider: 'synthetic' }
  },
  { id: 'c', label: '我', image: '/symbols/person.svg' }
];
const cancelSpeech = jest.fn();
let setOutput;
function Harness({
  outputScope = 'synthetic:one',
  isLiveMode = false,
  seed = initial,
  increaseOutputButtons = false
}) {
  const [output, update] = useState(seed);
  setOutput = update;
  return (
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <Scanner active={false}>
        <OutputContainer
          intl={intl}
          output={output}
          changeOutput={update}
          outputScope={outputScope}
          isLiveMode={isLiveMode}
          cancelSpeech={cancelSpeech}
          clickOutput={jest.fn()}
          navigationSettings={{ removeOutputActive: false }}
          increaseOutputButtons={increaseOutputButtons}
        />
      </Scanner>
    </IntlProvider>
  );
}
const symbols = wrapper => wrapper.find(SymbolOutput).prop('symbols');
const control = (wrapper, name) => {
  wrapper.find(SymbolOutput).prop(name)();
  wrapper.update();
};
const undoButton = wrapper => wrapper.find('button[aria-label="撤销删除"]');
const undo = wrapper => {
  undoButton(wrapper).simulate('click');
  wrapper.update();
};
let wrapper;
afterEach(() => {
  if (wrapper) wrapper.unmount();
  wrapper = null;
  jest.clearAllMocks();
});

test('clear leaves a visible one-click undo even with an empty sequence', () => {
  wrapper = mount(<Harness />);
  control(wrapper, 'onClearClick');
  expect(symbols(wrapper)).toEqual([]);
  expect(undoButton(wrapper)).toHaveLength(1);
  undo(wrapper);
  expect(symbols(wrapper)).toEqual(initial);
  expect(undoButton(wrapper)).toHaveLength(0);
  expect(cancelSpeech).toHaveBeenCalledTimes(2);
});

test('undo follows the existing output button sizing and retains its accessible label', () => {
  wrapper = mount(<Harness />);
  control(wrapper, 'onClearClick');
  expect(undoButton(wrapper).hasClass('Output__button__sm')).toBe(true);
  expect(undoButton(wrapper).find('svg.Output__icon__sm')).toHaveLength(1);
  wrapper.setProps({ increaseOutputButtons: true });
  expect(undoButton(wrapper).hasClass('Output__button__lg')).toBe(true);
  expect(undoButton(wrapper).find('svg.Output__icon__lg')).toHaveLength(1);
  undo(wrapper);
  expect(symbols(wrapper)).toEqual(initial);
});

test('removing a middle card restores its position and all chosen media fields', () => {
  wrapper = mount(<Harness />);
  wrapper.find(SymbolOutput).prop('onRemoveClick')(1)({});
  wrapper.update();
  expect(symbols(wrapper).map(i => i.id)).toEqual(['a', 'c']);
  undo(wrapper);
  expect(symbols(wrapper)).toEqual(initial);
});

test('backspace and clear can be undone in reverse order without duplicate cards', () => {
  wrapper = mount(<Harness />);
  control(wrapper, 'onBackspaceClick');
  control(wrapper, 'onClearClick');
  undo(wrapper);
  expect(symbols(wrapper)).toEqual(initial.slice(0, 2));
  undo(wrapper);
  expect(symbols(wrapper)).toEqual(initial);
  expect(undoButton(wrapper)).toHaveLength(0);
});

test('no-op clear and backspace do not discard the last recoverable sequence', () => {
  wrapper = mount(<Harness />);
  control(wrapper, 'onClearClick');
  control(wrapper, 'onClearClick');
  control(wrapper, 'onBackspaceClick');
  undo(wrapper);
  expect(symbols(wrapper)).toEqual(initial);
});

test('a new sequence clears undo and refreshes equal-length translated output', () => {
  wrapper = mount(<Harness />);
  control(wrapper, 'onBackspaceClick');
  const replacement = [
    { id: 'new1', label: '不是旧句' },
    { id: 'new2', label: '新图片', image: '/new.svg' }
  ];
  setOutput(replacement);
  wrapper.update();
  expect(symbols(wrapper)).toEqual(replacement);
  expect(undoButton(wrapper)).toHaveLength(0);
  control(wrapper, 'onUndoDelete');
  expect(symbols(wrapper)).toEqual(replacement);
});

test('adding a card after deletion cannot be overwritten by old undo', () => {
  wrapper = mount(<Harness />);
  control(wrapper, 'onClearClick');
  setOutput([{ id: 'fresh', label: '重新开始' }]);
  wrapper.update();
  expect(undoButton(wrapper)).toHaveLength(0);
});

test('switching account or patient scope clears private recovery, including when empty', () => {
  wrapper = mount(<Harness />);
  control(wrapper, 'onClearClick');
  wrapper.setProps({ outputScope: 'synthetic:other-patient' });
  expect(undoButton(wrapper)).toHaveLength(0);
  control(wrapper, 'onUndoDelete');
  expect(symbols(wrapper)).toEqual([]);
});

test('live mode clear restores text and original live tile, not the generated placeholder', () => {
  const seed = [
    ...initial,
    { id: 'live-before', type: 'live', label: '已经写好的文字', image: '' }
  ];
  wrapper = mount(<Harness seed={seed} isLiveMode />);
  control(wrapper, 'onClearClick');
  expect(symbols(wrapper)).toHaveLength(1);
  const placeholderId = symbols(wrapper)[0].id;
  control(wrapper, 'onClearClick');
  control(wrapper, 'onBackspaceClick');
  undo(wrapper);
  expect(symbols(wrapper)).toEqual(seed);
  expect(symbols(wrapper).some(i => i.id === placeholderId)).toBe(false);
});

test('recovery does not survive unmount or get persisted to browser storage', () => {
  const write = jest.spyOn(Storage.prototype, 'setItem');
  wrapper = mount(<Harness />);
  control(wrapper, 'onClearClick');
  expect(write).not.toHaveBeenCalled();
  wrapper.unmount();
  wrapper = mount(<Harness seed={[]} />);
  expect(undoButton(wrapper)).toHaveLength(0);
  write.mockRestore();
});
