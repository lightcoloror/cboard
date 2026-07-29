import React from 'react';
import { shallow } from 'enzyme';
import { Route } from 'react-router-dom';
import { App } from '../App.component';

jest.mock('../../Board', () => 'BoardContainer');
jest.mock('../../Settings', () => 'Settings');
jest.mock('../../Analytics', () => 'Analytics');
jest.mock('../../WelcomeScreen', () => 'WelcomeScreen');

const props = {
  dir: 'ltr',
  isFirstVisit: false,
  isLogged: false,
  isDownloadingLang: false,
  lang: 'zh-CN',
  dark: false
};

describe('App demo route', () => {
  test('shows a permanent banner and renders an isolated board route', () => {
    const wrapper = shallow(<App {...props} demoMode />);
    const demoRoute = wrapper
      .find(Route)
      .filterWhere(route => route.prop('path') === '/demo');
    const demoBoard = demoRoute.prop('render')({});

    expect(wrapper.find('.App__demoBanner').text()).toContain('演示模式');
    expect(wrapper.find('.App__demoBanner').text()).toContain('刷新后会清空');
    expect(demoRoute.exists()).toBe(true);
    expect(demoBoard.props.demoMode).toBe(true);
    expect(wrapper.find('PremiumRequiredModal').exists()).toBe(false);
    expect(wrapper.find('LoginRequiredModal').exists()).toBe(false);
  });
});
