import React from 'react';
import renderer, { act } from 'react-test-renderer';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

jest.mock('@material-ui/core/Dialog', () => 'Dialog');
jest.mock('@material-ui/core/DialogTitle', () => 'DialogTitle');
jest.mock('@material-ui/core/DialogContent', () => 'DialogContent');
jest.mock('@material-ui/core/DialogContentText', () => 'DialogContentText');
jest.mock('@material-ui/core/DialogActions', () => 'DialogActions');
jest.mock('@material-ui/core/TextField', () => 'TextField');
jest.mock('@material-ui/core/Checkbox', () => 'Checkbox');
jest.mock('@material-ui/core/FormControlLabel', () => props => props.control);
jest.mock('@material-ui/core/Button', () => 'Button');
jest.mock('@material-ui/core', () => ({
  Button: 'Button',
  Dialog: 'Dialog',
  DialogActions: 'DialogActions',
  DialogContent: 'DialogContent',
  DialogContentText: 'DialogContentText',
  DialogTitle: 'DialogTitle',
  LinearProgress: 'LinearProgress'
}));
jest.mock('react-intl', () => ({
  FormattedMessage: () => null,
  defineMessages: value => value
}));

test('a changed family list requires fresh text and checkbox confirmation', () => {
  const props = {
    open: true,
    familyCloseIds: ['family-a'],
    handleClose: jest.fn(),
    handleDeleteConfirmed: jest.fn(),
    handleFamilyCloseConfirmed: jest.fn()
  };
  let tree;
  act(() => {
    tree = renderer.create(<DeleteConfirmationDialog {...props} />);
  });
  act(() => {
    tree.root
      .findByType('TextField')
      .props.onChange({ target: { value: 'delete-account' } });
    tree.root
      .findByType('Checkbox')
      .props.onChange({ target: { checked: true } });
  });
  expect(tree.root.findAllByType('Button')[0].props.disabled).toBe(false);
  act(() => {
    tree.update(
      <DeleteConfirmationDialog {...props} familyCloseIds={['family-b']} />
    );
  });
  expect(tree.root.findByType('TextField').props.value).toBe('');
  expect(tree.root.findByType('Checkbox').props.checked).toBe(false);
  expect(tree.root.findAllByType('Button')[0].props.disabled).toBe(true);
  expect(props.handleFamilyCloseConfirmed).not.toHaveBeenCalled();
});
