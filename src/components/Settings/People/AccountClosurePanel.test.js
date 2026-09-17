import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AccountClosurePanel from './AccountClosurePanel';

jest.mock('./accountClosureBrowser', () => ({
  createBrowserAccountClosure: jest.fn()
}));
jest.mock('@material-ui/core', () => ({
  Button: 'Button',
  Checkbox: 'Checkbox',
  Dialog: 'Dialog',
  DialogActions: 'DialogActions',
  DialogContent: 'DialogContent',
  DialogTitle: 'DialogTitle',
  TextField: 'TextField',
  LinearProgress: 'LinearProgress',
  FormControlLabel: props => props.control
}));
const findButton = (tree, text) =>
  tree.root
    .findAllByType('Button')
    .find(button => button.props.children === text);
async function setup(overrides = {}, accountId = 'owner') {
  const client = {
    status: jest.fn(async () => null),
    recoveries: jest.fn(async () => []),
    preview: jest.fn(async () => ({
      familyIds: ['family-a'],
      families: [{ familyId: 'family-a', profileCount: 2 }],
      blockers: [],
      canConfirm: true
    })),
    confirm: jest.fn(async () => ({
      status: 'confirmed',
      accountDeleted: false
    })),
    ...overrides
  };
  const onAccepted = jest.fn();
  let tree;
  await act(async () => {
    tree = renderer.create(
      <AccountClosurePanel
        accountId={accountId}
        client={client}
        onAccepted={onAccepted}
      />
    );
  });
  return { tree, client, onAccepted };
}

test('requires preview, explicit scope consent and exact text before confirmation', async () => {
  const { tree, client, onAccepted } = await setup();
  await act(async () => {
    await findButton(tree, '查看注销影响范围').props.onClick();
  });
  expect(findButton(tree, '保存本机副本并确认注销').props.disabled).toBe(true);
  act(() => {
    tree.root
      .findByType('Checkbox')
      .props.onChange({ target: { checked: true } });
    tree.root
      .findByType('TextField')
      .props.onChange({ target: { value: 'delete-account' } });
  });
  expect(findButton(tree, '保存本机副本并确认注销').props.disabled).toBe(false);
  await act(async () => {
    await findButton(tree, '保存本机副本并确认注销').props.onClick();
  });
  expect(client.confirm).toHaveBeenCalledTimes(1);
  expect(onAccepted).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).toContain(
    '注销已受理，云端资料仍在清理'
  );
  expect(JSON.stringify(tree.toJSON())).not.toContain('云端注销已完成');
});

test('family transfer blockers disable confirmation even after typing consent', async () => {
  const { tree, client } = await setup({
    preview: jest.fn(async () => ({
      familyIds: ['family-a'],
      families: [],
      blockers: [{ code: 'FAMILY_TRANSFER_REQUIRED' }],
      canConfirm: false
    }))
  });
  await act(async () => {
    await findButton(tree, '查看注销影响范围').props.onClick();
  });
  act(() => {
    tree.root
      .findByType('Checkbox')
      .props.onChange({ target: { checked: true } });
    tree.root
      .findByType('TextField')
      .props.onChange({ target: { value: 'delete-account' } });
  });
  expect(findButton(tree, '保存本机副本并确认注销').props.disabled).toBe(true);
  expect(client.confirm).not.toHaveBeenCalled();
});

test('does not log out a new account after the confirmed request finishes', async () => {
  const { tree, onAccepted } = await setup({ isCurrentAccount: () => false });
  await act(async () => {
    await findButton(tree, '查看注销影响范围').props.onClick();
  });
  act(() => {
    tree.root
      .findByType('Checkbox')
      .props.onChange({ target: { checked: true } });
    tree.root
      .findByType('TextField')
      .props.onChange({ target: { value: 'delete-account' } });
  });
  await act(async () => {
    await findButton(tree, '保存本机副本并确认注销').props.onClick();
  });
  expect(onAccepted).not.toHaveBeenCalled();
});

test('progress remains available without a login and never offers another deletion', async () => {
  const { tree } = await setup(
    {
      status: jest.fn(async () => ({
        status: 'confirmed',
        accountDeleted: true
      }))
    },
    null
  );
  expect(JSON.stringify(tree.toJSON())).toContain('云端注销已完成');
  expect(findButton(tree, '查看注销影响范围')).toBeUndefined();
  expect(findButton(tree, '查询注销进度')).toBeDefined();
});

test('offline or expired progress lookup does not hide a retained local archive', async () => {
  const { tree } = await setup(
    {
      status: jest.fn(async () => {
        throw { code: 'CLOSURE_RECEIPT_UNAVAILABLE' };
      }),
      recoveries: jest.fn(async () => [{ id: 'legacy', label: '本机资料' }])
    },
    null
  );
  expect(tree.root.findByType('TextField').props.label).toBe('恢复密码');
  expect(JSON.stringify(tree.toJSON())).toContain('本机资料');
});

test('local recovery failure keeps the confirmation open and does not log out', async () => {
  const { tree, onAccepted } = await setup({
    confirm: jest.fn(async () => {
      throw { code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE' };
    })
  });
  await act(async () => {
    await findButton(tree, '查看注销影响范围').props.onClick();
  });
  act(() => {
    tree.root
      .findByType('Checkbox')
      .props.onChange({ target: { checked: true } });
    tree.root
      .findByType('TextField')
      .props.onChange({ target: { value: 'delete-account' } });
  });
  await act(async () => {
    await findButton(tree, '保存本机副本并确认注销').props.onClick();
  });
  expect(tree.root.findByType('Dialog').props.open).toBe(true);
  expect(onAccepted).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('本机恢复副本未能完整保存');
});
