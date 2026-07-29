import React from 'react';
import { mount } from 'enzyme';
import CommunicationNetworkStatusNotice from './CommunicationNetworkStatusNotice.component';

function createPort(availability) {
  return {
    getCurrent: jest.fn(() => ({
      availability,
      networkType: availability === 'offline' ? 'none' : 'browser'
    })),
    subscribe: jest.fn(() => jest.fn())
  };
}

describe('CommunicationNetworkStatusNotice', () => {
  test('shows the local capability boundary while offline', () => {
    const wrapper = mount(
      <CommunicationNetworkStatusNotice port={createPort('offline')} />
    );

    expect(wrapper.text()).toContain('当前为离线模式');
    expect(wrapper.text()).toContain(
      '本地图板、分词、图片、朗读和本机历史仍可使用'
    );
    expect(wrapper.text()).toContain('AI、在线补图和账号同步暂时不可用');
  });

  test.each(['online', 'unknown'])(
    'does not show a technical banner while %s',
    availability => {
      const wrapper = mount(
        <CommunicationNetworkStatusNotice port={createPort(availability)} />
      );

      expect(wrapper.isEmptyRender()).toBe(true);
    }
  );
});
