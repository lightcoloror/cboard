import React from 'react';
import { shallow } from 'enzyme';
import Button from '@material-ui/core/Button';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import PatientActionButton from './PatientActionButton.component';

describe('PatientActionButton', () => {
  it('renders an icon-first action with a full accessible label', () => {
    const wrapper = shallow(
      <PatientActionButton action={PATIENT_ACTION_IDS.play} />
    );

    expect(wrapper.find(Button).prop('aria-label')).toBe('朗读当前句子');
    expect(wrapper.find(Button).prop('data-patient-action')).toBe('play');
    expect(wrapper.find(PlayArrowIcon)).toHaveLength(1);
    expect(wrapper.find('.PatientActionButton-label').text()).toBe('朗读');
  });

  it('accepts short state text without removing the action meaning', () => {
    const wrapper = shallow(
      <PatientActionButton
        action={PATIENT_ACTION_IDS.play}
        label="朗读中"
        ariaLabel="正在朗读当前句子"
        disabled
      />
    );

    expect(wrapper.find(Button).prop('disabled')).toBe(true);
    expect(wrapper.find(Button).prop('aria-label')).toBe('正在朗读当前句子');
    expect(wrapper.find('.PatientActionButton-label').text()).toBe('朗读中');
  });
});
