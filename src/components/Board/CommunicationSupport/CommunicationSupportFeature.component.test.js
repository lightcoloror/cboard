import React from 'react';
import { shallow } from 'enzyme';
import CommunicationSupportFeature from './CommunicationSupportFeature.component';
import {
  COMMUNICATION_SUPPORT_VARIANTS,
  TUYUJIA_COMMUNICATION_SUPPORT_COPY
} from '../../../common/communicationSupport/legacy';

jest.mock(
  './CommunicationSupportPanel.container',
  () => 'CommunicationSupportPanel'
);

describe('CommunicationSupportFeature', () => {
  test('renders the generic communication support panel by default', () => {
    const wrapper = shallow(<CommunicationSupportFeature />);
    const panel = wrapper.find('CommunicationSupportPanel');

    expect(panel.exists()).toBe(true);
    expect(panel.prop('copyOverrides')).toBeUndefined();
    expect(panel.prop('initialMode')).toBeUndefined();
  });

  test('configures the TuYuJia variant to open directly in receive mode', () => {
    const onPictogramUsed = jest.fn();
    const pictogramOrdering = { usageByTileKey: {} };
    const wrapper = shallow(
      <CommunicationSupportFeature
        variant={COMMUNICATION_SUPPORT_VARIANTS.tuyujia}
        pictogramOrdering={pictogramOrdering}
        onPictogramUsed={onPictogramUsed}
      />
    );
    const panel = wrapper.find('CommunicationSupportPanel');

    expect(panel.exists()).toBe(true);
    expect(panel.prop('copyOverrides')).toEqual(
      TUYUJIA_COMMUNICATION_SUPPORT_COPY
    );
    expect(panel.prop('initialMode')).toBe('receive');
    expect(panel.prop('pictogramOrdering')).toBe(pictogramOrdering);
    expect(panel.prop('onPictogramUsed')).toBe(onPictogramUsed);
  });

  test('forwards isolated demo mode to the shared panel', () => {
    const wrapper = shallow(<CommunicationSupportFeature demoMode />);

    expect(wrapper.find('CommunicationSupportPanel').prop('demoMode')).toBe(
      true
    );
  });
});
