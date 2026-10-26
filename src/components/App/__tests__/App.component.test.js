import React from 'react';
import { shallow } from 'enzyme';
import { Route } from 'react-router-dom';
import { App } from '../App.component';
import { IntlProvider } from 'react-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import chineseMessages from '../../../translations/zh-CN.json';

jest.unmock('react-intl');

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

describe('App offline readiness', () => {
  const originalCareMode = process.env.REACT_APP_CARE_COLLABORATION;

  beforeEach(() => {
    process.env.REACT_APP_CARE_COLLABORATION = 'true';
  });
  afterEach(() => {
    if (originalCareMode === undefined)
      delete process.env.REACT_APP_CARE_COLLABORATION;
    else process.env.REACT_APP_CARE_COLLABORATION = originalCareMode;
  });

  test.each([
    ['preparing', '正在准备离线页面'],
    ['ready', '离线页面已就绪'],
    ['error', '请联网后刷新重试'],
    ['unavailable', '当前环境无法准备离线页面']
  ])('persistently renders the %s state in the care app', (status, text) => {
    const wrapper = shallow(<App {...props} offlineReadiness={{ status }} />);
    const banner = wrapper.find('.App__offlineStatus');
    expect(banner.prop('role')).toBe('status');
    expect(banner.prop('aria-live')).toBe('polite');
    expect(banner.prop('data-offline-status')).toBe(status);
    const markup = renderToStaticMarkup(
      <IntlProvider locale="zh-CN" messages={chineseMessages}>
        {banner.getElement()}
      </IntlProvider>
    );
    expect(markup).toContain(text);
    if (status === 'ready') {
      expect(markup).toContain('本机已保存的图片');
      expect(markup).toContain('在线搜图和云端功能仍需联网');
    }
  });

  test('does not imply that an unreported state is already ready', () => {
    const wrapper = shallow(<App {...props} />);
    expect(
      wrapper.find('.App__offlineStatus').prop('data-offline-status')
    ).toBe('preparing');
  });

  test('hides the offline banner outside care mode and in the transient demo', () => {
    process.env.REACT_APP_CARE_COLLABORATION = 'false';
    expect(
      shallow(<App {...props} />)
        .find('.App__offlineStatus')
        .exists()
    ).toBe(false);
    process.env.REACT_APP_CARE_COLLABORATION = 'true';
    expect(
      shallow(<App {...props} demoMode />)
        .find('.App__offlineStatus')
        .exists()
    ).toBe(false);
  });
});
