import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import Button from '@material-ui/core/Button';
import ImageRepairControls from './ImageRepairControls.component';
import API from '../../../api';
import { readPersonalImageBlob } from './PersonalImageManager.component';
import { invalidateImageOperations } from '../../../common/communicationSupport/imageOperationEpoch';

jest.mock('../../../common/communicationSupport/browserImageVerification', () => ({
  verifyBrowserLocalImage: async () => ({ status: 'missing' })
}));
jest.mock('./PersonalImageManager.component', () => ({ readPersonalImageBlob: jest.fn() }));
jest.mock('../../../api', () => ({ downloadCommunicationPictogram: jest.fn() }));
const tile = { id: 'one', label: '回家', image: '/assets/missing.png',
  pictogramAttribution: { provider: 'arasaac', originalId: '29714' } };
const button = (wrapper, label) => wrapper.find(Button).filterWhere(node => node.text() === label);
async function click(wrapper, label) {
  await act(async () => { await button(wrapper, label).prop('onClick')(); }); wrapper.update();
}
async function make(onAdopt = jest.fn()) {
  let wrapper;
  await act(async () => { wrapper = mount(<ImageRepairControls tile={tile} operationKey="draft" onAdopt={onAdopt} />); });
  wrapper.update(); return wrapper;
}
beforeEach(() => { API.downloadCommunicationPictogram.mockResolvedValue(new Blob(['synthetic']));
  readPersonalImageBlob.mockResolvedValue('data:image/png;base64,c3ludGhldGlj'); });
it('checks locally, downloads only the original identity and requires confirmation', async () => {
  const adopt = jest.fn(); const w = await make(adopt);
  await click(w, '重新检查'); expect(API.downloadCommunicationPictogram).not.toHaveBeenCalled();
  await click(w, '重新下载原图'); expect(adopt).not.toHaveBeenCalled();
  expect(API.downloadCommunicationPictogram).toHaveBeenCalledWith({ image: '/pictograms/arasaac/29714/image' });
  await click(w, '确认采用修复图片'); expect(adopt.mock.calls[0][0]).toMatchObject({ id: 'one', label: '回家' }); w.unmount();
});
it('keeps prepared bytes on record failure and does not download again', async () => {
  const adopt = jest.fn().mockReturnValueOnce(false).mockReturnValue(true); const w = await make(adopt);
  await click(w, '重新下载原图'); await click(w, '确认采用修复图片');
  expect(w.text()).toContain('记录保存失败'); await click(w, '确认采用修复图片');
  expect(API.downloadCommunicationPictogram).toHaveBeenCalledTimes(1); expect(adopt).toHaveBeenCalledTimes(2); w.unmount();
});
it('cancel and privacy invalidation never adopt the candidate', async () => {
  const adopt=jest.fn();const w=await make(adopt);
  await click(w, '重新下载原图'); await click(w, '取消修复'); expect(adopt).not.toHaveBeenCalled();
  await click(w, '重新下载原图'); invalidateImageOperations(); await click(w, '确认采用修复图片');
  expect(adopt).not.toHaveBeenCalled(); w.unmount();
});
it('invalidates a late download when the edited snapshot changes', async () => {
  let finish; API.downloadCommunicationPictogram.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  const w=await make(); let pending;
  await act(async () => { pending=button(w,'重新下载原图').prop('onClick')(); await Promise.resolve(); });
  await act(async () => { w.setProps({operationKey:'other-draft'}); });
  await act(async () => { finish(new Blob(['synthetic'])); await pending; }); w.update();
  expect(button(w,'确认采用修复图片')).toHaveLength(0);w.unmount();
});
