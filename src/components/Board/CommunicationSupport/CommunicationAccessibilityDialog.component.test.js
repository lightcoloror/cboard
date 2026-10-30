import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import { DEFAULT_COMMUNICATION_PREFERENCES } from '../../../common/communicationSupport/communicationPreferences';
import CommunicationAccessibilityDialog from './CommunicationAccessibilityDialog.component';

const boards = [{ id: 'home', name: '首页' }, { id: 'food', name: '食物' }];

describe('CommunicationAccessibilityDialog', () => {
  test('local success with cloud failure keeps a separate explicit sync retry', async () => {
    const change=jest.fn().mockResolvedValueOnce({syncFailed:true}).mockResolvedValueOnce({syncFailed:false});
    const wrapper=mount(<CommunicationAccessibilityDialog open onClose={jest.fn()} boards={boards}
      value={DEFAULT_COMMUNICATION_PREFERENCES} onChange={change} />);
    await act(async()=>{ wrapper.find('ForwardRef(Button)').filterWhere(node=>node.text()==='大').first().simulate('click'); });
    wrapper.update(); expect(wrapper.text()).toContain('已保存到本机');
    await act(async()=>{ wrapper.find('ForwardRef(Button)').filterWhere(node=>node.text()==='重试同步设置').simulate('click'); });
    wrapper.update(); expect(change).toHaveBeenCalledTimes(2);
    expect(change.mock.calls[0]).toEqual(change.mock.calls[1]);
    expect(wrapper.text()).not.toContain('账号同步失败');
    wrapper.unmount();
  });
  test('names each choice group and exposes exactly one pressed option without changing button or scan semantics', () => {
    const wrapper = mount(<CommunicationAccessibilityDialog open onClose={jest.fn()}
      boards={boards} value={DEFAULT_COMMUNICATION_PREFERENCES} onChange={jest.fn()} />);
    const names = ['字体大小', '图卡大小', '图卡顺序', '语速', '候选句自动播报'];
    names.forEach(name => {
      const label = wrapper.find('strong').filterWhere(node => node.text() === name);
      const group = wrapper.find(`div[role="group"][aria-labelledby="${label.prop('id')}"]`);
      expect(group.exists()).toBe(true);
      const buttons = group.find('button');
      expect(buttons.length).toBeGreaterThan(1);
      expect(buttons.filterWhere(button => button.prop('aria-pressed') === true)).toHaveLength(1);
      expect(buttons.everyWhere(button => typeof button.prop('aria-pressed') === 'boolean')).toBe(true);
      expect(buttons.everyWhere(button => button.prop('role') === undefined)).toBe(true);
    });
    expect(wrapper.find('button[aria-label="高对比度"]').prop('aria-pressed')).toBe(false);
    expect(wrapper.find('button[aria-label="首页：隐藏接收匹配"]').exists()).toBe(true);
    expect(wrapper.find('div[role="status"]').prop('aria-atomic')).toBe('true');
    wrapper.unmount();
  });

  test('updates pressed selection during failed saving and announces explicit retry with stable group names', async () => {
    const onChange = jest.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(false);
    const wrapper = mount(<CommunicationAccessibilityDialog open onClose={jest.fn()}
      value={DEFAULT_COMMUNICATION_PREFERENCES} onChange={onChange} />);
    await act(async () => {
      wrapper.find('button').filterWhere(node => node.text() === '超大').simulate('click');
      await Promise.resolve();
    });
    wrapper.update();
    expect(wrapper.find('button').filterWhere(node => node.text() === '超大').prop('aria-pressed')).toBe(true);
    expect(wrapper.find('div[role="alert"]').prop('aria-live')).toBe('assertive');
    expect(wrapper.find('button[aria-label="高对比度"]').prop('aria-label')).toBe('高对比度');
    wrapper.unmount();
  });

  test('keeps failed changes for explicit retry and ignores a completion after close', async () => {
    const onChange = jest.fn().mockRejectedValueOnce(new Error('disk'))
      .mockResolvedValueOnce({ syncFailed: false });
    const wrapper = mount(<CommunicationAccessibilityDialog open onClose={jest.fn()}
      value={DEFAULT_COMMUNICATION_PREFERENCES} onChange={onChange} />);
    await act(async () => {
      wrapper.find('button').filterWhere(n => n.text() === '超大').simulate('click');
      await Promise.resolve();
    });
    wrapper.update();
    expect(wrapper.find('[role="alert"]').text()).toContain('尚未核对保存');
    await act(async () => {
      wrapper.find('button').filterWhere(n => n.text() === '重试保存设置').simulate('click');
      await Promise.resolve();
    });
    wrapper.update();
    expect(onChange.mock.calls[1][0].fontSize).toBe('extra-large');
    expect(wrapper.find('[role="status"]').text()).toContain('已保存到本机');
    let finish;
    onChange.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { wrapper.find('button').filterWhere(n => n.text() === '大').simulate('click'); });
    act(() => { wrapper.setProps({ open: false }); });
    await act(async () => { finish({ syncFailed: true }); await Promise.resolve(); });
    act(() => { wrapper.setProps({ open: true }); });
    expect(wrapper.find('[role="status"]').text()).toBe('');
    wrapper.unmount();
  });
  test('updates high contrast through the shared preferences contract', () => {
    const onChange = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={onChange}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '未开启')
      .first()
      .simulate('click');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ highContrast: true })
    );
  });

  test('lets the caregiver disable candidate autoplay', () => {
    const onChange = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={onChange}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '关闭')
      .first()
      .simulate('click');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateAutoplayDelaySeconds: 0
      })
    );
  });

  test('lets the caregiver switch to actual-use popularity ordering', () => {
    const onChange = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={onChange}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '常用优先')
      .first()
      .simulate('click');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pictogramSortMode: 'popularity' })
    );
  });

  test('never lets the caregiver hide the last visible matching board', () => {
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        boards={boards}
        value={{
          ...DEFAULT_COMMUNICATION_PREFERENCES,
          hiddenBoardIds: ['food']
        }}
        onChange={jest.fn()}
      />
    );
    const rows = wrapper.find(
      'div.CommunicationSupportPanel__boardVisibilityRow'
    );

    expect(
      rows
        .filterWhere(node => node.text().includes('首页'))
        .first()
        .find('ForwardRef(Button)')
        .prop('disabled')
    ).toBe(true);
    expect(
      rows
        .filterWhere(node => node.text().includes('食物'))
        .first()
        .find('ForwardRef(Button)')
        .prop('disabled')
    ).toBe(false);
  });

  test('offers a stable entry to replay the first-use guide', () => {
    const onReplayOnboarding = jest.fn();
    const wrapper = mount(
      <CommunicationAccessibilityDialog
        open
        onClose={jest.fn()}
        onReplayOnboarding={onReplayOnboarding}
        boards={boards}
        value={DEFAULT_COMMUNICATION_PREFERENCES}
        onChange={jest.fn()}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '重新查看使用引导')
      .first()
      .simulate('click');

    expect(onReplayOnboarding).toHaveBeenCalledTimes(1);
  });
});
