import React from 'react';
import { shallow } from 'enzyme';
import TuyujiaSettings from './Tuyujia.component';

jest.mock('./Tuyujia.messages', () => {
  return {
    title: {
      id: 'cboard.components.Settings.Tuyujia.title',
      defaultMessage: 'TuYuJia'
    },
    summary: {
      id: 'cboard.components.Settings.Tuyujia.summary',
      defaultMessage: 'Manage TuYuJia data.'
    },
    savedPhrases: {
      id: 'cboard.components.Settings.Tuyujia.savedPhrases',
      defaultMessage: 'Saved phrases'
    },
    history: {
      id: 'cboard.components.Settings.Tuyujia.history',
      defaultMessage: 'Receiver history'
    },
    countLabel: {
      id: 'cboard.components.Settings.Tuyujia.countLabel',
      defaultMessage: 'Items'
    },
    syncState: {
      id: 'cboard.components.Settings.Tuyujia.syncState',
      defaultMessage: 'Sync state'
    },
    syncLoggedIn: {
      id: 'cboard.components.Settings.Tuyujia.syncLoggedIn',
      defaultMessage: 'Signed in'
    },
    syncGuest: {
      id: 'cboard.components.Settings.Tuyujia.syncGuest',
      defaultMessage: 'Guest mode'
    },
    syncNow: {
      id: 'cboard.components.Settings.Tuyujia.syncNow',
      defaultMessage: 'Sync now'
    },
    uploadLocal: {
      id: 'cboard.components.Settings.Tuyujia.uploadLocal',
      defaultMessage: 'Upload local to cloud'
    },
    exportJson: {
      id: 'cboard.components.Settings.Tuyujia.exportJson',
      defaultMessage: 'Export JSON'
    },
    importJson: {
      id: 'cboard.components.Settings.Tuyujia.importJson',
      defaultMessage: 'Import JSON'
    },
    clearSaved: {
      id: 'cboard.components.Settings.Tuyujia.clearSaved',
      defaultMessage: 'Clear saved phrases'
    },
    clearHistory: {
      id: 'cboard.components.Settings.Tuyujia.clearHistory',
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

describe('Tuyujia settings', () => {
  test('default renderer', () => {
    const wrapper = shallow(<TuyujiaSettings {...COMPONENT_PROPS} />);
    expect(wrapper.find('CommunicationSupportSettings').exists()).toBe(true);
  });

  test('wraps communication support settings with TuYuJia copy overrides', () => {
    const wrapper = shallow(<TuyujiaSettings {...COMPONENT_PROPS} />);
    const component = wrapper.find('CommunicationSupportSettings');

    expect(component.exists()).toBe(true);
    expect(component.prop('savedCount')).toBe(2);
    expect(component.prop('historyCount')).toBe(3);
    expect(component.prop('titleOverride')).toBeTruthy();
    expect(component.prop('summaryOverride')).toBeTruthy();
  });
});
