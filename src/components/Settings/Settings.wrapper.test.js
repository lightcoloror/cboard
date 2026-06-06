import React from 'react';
import { shallow } from 'enzyme';
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

describe('Settings wrapper', () => {
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
