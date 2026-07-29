import React from 'react';
import { shallow } from 'enzyme';

import Board from '../Board.component';
import Symbol from '../Symbol';
import Tile from '../Tile';
import FixedGrid from '../../FixedGrid';
import Navbar from '../Navbar';
import { COMMUNICATION_PREFERENCES_CHANGED_EVENT } from '../../../common/communicationSupport/localData';
import { PICTOGRAM_ORDERING_STORAGE_KEY } from '../../../common/communicationSupport/pictogramOrderingStore';
jest.mock('../CommunicationSupport', () => 'CommunicationSupportFeature');
jest.mock('../Board.messages', () => ({
  editTitle: {
    id: 'cboard.components.Board.editTitle',
    defaultMessage: 'Edit Board Title'
  },
  boardTitle: {
    id: 'cboard.components.Board.boardTitle',
    defaultMessage: 'Board Title'
  },
  boardEditTitleCancel: {
    id: 'cboard.components.Board.boardEditTitleCancel',
    defaultMessage: 'Cancel'
  },
  boardEditTitleAccept: {
    id: 'cboard.components.Board.boardEditTitleAccept',
    defaultMessage: 'Accept'
  }
}));

const intlMock = {
  formatMessage: ({ id }) => id
};

it('renders without crashing', () => {
  const props = {
    intl: intlMock,
    onAddRemoveColumn: () => {},
    onAddRemoveRow: () => {},
    disableTour: () => {},
    board: {
      id: 'root',
      name: 'home',
      author: 'Cboard',
      email: 'support@cboard.io',
      isPublic: true,
      hidden: false,
      tiles: [
        {
          labelKey: 'cboard.symbol.yes',
          image: '/symbols/mulberry/correct.svg',
          id: 'HJVQMR9pX5F-',
          backgroundColor: 'rgb(255, 241, 118)',
          label: 'yes'
        },
        {
          labelKey: 'symbol.descriptiveState.no',
          image: '/symbols/mulberry/no.svg',
          id: 'SkBQMRqpX5t-',
          backgroundColor: 'rgb(255, 241, 118)',
          label: 'no'
        }
      ]
    }
  };
  const wrapper = shallow(<Board {...props} />);
  expect(wrapper.find('CommunicationSupportFeature').exists()).toBe(true);
  expect(wrapper.find('.Board__communicationSupport').exists()).toBe(true);
});

it('forwards isolated demo mode to the communication flow and navbar', () => {
  const wrapper = shallow(
    <Board
      intl={intlMock}
      demoMode
      onAddRemoveColumn={() => {}}
      onAddRemoveRow={() => {}}
      disableTour={() => {}}
      board={{ id: 'root', name: 'home', tiles: [] }}
    />
  );

  expect(wrapper.find('CommunicationSupportFeature').prop('demoMode')).toBe(
    true
  );
  expect(wrapper.find(Navbar).prop('demoMode')).toBe(true);
});

it('renders a private image overlay but clicks the unchanged CBoard tile', () => {
  const onTileClick = jest.fn();
  const tile = {
    labelKey: 'cboard.symbol.water',
    image: '/symbols/default-water.svg',
    id: 'water',
    backgroundColor: '#ffffff',
    label: 'water'
  };
  const wrapper = shallow(
    <Board
      intl={intlMock}
      onAddRemoveColumn={() => {}}
      onAddRemoveRow={() => {}}
      disableTour={() => {}}
      onTileClick={onTileClick}
      personalImageIdentity={{
        patientId: 'patient-a',
        workspaceId: 'workspace-a'
      }}
      personalImagePreferences={[
        {
          tileId: 'water',
          boardId: '',
          image: 'data:image/png;base64,private',
          patientId: 'patient-a',
          workspaceId: 'workspace-a'
        }
      ]}
      board={{
        id: 'root',
        name: 'home',
        tiles: [tile]
      }}
    />
  );

  expect(
    wrapper
      .find(Symbol)
      .first()
      .prop('image')
  ).toBe('data:image/png;base64,private');
  wrapper
    .find(Tile)
    .first()
    .prop('onClick')({ stopPropagation: jest.fn() });
  expect(onTileClick).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'water',
      image: '/symbols/default-water.svg'
    })
  );
});

it('orders expression tiles by actual usage without moving folder positions', () => {
  const board = {
    id: 'root',
    name: 'home',
    isFixed: true,
    grid: {
      rows: 1,
      columns: 3,
      order: [['folder', 'water', 'rice']]
    },
    tiles: [
      { id: 'folder', label: '饮食', loadBoard: 'food' },
      { id: 'water', label: '水' },
      { id: 'rice', label: '米饭' }
    ]
  };
  const wrapper = shallow(
    <Board
      intl={intlMock}
      board={board}
      onTileClick={jest.fn()}
      onAddRemoveColumn={() => {}}
      onAddRemoveRow={() => {}}
      disableTour={() => {}}
    />
  );

  wrapper.setState({
    pictogramSortMode: 'popularity',
    pictogramOrdering: {
      usageByTileKey: {
        'root:water': { count: 1, lastUsedAt: 1 },
        'root:rice': { count: 2, lastUsedAt: 2 }
      }
    }
  });

  expect(
    wrapper
      .find(FixedGrid)
      .prop('items')
      .map(tile => tile.id)
  ).toEqual(['folder', 'rice', 'water']);
  expect(wrapper.find(FixedGrid).prop('order')).toEqual([
    ['folder', 'rice', 'water']
  ]);
});

it('counts only actual expression tile clicks and reacts to ordering changes', () => {
  window.localStorage.removeItem(PICTOGRAM_ORDERING_STORAGE_KEY);
  const onTileClick = jest.fn();
  const board = {
    id: 'root',
    name: 'home',
    tiles: [
      { id: 'folder', label: '饮食', loadBoard: 'food' },
      { id: 'water', label: '水' }
    ]
  };
  const wrapper = shallow(
    <Board
      intl={intlMock}
      board={board}
      onTileClick={onTileClick}
      onAddRemoveColumn={() => {}}
      onAddRemoveRow={() => {}}
      disableTour={() => {}}
    />
  );
  const instance = wrapper.instance();
  instance.boardContainerRef.current = { scrollTop: 1 };

  instance.handleTileClick(board.tiles[0]);
  instance.handleTileClick(board.tiles[1]);
  expect(wrapper.state('pictogramOrdering').usageByTileKey).toEqual(
    expect.objectContaining({
      'root:water': expect.objectContaining({ count: 1 })
    })
  );
  expect(
    wrapper.state('pictogramOrdering').usageByTileKey['root:folder']
  ).toBeUndefined();

  instance.handleCommunicationPreferencesChanged(
    new window.CustomEvent(COMMUNICATION_PREFERENCES_CHANGED_EVENT, {
      detail: { pictogramSortMode: 'popularity' }
    })
  );
  expect(wrapper.state('pictogramSortMode')).toBe('popularity');
  expect(onTileClick).toHaveBeenCalledTimes(2);
});
