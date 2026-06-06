import React from 'react';
import { shallow } from 'enzyme';
import { matchSnapshotWithIntlProvider } from '../../../common/test_utils';

import TileEditor, {
  TileEditor as TileEditorComponent
} from './TileEditor.component';

jest.mock('./TileEditor.messages', () => {
  const mockedMessages = {
    createTile: {
      id: 'cboard.components.Board.TileEditor.createTile',
      defaultMessage: 'Create tile'
    },
    editTile: {
      id: 'cboard.components.Board.TileEditor.editTile',
      defaultMessage: 'Edit Tile'
    },
    label: {
      id: 'cboard.components.Board.TileEditor.label',
      defaultMessage: 'Label'
    },
    boardName: {
      id: 'cboard.components.Board.TileEditor.boardName',
      defaultMessage: 'Board Name'
    },
    vocalization: {
      id: 'cboard.components.Board.TileEditor.vocalization',
      defaultMessage: 'Vocalization'
    },
    matchingSynonyms: {
      id: 'cboard.components.Board.TileEditor.matchingSynonyms',
      defaultMessage: 'Matching synonyms'
    },
    excludeTokens: {
      id: 'cboard.components.Board.TileEditor.excludeTokens',
      defaultMessage: 'Exclude tokens'
    },
    semanticCategory: {
      id: 'cboard.components.Board.TileEditor.semanticCategory',
      defaultMessage: 'Semantic category'
    },
    matchingSynonymsHelper: {
      id: 'cboard.components.Board.TileEditor.matchingSynonymsHelper',
      defaultMessage:
        'Comma-separated optional matching hints for the receiver workflow'
    },
    excludeTokensHelper: {
      id: 'cboard.components.Board.TileEditor.excludeTokensHelper',
      defaultMessage:
        'Optional tokens that should not resolve to this tile during matching'
    },
    semanticCategoryHelper: {
      id: 'cboard.components.Board.TileEditor.semanticCategoryHelper',
      defaultMessage:
        'Optional category override used to improve receiver-side matching'
    },
    voiceRecorder: {
      id: 'cboard.components.Board.TileEditor.voiceRecorder',
      defaultMessage: 'Voice Recorder'
    },
    button: {
      id: 'cboard.components.Board.TileEditor.button',
      defaultMessage: 'Button'
    },
    folder: {
      id: 'cboard.components.Board.TileEditor.folder',
      defaultMessage: 'Folder'
    },
    type: {
      id: 'cboard.components.Board.TileEditor.type',
      defaultMessage: 'Type'
    },
    back: {
      id: 'cboard.components.Board.TileEditor.back',
      defaultMessage: 'Back'
    },
    next: {
      id: 'cboard.components.Board.TileEditor.next',
      defaultMessage: 'Next'
    },
    symbolSearch: {
      id: 'cboard.components.Board.TileEditor.symbolSearch',
      defaultMessage: 'Symbol search'
    },
    existingBoards: {
      id: 'cboard.components.Board.TileEditor.existingBoards',
      defaultMessage: 'Link to an existing board'
    },
    none: {
      id: 'cboard.components.Board.TileEditor.none',
      defaultMessage: 'None'
    },
    symbols: {
      id: 'cboard.components.Board.TileEditor.symbols',
      defaultMessage: 'Symbols'
    },
    editImage: {
      id: 'cboard.components.Board.TileEditor.editImage',
      defaultMessage: 'Edit image'
    },
    loadFolderBoard: {
      id: 'cboard.components.Board.TileEditor.loadFolderBoard',
      defaultMessage: 'Link to an existing folder'
    }
  };

  return {
    __esModule: true,
    default: mockedMessages,
    ...mockedMessages
  };
});
describe('TileEditor tests', () => {
  const props = {
    intl: {
      formatMessage: jest.fn(message => message?.defaultMessage || message?.id),
      locale: 'en-US'
    },
    open: true,
    onClose: jest.fn(),
    editingTiles: [],
    boards: [],
    folders: [],
    onEditSubmit: jest.fn(),
    onAddSubmit: jest.fn()
  };

  test('default renderer', () => {
    matchSnapshotWithIntlProvider(<TileEditor {...props} />);
  });
  test('mount renderer', () => {
    const wrapper = shallow(<TileEditor {...props} />);
    expect(wrapper).toMatchSnapshot();
  });

  test('shows communication matching fields for button tiles', () => {
    const wrapper = shallow(<TileEditorComponent {...props} />);
    const synonymsField = wrapper.findWhere(
      node => node.prop('id') === 'communicationSynonyms'
    );
    const excludeTokensField = wrapper.findWhere(
      node => node.prop('id') === 'communicationExcludeTokens'
    );
    const categoryField = wrapper.findWhere(
      node => node.prop('id') === 'communicationCategory'
    );

    expect(synonymsField.exists()).toBe(true);
    expect(excludeTokensField.exists()).toBe(true);
    expect(categoryField.exists()).toBe(true);
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cboard.components.Board.TileEditor.matchingSynonymsHelper'
      })
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cboard.components.Board.TileEditor.excludeTokensHelper'
      })
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cboard.components.Board.TileEditor.semanticCategoryHelper'
      })
    );
  });

  test('hides communication matching fields for board tiles', () => {
    const wrapper = shallow(
      <TileEditorComponent
        {...props}
        editingTiles={[
          {
            id: 'board-tile',
            type: 'board',
            label: 'Daily board',
            loadBoard: 'root'
          }
        ]}
      />
    );

    expect(wrapper.find('#communicationSynonyms').exists()).toBe(false);
    expect(wrapper.find('#communicationExcludeTokens').exists()).toBe(false);
    expect(wrapper.find('#communicationCategory').exists()).toBe(false);
  });
});
