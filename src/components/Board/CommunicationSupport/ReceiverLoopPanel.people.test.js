import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import ReceiverLoopPanel from './ReceiverLoopPanel.component';
import { buildPersonalPictogramTileDTO } from '../../../common/communicationSupport/pictogramMetadataSuggestion';
import { createBoardDTO } from '../../../common/communicationSupport/dto';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';

jest.mock('../Symbol', () => props => (
  <img alt={props.label} src={props.image} />
));
jest.mock('./ReceiverDisplay.component', () => () => null);

test('real matcher presents same-name photos, confirms one and restores without a request', async () => {
  jest.useFakeTimers();
  const board = createBoardDTO({
    id: 'device_private_people',
    name: '合成人物',
    tiles: ['a', 'b'].map(id =>
      buildPersonalPictogramTileDTO({
        id,
        boardId: 'device_private_people',
        label: '林知岚',
        category: 'people',
        image: `synthetic-private://${id}`
      })
    )
  });
  const values = new Map();
  const repo = createCommunicationRepository({
    storage: {
      getItem: key => values.get(key),
      setItem: (key, value) => values.set(key, value)
    }
  });
  const onRecordMissingTokens = jest.fn();
  const onAiResegment = jest.fn();
  const props = {
    boards: [board],
    onJumpBoard: jest.fn(),
    onApplyOutput: jest.fn(),
    onCreateDraft: repo.createReceiverDraft,
    onUpdateDraft: repo.updateReceiverDraft,
    onRecordMissingTokens,
    onAiResegment
  };
  let wrapper = mount(<ReceiverLoopPanel {...props} />);
  act(() =>
    wrapper
      .find(TextField)
      .first()
      .prop('onChange')({ target: { value: '林知岚' } })
  );
  wrapper.update();
  act(() => {
    wrapper
      .find(Button)
      .filterWhere(node => node.text() === '生成图片序列')
      .simulate('click');
  });
  await act(async () => jest.runOnlyPendingTimers());
  wrapper.update();
  expect(wrapper.find('[aria-label="确认林知岚指谁"]').length).toBe(1);
  const choices = wrapper.find('[aria-label="确认林知岚指谁"]').find(Button);
  expect(choices).toHaveLength(2);
  act(() => {
    choices.at(1).simulate('click');
  });
  wrapper.update();
  expect(
    repo.loadResumableReceiverRecord().pictogramSequence[0].pictogramId
  ).toBe('b');
  wrapper.unmount();
  wrapper = mount(
    <ReceiverLoopPanel
      {...props}
      initialRecord={JSON.parse(
        JSON.stringify(repo.loadResumableReceiverRecord())
      )}
    />
  );
  expect(
    wrapper.find('img[src="synthetic-private://b"]').length
  ).toBeGreaterThan(0);
  expect(wrapper.find('[aria-label="确认林知岚指谁"]').length).toBe(0);
  expect(onRecordMissingTokens).not.toHaveBeenCalled();
  expect(onAiResegment).not.toHaveBeenCalled();
  wrapper.unmount();
  jest.useRealTimers();
});
