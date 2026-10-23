import React from 'react';
import { act } from 'react-dom/test-utils';
import { mount } from 'enzyme';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import PersonalImageManager from './PersonalImageManager.component';
import InputImage from '../../UI/InputImage';
import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from '../../../common/communicationSupport/repository';
import { invalidateImageOperations } from '../../../common/communicationSupport/imageOperationEpoch';

jest.mock('../../UI/InputImage', () => () => null);
jest.mock('../../../common/communicationSupport/browserImageVerification', () => ({
  verifyBrowserLocalImage: async () => ({ status: 'available', width: 1, height: 1 })
}));
const image = 'data:image/png;base64,c3ludGhldGlj';
const board = { id: 'home', name: '合成板', tiles: [
  { id: 'water', label: '水', image: 'default://water' },
  { id: 'food', label: '食物', image: 'default://food' }
] };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const button = (wrapper, text) => wrapper.find(Button).filterWhere(node => node.text() === text).first();
let wrapper, originalReader;
beforeEach(() => {
  originalReader = global.FileReader;
  global.FileReader = class {
    readAsDataURL() { this.result = image; this.onload(); }
  };
});
afterEach(() => { if (wrapper && wrapper.exists()) wrapper.unmount(); global.FileReader = originalReader; });
function setup(onSave, props = {}) {
  wrapper = mount(<PersonalImageManager boards={[board]} preferences={[]} onSave={onSave} onRemove={() => true} {...props} />);
  act(() => wrapper.find(Button).filterWhere(node => node.hasClass('PersonalImageManager__candidate')).first().prop('onClick')());
  wrapper.update();
  return wrapper;
}
function upload() { return wrapper.find(InputImage).last().prop('onChange')(new Blob(['synthetic'])); }
const preview = () => wrapper.find('.PersonalImageManager__upload img').prop('src');

test.each(['false', 'reject'])('familiar photo %s retains the candidate and retries without selecting another file', async failure => {
  const pending = deferred(), started = deferred();
  const save = jest.fn().mockImplementationOnce(() => { started.resolve(); return pending.promise; }).mockResolvedValue(true);
  setup(save);
  let task;
  act(() => { task = upload(); });
  await act(async () => started.promise); wrapper.update();
  expect(preview()).toBe(image);
  expect(wrapper.text()).not.toContain('启用当前设备');
  await act(async () => { failure === 'false' ? pending.resolve(false) : pending.reject(new Error('receipt')); await task; }); wrapper.update();
  expect(preview()).toBe(image);
  expect(wrapper.text()).toContain('新照片仍保留');
  await act(async () => button(wrapper, '重试保存').prop('onClick')()); wrapper.update();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toBe(save.mock.calls[0][0]);
  expect(wrapper.text()).toContain('启用当前设备');
  expect(wrapper.text()).not.toContain('新照片尚未确认保存');
});

test('unreadable existing preferences remain intact until a real successful retry', async () => {
  const key = COMMUNICATION_STORAGE_KEYS.personalImagePreferences;
  const values = new Map([[key, '{broken']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => values.delete(key) };
  const save = jest.fn(entry => { try { return createCommunicationRepository({ storage }).savePersonalImagePreference(entry); } catch (_) { return false; } });
  setup(save, { preferencesError: '熟悉图片暂时无法读取，原数据已保留。' });
  await act(async () => upload()); wrapper.update();
  expect(wrapper.find('[role="alert"]').text()).toContain('原数据已保留');
  expect(values.get(key)).toBe('{broken');
  expect(preview()).toBe(image);
  values.set(key, '[]');
  await act(async () => button(wrapper, '重试保存').prop('onClick')()); wrapper.update();
  expect(JSON.parse(values.get(key))).toEqual([expect.objectContaining({ image, tileId: 'water' })]);
  expect(wrapper.text()).toContain('启用当前设备');
});

test.each(['success', 'failure'])('late familiar-photo %s does not replace a newer selection or metadata', async outcome => {
  const pending = deferred(), started = deferred();
  const save = jest.fn(() => { started.resolve(); return pending.promise; });
  setup(save);
  let task;
  act(() => { task = upload(); });
  await act(async () => started.promise);
  act(() => wrapper.find(Button).filterWhere(node => node.hasClass('PersonalImageManager__candidate')).at(1).prop('onClick')()); wrapper.update();
  expect(save.mock.calls[0][1].guard()).toBe(false);
  await act(async () => { outcome === 'success' ? pending.resolve(true) : pending.reject(new Error('late')); await task; }); wrapper.update();
  expect(preview()).toBe('default://food');
  expect(wrapper.text()).not.toContain('启用当前设备');
  expect(wrapper.text()).not.toContain('新照片仍保留');
});

test('editing attribution after a failed upload retains the image and saves the new metadata', async () => {
  const save = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
  setup(save);
  await act(async () => upload()); wrapper.update();
  act(() => wrapper.find(TextField).filterWhere(node => node.prop('label') === '拍摄者或图片提供者（可选）').prop('onChange')({ target: { value: '家属乙' } })); wrapper.update();
  await act(async () => button(wrapper, '保存新照片').prop('onClick')()); wrapper.update();
  expect(save.mock.calls[1][0]).toEqual(expect.objectContaining({ image, pictogramAttribution: expect.objectContaining({ author: '家属乙' }) }));
  expect(wrapper.text()).toContain('启用当前设备');
});

test('privacy epoch invalidates an unconfirmed photo and prevents its retry', async () => {
  const save = jest.fn(() => false);
  setup(save);
  await act(async () => upload()); wrapper.update();
  invalidateImageOperations();
  await act(async () => button(wrapper, '重试保存').prop('onClick')());
  await act(async () => button(wrapper, '保存新照片').prop('onClick')());
  expect(save).toHaveBeenCalledTimes(1);
});

test('an unmounted upload ignores a late rejection', async () => {
  const pending = deferred(), started = deferred();
  const save = jest.fn(() => { started.resolve(); return pending.promise; });
  setup(save);
  let task;
  act(() => { task = upload(); });
  await act(async () => started.promise);
  wrapper.unmount();
  expect(save.mock.calls[0][1].guard()).toBe(false);
  await act(async () => { pending.reject(new Error('late')); await task; });
});
