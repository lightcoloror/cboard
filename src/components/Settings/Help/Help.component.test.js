import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import { Help } from './Help.component';

jest.unmock('react-intl');
jest.mock('../../../cordova-util', () => ({ isCordova: () => false }));
jest.mock('../../UI/FullScreenDialog', () => function HelpDialog(props) {
  return <div><button onClick={props.onClose}>返回</button>{props.children}</div>;
});
jest.mock('../../../translations/help/zh-CN.md', () => '/help/zh-CN.md');
jest.mock('../../../translations/help/en-US.md', () => '/help/en-US.md');

const read = text => ({ ok: true, text: async () => text });
let fetchBefore;
let host;
beforeEach(() => {
  fetchBefore = global.fetch;
  global.fetch = jest.fn();
  window.location.hash = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  global.fetch = fetchBefore;
  host.remove();
  window.location.hash = '';
});

async function openHelp(props = {}) {
  let wrapper;
  await act(async () => {
    wrapper = mount(<Help history={{ goBack: jest.fn() }} language={{ lang: 'zh-CN' }} {...props} />, { attachTo: host });
    await Promise.resolve();
    await Promise.resolve();
  });
  wrapper.update();
  return wrapper;
}

test('reads the cached-asset fixture through the existing path and focuses text for a Cordova hash route', async () => {
  window.location.hash = '#/settings/help';
  global.fetch.mockResolvedValueOnce(read('# 图语家帮助\n\n已保存到本机不等于已同步。'));
  const wrapper = await openHelp();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(wrapper.text()).toContain('已保存到本机不等于已同步');
  expect(document.activeElement).toBe(wrapper.find('[aria-label="帮助正文"]').getDOMNode());
  wrapper.unmount();
});

test('reports an offline asset failure, retries explicitly, and preserves the return action', async () => {
  const goBack = jest.fn();
  global.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(read('# 使用帮助'));
  const wrapper = await openHelp({ history: { goBack } });
  expect(wrapper.find('[role="alert"]').text()).toContain('帮助暂时无法读取');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    wrapper.find('button').filterWhere(node => node.text() === '重新读取帮助').simulate('click');
    await Promise.resolve();
    await Promise.resolve();
  });
  wrapper.update();
  expect(wrapper.text()).toContain('使用帮助');
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  wrapper.find('button').filterWhere(node => node.text() === '返回').simulate('click');
  expect(goBack).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});

test('an HTTP failure or empty help is not reported as loaded', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, text: async () => '# not help' });
  const wrapper = await openHelp();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  await act(async () => {
    global.fetch.mockResolvedValueOnce(read(''));
    wrapper.instance().loadHelp();
    await Promise.resolve();
    await Promise.resolve();
  });
  wrapper.update();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  wrapper.unmount();
});

test('a late language response cannot overwrite the newer help and unmount aborts pending reads', async () => {
  let finishOld;
  global.fetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce(read('# English help'));
  const wrapper = await openHelp();
  await act(async () => {
    wrapper.setProps({ language: { lang: 'en-US' } });
    await Promise.resolve();
    await Promise.resolve();
  });
  wrapper.update();
  await act(async () => { finishOld(read('# 旧正文')); await Promise.resolve(); await Promise.resolve(); });
  wrapper.update();
  expect(wrapper.text()).toContain('English help');
  expect(wrapper.text()).not.toContain('旧正文');
  const signal = global.fetch.mock.calls[1][1].signal;
  wrapper.unmount();
  expect(signal.aborted).toBe(true);
});

test('a real Markdown anchor is scoped to the help content, not the hash route', async () => {
  window.location.hash = '#Settings';
  global.fetch.mockResolvedValueOnce(read("# 帮助\n\n<a name='Settings'></a>设置"));
  const wrapper = await openHelp();
  expect(wrapper.instance().getHelpAnchor()).toBe(host.querySelector('a[name="Settings"]'));
  expect(wrapper.instance().getHelpAnchor()).toBeTruthy();
  expect(document.activeElement).toBe(host.querySelector('a[name="Settings"]'));
  expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
  window.location.hash = '#WhatisCboard';
  const second = document.createElement('a');
  second.name = 'WhatisCboard';
  wrapper.find('[aria-label="帮助正文"]').getDOMNode().appendChild(second);
  window.dispatchEvent(new Event('hashchange'));
  expect(document.activeElement).toBe(second);
  wrapper.unmount();
});

test('clicking the local table of contents focuses its anchor without adding navigation before return', async () => {
  const goBack = jest.fn();
  global.fetch.mockResolvedValueOnce(read("# 帮助\n\n[设置](#Settings)\n\n<a name='Settings'></a>设置说明"));
  const wrapper = await openHelp({ history: { goBack } });
  const previousLength = window.history.length;
  const link = host.querySelector('a[href="#Settings"]');
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(window.history.length).toBe(previousLength);
  expect(window.location.hash).toBe('');
  expect(document.activeElement).toBe(host.querySelector('a[name="Settings"]'));
  wrapper.find('button').filterWhere(node => node.text() === '返回').simulate('click');
  expect(goBack).toHaveBeenCalledTimes(1);
  const preventDefault = jest.fn();
  wrapper.instance().handleContentClick({ target: link, button: 0, ctrlKey: true, preventDefault });
  link.setAttribute('href', '#/settings/navigation');
  wrapper.instance().handleContentClick({ target: link, button: 0, preventDefault });
  link.setAttribute('href', 'https://example.invalid/');
  wrapper.instance().handleContentClick({ target: link, button: 0, preventDefault });
  expect(preventDefault).not.toHaveBeenCalled();
  wrapper.unmount();
});
