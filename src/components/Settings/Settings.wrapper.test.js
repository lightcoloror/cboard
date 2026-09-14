import React from 'react';
import { shallow, mount } from 'enzyme';
import { MemoryRouter, Route, Switch } from 'react-router-dom';
import { act } from 'react-dom/test-utils';
import * as servicePolicy from '../../legacyServices';
import SettingsWrapper from './Settings.wrapper';
import { COMMUNICATION_SUPPORT_ROUTE_SEGMENTS } from '../../common/communicationSupport/legacy';

jest.mock('./Settings.container', () => 'Settings');
jest.mock('./People', () => 'People');
jest.mock('./Subscribe', () => 'Subscribe');
jest.mock('./Language', () => 'Language');
jest.mock('./Speech', () => 'Speech');
jest.mock('./Export', () => 'Export');
jest.mock('./Import', () => 'Import');
jest.mock('./Display', () => 'Display');
jest.mock('./About', () => 'About');
jest.mock('./Scanning', () => 'Scanning');
jest.mock('./Navigation', () => 'Navigation');
jest.mock('./Help', () => 'Help');
jest.mock('./Symbols', () => 'Symbols');
jest.mock('./CommunicationSupport', () => 'CommunicationSupport');
jest.mock('./Tuyujia', () => 'Tuyujia');
jest.mock('../../legacyServices', () => ({
  __esModule: true,
  legacyServicesEnabled: true
}));

describe('Settings wrapper', () => {
  afterEach(() => {
    servicePolicy.legacyServicesEnabled = true;
  });
  test.each(['communication-support', 'tuyujia', 'subscribe'])(
    'care mode redirects the legacy %s route before mounting its controls',
    async path => {
      servicePolicy.legacyServicesEnabled = false;
      let wrapper;
      await act(async () => {
        wrapper = mount(
          <MemoryRouter initialEntries={[`/settings/${path}`]}>
            <Switch>
              <Route path="/settings" component={SettingsWrapper} />
              <Route path="/care" render={() => <div>患者授权设置</div>} />
            </Switch>
          </MemoryRouter>
        );
      });
      wrapper.update();
      expect(wrapper.text()).toBe('患者授权设置');
      expect(wrapper.find('CommunicationSupport')).toHaveLength(0);
      expect(wrapper.find('Tuyujia')).toHaveLength(0);
      expect(wrapper.find('Subscribe')).toHaveLength(0);
      wrapper.unmount();
    }
  );
  test.each(['communication-support', 'tuyujia'])(
    'upstream mode retains the legacy %s component',
    path => {
      const wrapper = shallow(<SettingsWrapper match={{ url: '/settings' }} />);
      const route = wrapper
        .find('Route')
        .findWhere(item => item.prop('path') === `/settings/${path}`);
      expect(route.prop('render')({}).type).toBe(
        path === 'tuyujia' ? 'Tuyujia' : 'CommunicationSupport'
      );
    }
  );
  test('registers communication support routes', () => {
    const wrapper = shallow(<SettingsWrapper match={{ url: '/settings' }} />);
    const routes = wrapper.find('Route');
    const paths = routes.map(route => route.prop('path')).filter(Boolean);

    expect(paths).toContain(
      `/settings/${COMMUNICATION_SUPPORT_ROUTE_SEGMENTS.default}`
    );
    expect(paths).toContain(
      `/settings/${COMMUNICATION_SUPPORT_ROUTE_SEGMENTS.tuyujia}`
    );
  });

  test('keeps the root settings route exact', () => {
    const wrapper = shallow(<SettingsWrapper match={{ url: '/settings' }} />);
    const rootRoute = wrapper.find('Route').at(0);

    expect(rootRoute.prop('exact')).toBe(true);
    expect(rootRoute.prop('path')).toBeUndefined();
  });
});
