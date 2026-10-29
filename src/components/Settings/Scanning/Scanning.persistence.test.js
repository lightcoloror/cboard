import React from 'react';
import { shallow } from 'enzyme';
import Scanning from './Scanning.component';
import { ScanningContainer } from './Scanning.container';
import FullScreenDialog from '../../UI/FullScreenDialog';
import API from '../../../api';
import { getCommunicationStorageScopeKey } from '../../../common/communicationSupport/localData';
import { getStore } from '../../../store';

jest.mock('../../../api', () => ({ updateSettings: jest.fn() }));
jest.mock('../../../common/communicationSupport/localData', () => ({
  getCommunicationStorageScopeKey: jest.fn(() => 'synthetic-scope-a')
}));
jest.mock('../../../store', () => ({ getStore: jest.fn(() => ({
  getState: () => ({ app: { userData: { id: 'synthetic-account-a', authToken: 'synthetic-token-a' } } })
})) }));
jest.mock('./Scanning.messages', () => Object.fromEntries([
  'scanning', 'enable', 'enableSecondary', 'delay', 'delaySecondary', 'method',
  'methodSecondary', 'seconds', 'automatic', 'manual', 'scannerManualStrategy',
  'scannerAutomaticStrategy', 'scannerHowToDeactivate'
].map(name => [name, { id: 'synthetic.scanning.' + name, defaultMessage: name }])));

const initial = { active: false, delay: 2000, strategy: 'automatic' };
const desired = { active: true, delay: 1000, strategy: 'manual' };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

afterEach(() => {
  jest.clearAllMocks();
  getCommunicationStorageScopeKey.mockReturnValue('synthetic-scope-a');
  getStore.mockReturnValue({ getState: () => ({ app: { userData: {
    id: 'synthetic-account-a', authToken: 'synthetic-token-a'
  } } }) });
});

test('scanner identity reads the existing real store export rather than invented helper exports', () => {
  const actualStore = jest.requireActual('../../../store');
  expect(typeof actualStore.getStore).toBe('function');
});

test('pending remote settings cannot delay the locally verified scanner save', async () => {
  const remote = deferred();
  API.updateSettings.mockReturnValue(remote.promise);
  const localSave = jest.fn().mockResolvedValue(true);
  const wrapper = shallow(<ScanningContainer intl={{}} history={{ goBack: jest.fn() }}
    scanningSettings={initial} updateScannerSettings={localSave} />);
  const save = wrapper.instance().updateScannerSettings(desired);
  await Promise.resolve();
  expect(localSave).toHaveBeenCalled();
  await expect(save).resolves.toBe(true);
  remote.resolve({});
  wrapper.unmount();
});

test('remote failure cannot invalidate a local save, and remote begins only after verification', async () => {
  const local = deferred();
  API.updateSettings.mockRejectedValue(new Error('synthetic remote failure'));
  const localSave = jest.fn().mockReturnValue(local.promise);
  const wrapper = shallow(<ScanningContainer intl={{}} history={{ goBack: jest.fn() }}
    scanningSettings={initial} updateScannerSettings={localSave} />);
  const save = wrapper.instance().updateScannerSettings(desired);
  expect(API.updateSettings).not.toHaveBeenCalled();
  local.resolve(true);
  await expect(save).resolves.toBe(true);
  expect(API.updateSettings).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});

test('failed verification retains the edited controls and permits one explicit retry', async () => {
  const onClose = jest.fn();
  const save = jest.fn().mockRejectedValueOnce(new Error('synthetic readback failure')).mockResolvedValueOnce(true);
  const wrapper = shallow(<Scanning scanningSettings={initial} updateScannerSettings={save} onClose={onClose} />);
  wrapper.setState(desired);
  await wrapper.instance().onSubmit();
  expect(onClose).not.toHaveBeenCalled();
  expect(wrapper.state()).toMatchObject(desired);
  expect(wrapper.find('[role="alert"]').text()).toContain('当前编辑仍保留');
  await wrapper.instance().onSubmit();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toEqual(desired);
  wrapper.unmount();
});

test('duplicate save clicks share a single pending local verification', async () => {
  const pending = deferred();
  const onClose = jest.fn();
  const save = jest.fn().mockReturnValue(pending.promise);
  const wrapper = shallow(<Scanning scanningSettings={initial} updateScannerSettings={save} onClose={onClose} />);
  const first = wrapper.instance().onSubmit();
  const second = wrapper.instance().onSubmit();
  expect(first).toBe(second);
  await Promise.resolve();
  expect(save).toHaveBeenCalledTimes(1);
  expect(wrapper.find(FullScreenDialog).prop('disableSubmit')).toBe(true);
  pending.resolve(true);
  await first;
  expect(onClose).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});

test('unverified return values cannot close the scanning page', async () => {
  const onClose = jest.fn();
  const wrapper = shallow(<Scanning scanningSettings={initial}
    updateScannerSettings={() => undefined} onClose={onClose} />);
  await wrapper.instance().onSubmit();
  expect(onClose).not.toHaveBeenCalled();
  expect(wrapper.find('[role="alert"]').text()).toContain('未核验');
  wrapper.unmount();
});

test('return is blocked while an already-started local save is being verified', async () => {
  const pending = deferred();
  const onClose = jest.fn();
  let guard;
  const wrapper = shallow(<Scanning scanningSettings={initial}
    updateScannerSettings={(settings, options) => { guard = options.guard; return pending.promise; }} onClose={onClose} />);
  const saving = wrapper.instance().onSubmit();
  await Promise.resolve();
  wrapper.instance().onClose();
  expect(guard()).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(wrapper.find('[role="status"]').text()).toContain('完成前暂不能返回');
  pending.resolve(true);
  await saving;
  expect(onClose).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});

test('hard navigation warns only during an unfinished save and the unload guard is removed after failure', async () => {
  const pending = deferred();
  const added = jest.spyOn(window, 'addEventListener');
  const removed = jest.spyOn(window, 'removeEventListener');
  const wrapper = shallow(<Scanning scanningSettings={initial}
    updateScannerSettings={() => pending.promise} onClose={jest.fn()} />);
  const component = wrapper.instance();
  const saving = component.onSubmit();
  expect(added).toHaveBeenCalledWith('beforeunload', component.onBeforeUnload);
  const event = { preventDefault: jest.fn(), returnValue: '' };
  expect(component.onBeforeUnload(event)).toContain('本机保存尚未完成');
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(event.returnValue).toContain('离开可能无法保留');
  pending.reject(new Error('synthetic save failed'));
  await saving;
  expect(removed).toHaveBeenCalledWith('beforeunload', component.onBeforeUnload);
  const idleEvent = { preventDefault: jest.fn() };
  expect(component.onBeforeUnload(idleEvent)).toBeUndefined();
  expect(idleEvent.preventDefault).not.toHaveBeenCalled();
  wrapper.unmount();
  added.mockRestore();
  removed.mockRestore();
});

test('unmount removes the hard-navigation guard without claiming an in-flight write was cancelled', async () => {
  const pending = deferred();
  const onClose = jest.fn();
  const removed = jest.spyOn(window, 'removeEventListener');
  const wrapper = shallow(<Scanning scanningSettings={initial}
    updateScannerSettings={() => pending.promise} onClose={onClose} />);
  const component = wrapper.instance();
  const saving = component.onSubmit();
  wrapper.unmount();
  expect(removed).toHaveBeenCalledWith('beforeunload', component.onBeforeUnload);
  pending.resolve(true);
  await saving;
  expect(onClose).not.toHaveBeenCalled();
  removed.mockRestore();
});

test('profile switch after local write cannot send remote settings or accept a stale receipt', async () => {
  const pending = deferred();
  const wrapper = shallow(<ScanningContainer intl={{}} history={{ goBack: jest.fn() }}
    scanningSettings={initial} updateScannerSettings={() => pending.promise} />);
  const saving = wrapper.instance().updateScannerSettings(desired);
  getCommunicationStorageScopeKey.mockReturnValue('synthetic-scope-b');
  pending.resolve(true);
  await expect(saving).rejects.toThrow('档案已切换');
  expect(API.updateSettings).not.toHaveBeenCalled();
  wrapper.unmount();
});

test('a stale page refuses a new save before changing the local store', async () => {
  const save = jest.fn().mockResolvedValue(true);
  const wrapper = shallow(<ScanningContainer intl={{}} history={{ goBack: jest.fn() }}
    scanningSettings={initial} updateScannerSettings={save} />);
  getCommunicationStorageScopeKey.mockReturnValue('synthetic-scope-b');
  await expect(wrapper.instance().updateScannerSettings(desired)).rejects.toThrow('档案已切换');
  expect(save).not.toHaveBeenCalled();
  wrapper.unmount();
});

test('same-profile login/token change between local receipt and continuation cannot submit old settings', async () => {
  const pending = deferred();
  const wrapper = shallow(<ScanningContainer intl={{}} history={{ goBack: jest.fn() }}
    scanningSettings={initial} updateScannerSettings={() => pending.promise} />);
  const saving = wrapper.instance().updateScannerSettings(desired);
  getStore.mockReturnValue({ getState: () => ({ app: { userData: {
    id: 'synthetic-account-b', authToken: 'synthetic-token-b'
  } } }) });
  pending.resolve(true);
  await expect(saving).rejects.toThrow('档案已切换');
  expect(API.updateSettings).not.toHaveBeenCalled();
  wrapper.unmount();
});

test('unmount while local verification is pending prevents old remote submission', async () => {
  const pending = deferred();
  const wrapper = shallow(<ScanningContainer intl={{}} history={{ goBack: jest.fn() }}
    scanningSettings={initial} updateScannerSettings={() => pending.promise} />);
  const saving = wrapper.instance().updateScannerSettings(desired);
  wrapper.unmount();
  pending.resolve(true);
  await expect(saving).rejects.toThrow('档案已切换');
  expect(API.updateSettings).not.toHaveBeenCalled();
});

test('scanner dialog stays open until its verified local save resolves', async () => {
  const saving = deferred();
  const onClose = jest.fn();
  const wrapper = shallow(<Scanning scanningSettings={initial}
    updateScannerSettings={() => saving.promise} onClose={onClose} />);
  const dialog = wrapper.find(FullScreenDialog);
  expect(dialog.prop('closeOnSubmit')).toBe(false);
  const save = wrapper.instance().onSubmit();
  expect(onClose).not.toHaveBeenCalled();
  saving.resolve(true);
  await save;
  expect(onClose).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});
