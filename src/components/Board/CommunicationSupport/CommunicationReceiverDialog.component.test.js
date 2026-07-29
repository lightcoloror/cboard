import React from 'react';
import { shallow } from 'enzyme';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import CommunicationReceiverDialog from './CommunicationReceiverDialog.component';

describe('CommunicationReceiverDialog', () => {
  test('provides a focused full-screen receiver boundary and return action', () => {
    const onClose = jest.fn();
    const wrapper = shallow(
      <CommunicationReceiverDialog
        open
        onClose={onClose}
        title="接收理解"
        subtitle="照护者输入文字后转换为图片序列。"
        closeLabel="返回图板"
      >
        <div className="receiver-fixture">接收端内容</div>
      </CommunicationReceiverDialog>
    );

    expect(wrapper.find(Dialog).prop('fullScreen')).toBe(true);
    expect(wrapper.find(Dialog).prop('open')).toBe(true);
    expect(wrapper.find('.receiver-fixture').text()).toBe('接收端内容');

    wrapper.find(Button).simulate('click');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
