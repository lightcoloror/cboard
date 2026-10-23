import React from 'react';
import { shallow, mount } from 'enzyme';
import { shallowMatchSnapshot } from '../../../common/test_utils';
import FullScreenDialog from './FullScreenDialog';

jest.mock('../../App/App.messages', () => {
  return {
    save: {
      id: 'cboard.components.App.save',
      defaultMessage: 'Save'
    },
    newContentAvailable: {
      id: 'cboard.components.App.newContentAvailable',
      defaultMessage: 'New content is available; please refresh.'
    },
    contentIsCached: {
      id: 'cboard.components.App.contentIsCached',
      defaultMessage: 'Content is cached for offline use.'
    }
  };
});

const props = {
  disableSubmit: false,
  open: true,
  title: 'test',
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  disableSubmit: false,
  transition: 'up'
};

describe('FullScreenDialog tests', () => {
  test('opt-in managed save does not close before its caller confirms persistence', () => {
    const onClose = jest.fn();
    const onSubmit = jest.fn();
    const wrapper = shallow(<FullScreenDialog {...props} closeOnSubmit={false} onClose={onClose} onSubmit={onSubmit} />).dive();
    wrapper.find('#save-button').simulate('click');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
  test('legacy dialogs retain their submit then close behavior', () => {
    const onClose = jest.fn();
    const onSubmit = jest.fn();
    const wrapper = shallow(<FullScreenDialog {...props} onClose={onClose} onSubmit={onSubmit} />).dive();
    wrapper.find('#save-button').simulate('click');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  test('default renderer', () => {
    shallowMatchSnapshot(<FullScreenDialog {...props} />);
  });
  test('check transition', () => {
    const fade = { ...props, transition: 'fade' };
    const wrapper = shallow(<FullScreenDialog {...fade} />);
  });
});
