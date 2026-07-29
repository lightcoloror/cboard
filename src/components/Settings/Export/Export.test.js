import React from 'react';
import { shallowMatchSnapshot } from '../../../common/test_utils';
import intl from 'react-intl';
import { shallow } from 'enzyme';
import toJson from 'enzyme-to-json';
import Export from './Export.component';

jest.mock('./Export.messages', () => {
  return {
    export: {
      id: 'cboard.components.Settings.Export.export',
      defaultMessage: 'Export'
    },
    exportSingle: {
      id: 'cboard.components.Settings.Export.exportSingle',
      defaultMessage: 'Export a single board'
    },
    exportSingleSecondary: {
      id: 'cboard.components.Settings.Export.exportSingleSecondary',
      defaultMessage:
        'This option will export a single board you have from a list of boards. You can choose {cboardLink}, {link} or PDF formats.'
    },
    exportAll: {
      id: 'cboard.components.Settings.Export.exportAll',
      defaultMessage: 'Export All Boards'
    },
    exportAllSecondary: {
      id: 'cboard.components.Settings.Export.exportAllSecondary',
      defaultMessage:
        'This option will export ALL the boards you have if you choose {cboardLink} format or {link} format. It will export JUST the current board if you choose PDF format.'
    },
    boardDownloaded: {
      id: 'cboard.components.Settings.Export.boardDownloaded',
      defaultMessage: 'Your board(s) was downloaded'
    },
    boardDownloadedCva: {
      id: 'cboard.components.Settings.Export.boardDownloadedCva',
      defaultMessage:
        'Your board was downloaded. Find your file under the downloads folder'
    },
    boards: {
      id: 'cboard.components.Settings.Export.boards',
      defaultMessage: 'Boards'
    },
    pictureLibrary: {
      id: 'cboard.components.Settings.Export.pictureLibrary',
      defaultMessage: 'Picture library backup'
    },
    pictureLibrarySecondary: {
      id: 'cboard.components.Settings.Export.pictureLibrarySecondary',
      defaultMessage: 'Backup metadata and pictures'
    },
    pictureLibraryScope: {
      id: 'cboard.components.Settings.Export.pictureLibraryScope',
      defaultMessage: 'Backup scope'
    },
    pictureLibraryCustom: {
      id: 'cboard.components.Settings.Export.pictureLibraryCustom',
      defaultMessage: 'Custom pictures only'
    },
    pictureLibraryFull: {
      id: 'cboard.components.Settings.Export.pictureLibraryFull',
      defaultMessage: 'Complete library'
    },
    privatePictureLibrary: {
      id: 'privatePictureLibrary',
      defaultMessage: 'Private account picture backup'
    },
    privatePictureLibrarySecondary: {
      id: 'privatePictureLibrarySecondary',
      defaultMessage: 'Account-protected backup'
    },
    uploadPrivatePictureLibrary: {
      id: 'uploadPrivatePictureLibrary',
      defaultMessage: 'Back up private pictures'
    },
    privateDeviceData: {
      id: 'privateDeviceData',
      defaultMessage: 'Private account complete data backup'
    },
    privateDeviceDataSecondary: {
      id: 'privateDeviceDataSecondary',
      defaultMessage: 'Complete private backup'
    },
    privateDeviceDataPassphrase: {
      id: 'privateDeviceDataPassphrase',
      defaultMessage: 'Recovery password'
    },
    privateDeviceDataPassphraseConfirmation: {
      id: 'privateDeviceDataPassphraseConfirmation',
      defaultMessage: 'Confirm recovery password'
    },
    privateDeviceDataPassphraseHelp: {
      id: 'privateDeviceDataPassphraseHelp',
      defaultMessage: 'Use at least 12 characters'
    },
    privateDeviceDataPassphraseTooShort: {
      id: 'privateDeviceDataPassphraseTooShort',
      defaultMessage: 'Too short'
    },
    privateDeviceDataPassphraseTooLong: {
      id: 'privateDeviceDataPassphraseTooLong',
      defaultMessage: 'Too long'
    },
    privateDeviceDataPassphraseMismatch: {
      id: 'privateDeviceDataPassphraseMismatch',
      defaultMessage: 'Passwords do not match'
    },
    uploadPrivateDeviceData: {
      id: 'uploadPrivateDeviceData',
      defaultMessage: 'Back up complete data'
    },
    structuredPictogramLibrary: {
      id: 'cboard.components.Settings.Export.structuredPictogramLibrary',
      defaultMessage: 'Structured AAC JSON'
    }
  };
});

const COMPONENT_PROPS = {
  onExportClick: () => {},
  onPrivateLibraryUpload: () => {},
  onPrivateDeviceDataUpload: () => {},
  onClose: () => {},
  isAuthenticated: false,
  intl: {
    formatMessage: jest.fn(),
    locale: 'en-US'
  },
  boards: []
};

describe('Export tests', () => {
  test('default renderer', () => {
    shallowMatchSnapshot(<Export {...COMPONENT_PROPS} />);
  });

  test('export single board button is disabled when no board or format is selected', () => {
    const wrapper = shallow(<Export {...COMPONENT_PROPS} />);
    const buttons = wrapper.find('WithStyles(ForwardRef(Button))');
    const singleExportButton = buttons.at(0);
    expect(singleExportButton.prop('disabled')).toBe(true);
  });

  test('export all boards button is disabled when no format is selected', () => {
    const wrapper = shallow(<Export {...COMPONENT_PROPS} />);
    const buttons = wrapper.find('WithStyles(ForwardRef(Button))');
    const allExportButton = buttons.at(1);
    expect(allExportButton.prop('disabled')).toBe(true);
  });

  test('calls onExportClick when export single board button is clicked with valid selections', () => {
    const onExportClick = jest.fn();
    const wrapper = shallow(
      <Export {...COMPONENT_PROPS} onExportClick={onExportClick} />
    );
    wrapper.setState({
      singleBoard: { id: 'board1', name: 'Test Board' },
      exportSingleBoard: 'pdf'
    });
    wrapper.instance().handleSingleExport();
    expect(onExportClick).toHaveBeenCalled();
  });

  test('calls onExportClick when export all boards button is clicked with valid format', () => {
    const onExportClick = jest.fn();
    const wrapper = shallow(
      <Export {...COMPONENT_PROPS} onExportClick={onExportClick} />
    );
    wrapper.setState({ exportAllBoard: 'cboard' });
    wrapper.instance().handleAllExport();
    expect(onExportClick).toHaveBeenCalled();
  });

  test('offers structured AAC JSON for one board or the full library', () => {
    const wrapper = shallow(<Export {...COMPONENT_PROPS} />);
    const structuredOptions = wrapper.findWhere(
      node => node.prop('value') === 'structured'
    );

    expect(structuredOptions).toHaveLength(2);
  });

  test('sets boardError when export single is clicked without selecting a board', () => {
    const wrapper = shallow(<Export {...COMPONENT_PROPS} />);
    wrapper.setState({ exportSingleBoard: 'pdf' });
    wrapper.instance().handleSingleExport();
    expect(wrapper.state('boardError')).toBe(true);
  });

  test('exports the selected picture library scope and receives progress', () => {
    const onExportClick = jest.fn();
    const wrapper = shallow(
      <Export {...COMPONENT_PROPS} onExportClick={onExportClick} />
    );
    wrapper.setState({ pictureLibraryScope: 'full' });
    wrapper.instance().handlePictureLibraryExport();

    expect(onExportClick).toHaveBeenCalledWith(
      'pictureLibrary',
      'full',
      '',
      expect.any(Function),
      expect.any(Function)
    );
    const onProgress = onExportClick.mock.calls[0][4];
    onProgress({ percent: 25, detail: 'Reading pictures' });
    expect(wrapper.state('pictureLibraryProgress')).toEqual({
      percent: 25,
      detail: 'Reading pictures'
    });
  });

  test('requires login and explicitly uploads only when requested', () => {
    const onPrivateLibraryUpload = jest.fn();
    const guest = shallow(
      <Export
        {...COMPONENT_PROPS}
        onPrivateLibraryUpload={onPrivateLibraryUpload}
      />
    );
    expect(
      guest.find('#private-picture-library-upload-button').prop('disabled')
    ).toBe(true);

    const authenticated = shallow(
      <Export
        {...COMPONENT_PROPS}
        isAuthenticated
        onPrivateLibraryUpload={onPrivateLibraryUpload}
      />
    );
    expect(
      authenticated
        .find('#private-picture-library-upload-button')
        .prop('disabled')
    ).toBe(true);
    authenticated.setState({
      privateLibraryPassphrase: 'correct-horse-battery-staple',
      privateLibraryPassphraseConfirmation: 'correct-horse-battery-staple'
    });
    authenticated
      .find('#private-picture-library-upload-button')
      .simulate('click');
    expect(onPrivateLibraryUpload).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      'correct-horse-battery-staple'
    );
  });

  test('keeps complete account data backup separate and login-gated', () => {
    const onPrivateDeviceDataUpload = jest.fn();
    const guest = shallow(<Export {...COMPONENT_PROPS} />);
    expect(
      guest.find('#private-device-data-upload-button').prop('disabled')
    ).toBe(true);

    const authenticated = shallow(
      <Export
        {...COMPONENT_PROPS}
        isAuthenticated
        onPrivateDeviceDataUpload={onPrivateDeviceDataUpload}
      />
    );
    authenticated.setState({
      privateDeviceDataPassphrase: 'correct-horse-battery-staple',
      privateDeviceDataPassphraseConfirmation: 'correct-horse-battery-staple'
    });
    authenticated.find('#private-device-data-upload-button').simulate('click');
    expect(onPrivateDeviceDataUpload).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      'correct-horse-battery-staple'
    );
  });
});
