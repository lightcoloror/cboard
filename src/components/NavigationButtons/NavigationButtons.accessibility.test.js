import React from 'react';
import { mount } from 'enzyme';
import { IntlProvider } from 'react-intl';
import NavigationButtons from './NavigationButtons.component';
jest.unmock('react-intl');

const render = props => mount(<IntlProvider locale="en"><NavigationButtons active isNavigationButtonsOnTheSide {...props} /></IntlProvider>);
test('root navigation is genuinely disabled and named, not merely styled as unavailable', () => {
  const back = jest.fn(), root = jest.fn();
  const wrapper = render({ navHistory: ['root'], previousBoard: back, toRootBoard: root });
  const buttons = wrapper.find('button');
  expect(buttons).toHaveLength(2);
  buttons.forEach(button => { expect(button.prop('disabled')).toBe(true); expect(button.prop('aria-label')).toBeTruthy(); button.getDOMNode().click(); });
  expect(back).not.toHaveBeenCalled(); expect(root).not.toHaveBeenCalled();
  wrapper.unmount();
});
test('saving disables both actions; available navigation keeps native keyboard button semantics', () => {
  const back = jest.fn(), root = jest.fn();
  const wrapper = render({ navHistory: ['root', 'folder', 'child'], previousBoard: back, toRootBoard: root, isSaving: true });
  wrapper.find('button').forEach(button => expect(button.prop('disabled')).toBe(true));
  wrapper.setProps({ children: <NavigationButtons active isNavigationButtonsOnTheSide navHistory={['root','folder','child']} previousBoard={back} toRootBoard={root} /> });
  wrapper.find('button').forEach(button => { expect(button.prop('disabled')).toBe(false); expect(button.prop('type')).toBe('button'); button.getDOMNode().click(); });
  expect(root).toHaveBeenCalledTimes(1); expect(back).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});
