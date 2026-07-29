import React from 'react';
import { mount } from 'enzyme';
import EmergencyCommunicationDialog from './EmergencyCommunicationDialog.component';
import PatientActionButton from './PatientActionButton.component';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';

describe('EmergencyCommunicationDialog', () => {
  test('speaks and records an emergency phrase from an independent screen', () => {
    const onSpeak = jest.fn();
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const wrapper = mount(
      <EmergencyCommunicationDialog
        open
        onClose={onClose}
        onSpeak={onSpeak}
        onConfirm={onConfirm}
        boards={[
          {
            id: 'emergency',
            name: '紧急沟通',
            tiles: [
              {
                id: 'help',
                label: '帮帮我',
                image: '/help.png'
              }
            ]
          }
        ]}
      />
    );

    wrapper
      .find('[data-emergency-phrase="help"]')
      .first()
      .simulate('click');
    wrapper.update();

    expect(onSpeak).toHaveBeenCalledWith('帮帮我');
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'express',
        sentence: '帮帮我'
      })
    );
    expect(wrapper.text()).toContain('帮帮我');
    expect(
      wrapper.find('.CommunicationSupportPanel__displayOverlay')
    ).toHaveLength(0);
    expect(
      wrapper.find('.CommunicationSupportPanel__emergencyPictogram').prop('src')
    ).toBe('/help.png');
    expect(
      wrapper
        .find(PatientActionButton)
        .filterWhere(
          button => button.prop('action') === PATIENT_ACTION_IDS.back
        )
    ).toHaveLength(1);
  });
});
