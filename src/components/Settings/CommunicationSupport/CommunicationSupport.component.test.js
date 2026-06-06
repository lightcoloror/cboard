import React from 'react';
import { shallowMatchSnapshot } from '../../../common/test_utils';
import { shallow } from 'enzyme';
import CommunicationSupportSettings from './CommunicationSupport.component';

jest.mock('./CommunicationSupport.messages', () => {
  return {
    title: {
      id: 'cboard.components.Settings.CommunicationSupport.title',
      defaultMessage: 'Communication Support'
    },
    summary: {
      id: 'cboard.components.Settings.CommunicationSupport.summary',
      defaultMessage: 'Manage communication support data.'
    },
    savedPhrases: {
      id: 'cboard.components.Settings.CommunicationSupport.savedPhrases',
      defaultMessage: 'Saved phrases'
    },
    history: {
      id: 'cboard.components.Settings.CommunicationSupport.history',
      defaultMessage: 'Receiver history'
    },
    countLabel: {
      id: 'cboard.components.Settings.CommunicationSupport.countLabel',
      defaultMessage: 'Items'
    },
    syncState: {
      id: 'cboard.components.Settings.CommunicationSupport.syncState',
      defaultMessage: 'Sync state'
    },
    syncLoggedIn: {
      id: 'cboard.components.Settings.CommunicationSupport.syncLoggedIn',
      defaultMessage: 'Signed in'
    },
    syncGuest: {
      id: 'cboard.components.Settings.CommunicationSupport.syncGuest',
      defaultMessage: 'Guest mode'
    },
    syncNow: {
      id: 'cboard.components.Settings.CommunicationSupport.syncNow',
      defaultMessage: 'Sync now'
    },
    uploadLocal: {
      id: 'cboard.components.Settings.CommunicationSupport.uploadLocal',
      defaultMessage: 'Upload local to cloud'
    },
    exportJson: {
      id: 'cboard.components.Settings.CommunicationSupport.exportJson',
      defaultMessage: 'Export JSON'
    },
    importJson: {
      id: 'cboard.components.Settings.CommunicationSupport.importJson',
      defaultMessage: 'Import JSON'
    },
    clearSaved: {
      id: 'cboard.components.Settings.CommunicationSupport.clearSaved',
      defaultMessage: 'Clear saved phrases'
    },
    clearHistory: {
      id: 'cboard.components.Settings.CommunicationSupport.clearHistory',
      defaultMessage: 'Clear history'
    }
  };
});

const COMPONENT_PROPS = {
  onClose: () => {},
  savedCount: 2,
  historyCount: 3,
  isLogged: false,
  syncMessage: '',
  onSyncNow: () => {},
  onUploadLocal: () => {},
  onExportJson: () => {},
  onImportJson: () => {},
  onClearSaved: () => {},
  onClearHistory: () => {}
};

describe('CommunicationSupport settings', () => {
  test('default renderer', () => {
    shallowMatchSnapshot(<CommunicationSupportSettings {...COMPONENT_PROPS} />);
  });

  test('cloud actions are disabled for guest mode', () => {
    const wrapper = shallow(
      <CommunicationSupportSettings {...COMPONENT_PROPS} />
    );
    const buttons = wrapper.find('WithStyles(ForwardRef(Button))');

    expect(buttons.at(0).prop('disabled')).toBe(true);
    expect(buttons.at(1).prop('disabled')).toBe(true);
  });
});
