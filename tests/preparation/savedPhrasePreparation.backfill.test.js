import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import SavedPhrasePreparation from '../../src/components/Board/CommunicationSupport/SavedPhrasePreparation.component';
import { createCommunicationRepository } from '../../src/common/communicationSupport/repository';

jest.mock('../../src/components/Board/Symbol', () => props => <img src={props.image} alt={props.label} />);
const click = async (wrapper, label) => {
  await act(async () => {
    wrapper.find('ForwardRef(Button)').filterWhere(n => n.text() === label).first().simulate('click');
    jest.runOnlyPendingTimers();
  }); wrapper.update();
};

test('confirmed backfill is saved in the independent preparation draft and survives remount without another search', async () => {
  jest.useFakeTimers(); localStorage.clear();
  const repo = createCommunicationRepository({storage: localStorage});
  const search = jest.fn(), saved = jest.fn();
  const props = {boards:[], onClose:jest.fn(), onSaved:saved, onInvalidate:jest.fn(), onJumpBoard:jest.fn(),
    missingTokenRecords:[], onRecordMissingTokens:entry=>repo.recordMissingTokens(entry), onSearchMissingTokensOnline:search};
  let wrapper=mount(<SavedPhrasePreparation {...props} />);
  try {
    await click(wrapper,'我想喝水');
    await act(async()=>wrapper.find('textarea#receiver-input').simulate('change',{target:{value:'葡萄柚'}})); wrapper.update();
    await click(wrapper,'匹配图片');
    const gap=repo.loadMissingTokens()[0];
    const image={id:'synthetic-grapefruit',label:'葡萄柚',image:'data:image/png;base64,aGVsbG8=',
      source:{provider:'opensymbols',originalId:'synthetic-grapefruit',name:'Synthetic fixture',license:'CC BY-SA',sourceUrl:'https://example.test/synthetic'}};
    repo.reviewMissingToken(gap.id,{status:'suggested',suggestedPictogram:image,source:'online'});
    await act(async()=>wrapper.setProps({missingTokenRecords:repo.loadMissingTokens()})); wrapper.update();
    expect(repo.loadSavedPhrasePreparation().output).toHaveLength(0);
    repo.reviewMissingToken(gap.id,{status:'resolved',resolvedPictogram:image,resolvedPictogramId:image.id,source:'online',reviewedByCaregiver:true});
    await act(async()=>wrapper.setProps({missingTokenRecords:repo.loadMissingTokens()})); wrapper.update();
    expect(repo.loadSavedPhrasePreparation().output[0].image).toBe(image.image);
    await click(wrapper,'稍后继续'); wrapper.unmount();
    wrapper=mount(<SavedPhrasePreparation {...props} missingTokenRecords={repo.loadMissingTokens()} />);
    await click(wrapper,'继续准备');
    expect(wrapper.find('.CommunicationSupportPanel__results img').someWhere(n=>n.prop('src')===image.image)).toBe(true);
    expect(search).not.toHaveBeenCalled();
    await click(wrapper,'确认存为常用语');
    expect(repo.loadCommunicationSavedPhrases()[0].output[0].image).toBe(image.image);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(repo.loadReceiverRecords()).toEqual([]); expect(repo.loadCommunicationHistory()).toEqual([]);
  } finally {wrapper.unmount(); jest.useRealTimers(); localStorage.clear();}
});
