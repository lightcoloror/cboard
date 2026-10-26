import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import SavedPhrasePreparation from './SavedPhrasePreparation.component';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';
import { SAVED_PHRASE_STARTERS } from '../../../common/communicationSupport/savedPhrasePreparation';

jest.mock('../Symbol', () => props => <span>{props.label}</span>);
const click = async (wrapper, text) => {
  await act(async () => {
    wrapper.find('ForwardRef(Button)').filterWhere(n => n.text() === text).first().simulate('click');
    jest.runOnlyPendingTimers();
  }); wrapper.update();
};
beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); });
afterEach(() => { jest.useRealTimers(); });

test('damaged preparation remains untouched and does not open an empty editor', () => {
  localStorage.setItem('cboard_communication_phrase_preparation', '{damaged');
  const wrapper = mount(<SavedPhrasePreparation boards={[]} onClose={jest.fn()} onSaved={jest.fn()} onInvalidate={jest.fn()} />);
  expect(wrapper.text()).toContain('读取失败');
  expect(wrapper.find('textarea#receiver-input')).toHaveLength(0);
  expect(wrapper.find('[aria-label="参考表达目录"]')).toHaveLength(0);
  expect(localStorage.getItem('cboard_communication_phrase_preparation')).toBe('{damaged');
  wrapper.unmount();
});

test.each(['edit', 'copy'])('web %s opens existing content without automatic requests and reviews changed words', async mode => {
  const repo = createCommunicationRepository({ storage: localStorage });
  repo.saveCommunicationPhrase({ id: 'original', sentence: '我想喝水', output: [{ id: 'water', label: '水', image: '/synthetic.png' }] });
  const before = repo.loadCommunicationSavedPhrases();
  const saved = jest.fn(), speak = jest.fn(), search = jest.fn();
  const wrapper = mount(<SavedPhrasePreparation boards={[]} initialRequest={{ id: 'original', mode }}
    onClose={jest.fn()} onSaved={saved} onInvalidate={jest.fn()} onSpeak={speak} onJumpBoard={jest.fn()}
    onSearchMissingTokensOnline={search} missingTokenRecords={[]} />);
  expect(wrapper.find('textarea#receiver-input').prop('value')).toBe('我想喝水');
  expect(search).not.toHaveBeenCalled();
  await act(async () => wrapper.find('textarea#receiver-input').simulate('change', { target: { value: '我不想喝水' } })); wrapper.update();
  expect(wrapper.find('.CommunicationSupportPanel__results').exists()).toBe(false);
  await click(wrapper, '匹配图片');
  while (wrapper.find('ForwardRef(Button)').someWhere(n => n.text() === '保留文字')) await click(wrapper, '保留文字');
  await click(wrapper, mode === 'edit' ? '确认更新这条常用语' : '确认另存为新常用语');
  const items = repo.loadCommunicationSavedPhrases();
  expect(items).toHaveLength(mode === 'edit' ? 1 : 2);
  expect(items.find(item => item.sentence === '我不想喝水')).toBeTruthy();
  if (mode === 'copy') expect(items.find(item => item.id === 'original')).toEqual(before[0]);
  expect(saved).toHaveBeenCalledTimes(1); expect(speak).not.toHaveBeenCalled();
  expect(repo.loadCommunicationHistory()).toEqual([]); wrapper.unmount();
});

test.each(SAVED_PHRASE_STARTERS)('web $id starts unselected, confirms without speech, history or output changes', async template => {
  const apply = jest.fn(), speak = jest.fn(), search = jest.fn(), saved = jest.fn();
  const wrapper = mount(<SavedPhrasePreparation boards={[]} onClose={jest.fn()} onSaved={saved}
    onInvalidate={jest.fn()} onApplyOutput={apply} onSpeak={speak} onSearchMissingTokensOnline={search}
    missingTokenRecords={[]} onJumpBoard={jest.fn()} />);
  await click(wrapper, template.text);
  expect(wrapper.find('textarea#receiver-input').prop('value')).toBe(template.text);
  expect(wrapper.find('.CommunicationSupportPanel__results').exists()).toBe(false);
  expect(search).not.toHaveBeenCalled();
  await click(wrapper, '匹配图片');
  let missing = wrapper.find('ForwardRef(Button)').filterWhere(n => n.text() === '保留文字');
  while (missing.length) { await click(wrapper, '保留文字'); missing = wrapper.find('ForwardRef(Button)').filterWhere(n => n.text() === '保留文字'); }
  await click(wrapper, '确认存为常用语');
  const repo = createCommunicationRepository({ storage: localStorage });
  expect(repo.loadCommunicationSavedPhrases()).toHaveLength(1);
  expect(repo.loadCommunicationSavedPhrases()[0].sentence).toBe(template.text);
  expect(saved).toHaveBeenCalledTimes(1); expect(speak).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  expect(repo.loadCommunicationHistory()).toEqual([]); expect(repo.loadReceiverRecords()).toEqual([]);
  wrapper.unmount();
});

test('web edits invalidate pictures and offline draft can resume or cancel without changing ordinary draft', async () => {
  const repo = createCommunicationRepository({ storage: localStorage });
  const ordinary = repo.createReceiverDraft({ direction: 'receive', inputText: '原沟通', output: [], pictogramSequence: [] });
  const props = { boards: [], onClose: jest.fn(), onSaved: jest.fn(), onInvalidate: jest.fn(), onJumpBoard: jest.fn(), missingTokenRecords: [] };
  let wrapper = mount(<SavedPhrasePreparation {...props} />);
  await click(wrapper, '我不想吃饭'); await click(wrapper, '匹配图片');
  await act(async () => { wrapper.find('textarea#receiver-input').simulate('change', { target: { value: '欧阳明澈不回家' } }); }); wrapper.update();
  expect(wrapper.find('.CommunicationSupportPanel__results').exists()).toBe(false);
  await click(wrapper, '稍后继续'); wrapper.unmount();
  wrapper = mount(<SavedPhrasePreparation {...props} />);
  await click(wrapper, '继续准备');
  expect(wrapper.find('textarea#receiver-input').prop('value')).toBe('欧阳明澈不回家');
  expect(wrapper.find('.CommunicationSupportPanel__results').exists()).toBe(false);
  await click(wrapper, '取消准备');
  expect(repo.loadSavedPhrasePreparation()).toBeNull();
  expect(repo.loadResumableReceiverRecord()).toEqual(ordinary); wrapper.unmount();
});
