import React from 'react';
import { shallowMatchSnapshot } from '../../../common/test_utils';
import toJson from 'enzyme-to-json';
import { shallow } from 'enzyme';

import Import from './Import.component';

jest.mock('./Import.messages', () => {
  return {
    import: {
      id: 'cboard.components.Settings.Import.import',
      defaultMessage: 'Import'
    },
    restore: {
      id: 'cboard.components.Settings.Import.restore',
      defaultMessage: 'Restore'
    },
    exportSecondary: {
      id: 'cboard.components.Settings.Import.importSecondary',
      defaultMessage: 'Backup your boards'
    },
    conflictStrategy: {
      id: 'cboard.components.Settings.Import.conflictStrategy',
      defaultMessage: 'Duplicate IDs'
    },
    conflictMerge: {
      id: 'cboard.components.Settings.Import.conflictMerge',
      defaultMessage: 'Use archive version'
    },
    conflictSkip: {
      id: 'cboard.components.Settings.Import.conflictSkip',
      defaultMessage: 'Keep local version'
    },
    reviewTitle: {
      id: 'cboard.components.Settings.Import.reviewTitle',
      defaultMessage: 'Review before import'
    },
    reviewSummary: {
      id: 'cboard.components.Settings.Import.reviewSummary',
      defaultMessage: 'Review summary'
    },
    reviewCustomPictures: {
      id: 'cboard.components.Settings.Import.reviewCustomPictures',
      defaultMessage: 'Custom pictures'
    },
    reviewConflicts: {
      id: 'cboard.components.Settings.Import.reviewConflicts',
      defaultMessage: 'Conflicts'
    },
    reviewSkipped: {
      id: 'cboard.components.Settings.Import.reviewSkipped',
      defaultMessage: 'Skipped'
    },
    reviewBoard: {
      id: 'cboard.components.Settings.Import.reviewBoard',
      defaultMessage: 'Board'
    },
    reviewMore: {
      id: 'cboard.components.Settings.Import.reviewMore',
      defaultMessage: 'More'
    },
    cancelReview: {
      id: 'cboard.components.Settings.Import.cancelReview',
      defaultMessage: 'Cancel'
    },
    confirmReview: {
      id: 'cboard.components.Settings.Import.confirmReview',
      defaultMessage: 'Confirm import'
    },
    privatePictureLibrary: {
      id: 'privatePictureLibrary',
      defaultMessage: 'Private account picture backup'
    },
    privatePictureLibrarySecondary: {
      id: 'privatePictureLibrarySecondary',
      defaultMessage: 'Review before restoring'
    },
    restorePrivatePictureLibrary: {
      id: 'restorePrivatePictureLibrary',
      defaultMessage: 'Review cloud backup'
    },
    deletePrivatePictureLibrary: {
      id: 'deletePrivatePictureLibrary',
      defaultMessage: 'Delete cloud backup'
    },
    privateDeviceData: {
      id: 'privateDeviceData',
      defaultMessage: 'Private account complete data backup'
    },
    privateDeviceDataSecondary: {
      id: 'privateDeviceDataSecondary',
      defaultMessage: 'Review complete data before restoring'
    },
    privateDeviceDataPassphrase: {
      id: 'privateDeviceDataPassphrase',
      defaultMessage: 'Recovery password'
    },
    privateDeviceDataPassphraseHelp: {
      id: 'privateDeviceDataPassphraseHelp',
      defaultMessage: 'Enter the backup password'
    },
    privateDeviceDataPassphraseTooShort: {
      id: 'privateDeviceDataPassphraseTooShort',
      defaultMessage: 'Too short'
    },
    privateDeviceDataPassphraseTooLong: {
      id: 'privateDeviceDataPassphraseTooLong',
      defaultMessage: 'Too long'
    },
    restorePrivateDeviceData: {
      id: 'restorePrivateDeviceData',
      defaultMessage: 'Review complete cloud backup'
    },
    deletePrivateDeviceData: {
      id: 'deletePrivateDeviceData',
      defaultMessage: 'Delete complete cloud backup'
    }
  };
});

const COMPONENT_PROPS = {
  onImportClick: () => {},
  onConfirmImport: () => {},
  onPrivateLibraryImport: () => {},
  onPrivateLibraryDelete: () => {},
  privateLibraryDeletePrompt: 'Delete private backup?',
  onPrivateDeviceDataImport: () => {},
  onPrivateDeviceDataDelete: () => {},
  privateDeviceDataDeletePrompt: 'Delete complete private backup?',
  isAuthenticated: false,
  onClose: () => {}
};

describe('Import tests', () => {
  test('default renderer', () => {
    shallowMatchSnapshot(<Import {...COMPONENT_PROPS} />);
  });

  test('loading behavior', () => {
    const wrapper = shallow(<Import {...COMPONENT_PROPS} />);
    let tree = toJson(wrapper);
    expect(tree).toMatchSnapshot();

    wrapper.instance().onImportClick = jest.fn(type => {
      wrapper.setState({ loading: true });
    });

    let spinnerWrapper = wrapper.find('.Import__ButtonContainer--spinner');
    expect(spinnerWrapper.length).toBe(0);

    const importButton = wrapper.find('#import-button input');
    importButton.simulate('change', { currentTarget: 'someElement' });

    spinnerWrapper = wrapper.find('.Import__ButtonContainer--spinner');
    expect(spinnerWrapper.length).toBe(1);

    expect(wrapper.find('#import-button').get(0).props.disabled).toBe(true);

    tree = toJson(wrapper);
    expect(tree).toMatchSnapshot();
  });
  test('check click ', () => {
    const event = {
      persist: jest.fn()
    };
    const onImportClick = jest.fn();
    const wrapper = shallow(
      <Import {...COMPONENT_PROPS} onImportClick={onImportClick} />
    );
    const cboard = wrapper.find('#file');
    cboard.prop('onChange')(event);
    expect(onImportClick).toHaveBeenCalledWith(
      event,
      expect.any(Function),
      'merge',
      expect.any(Function),
      expect.any(Function)
    );
  });

  test('requires review confirmation before applying an import', () => {
    const pendingImport = {
      kind: 'boards',
      fileName: 'library.obz',
      format: 'OBZ',
      items: [
        {
          key: 'daily',
          name: 'Daily needs',
          tileCount: 2,
          conflict: false
        }
      ],
      summary: {
        boardCount: 1,
        tileCount: 2,
        conflictCount: 0,
        skippedCount: 0,
        customPictureCount: 0
      },
      canApply: true,
      applicableBoards: [{ id: 'daily' }]
    };
    const onImportClick = jest.fn(
      (event, done, strategy, onProgress, onReview) => {
        onReview(pendingImport);
        done();
      }
    );
    const onConfirmImport = jest.fn((review, done) => done(true));
    const wrapper = shallow(
      <Import
        {...COMPONENT_PROPS}
        onImportClick={onImportClick}
        onConfirmImport={onConfirmImport}
      />
    );

    wrapper.find('#file').prop('onChange')({ persist: jest.fn() });
    wrapper.update();

    expect(wrapper.find('.Import__Review')).toHaveLength(1);
    expect(onConfirmImport).not.toHaveBeenCalled();

    wrapper.find('#confirm-import-button').simulate('click');
    wrapper.update();

    expect(onConfirmImport).toHaveBeenCalledWith(
      pendingImport,
      expect.any(Function)
    );
    expect(wrapper.find('.Import__Review')).toHaveLength(0);
  });

  test('keeps cloud restore disabled for guests and routes through review', () => {
    const onPrivateLibraryImport = jest.fn(
      (done, strategy, onProgress, onReview) => {
        onReview({
          kind: 'picture-library',
          items: [],
          summary: {
            boardCount: 0,
            importableBoardCount: 0,
            tileCount: 0,
            conflictCount: 0,
            skippedCount: 0,
            customPictureCount: 1
          },
          canApply: true
        });
        done();
      }
    );
    const guest = shallow(<Import {...COMPONENT_PROPS} />);
    expect(
      guest.find('#private-picture-library-download-button').prop('disabled')
    ).toBe(true);

    const authenticated = shallow(
      <Import
        {...COMPONENT_PROPS}
        isAuthenticated
        onPrivateLibraryImport={onPrivateLibraryImport}
      />
    );
    expect(
      authenticated
        .find('#private-picture-library-download-button')
        .prop('disabled')
    ).toBe(true);
    authenticated.setState({
      privateLibraryPassphrase: 'correct-horse-battery-staple'
    });
    authenticated
      .find('#private-picture-library-download-button')
      .simulate('click');
    authenticated.update();

    expect(onPrivateLibraryImport).toHaveBeenCalledWith(
      expect.any(Function),
      'merge',
      expect.any(Function),
      expect.any(Function),
      'correct-horse-battery-staple'
    );
    expect(authenticated.find('.Import__Review')).toHaveLength(1);
  });

  test('keeps complete device-data restore separate and login-gated', () => {
    const onPrivateDeviceDataImport = jest.fn(
      (done, strategy, onProgress, onReview) => {
        onReview({
          kind: 'picture-library',
          items: [],
          summary: {
            boardCount: 0,
            importableBoardCount: 0,
            tileCount: 0,
            conflictCount: 0,
            skippedCount: 0,
            customPictureCount: 0,
            localDeviceData: true
          },
          canApply: true
        });
        done();
      }
    );
    const guest = shallow(<Import {...COMPONENT_PROPS} />);
    expect(
      guest.find('#private-device-data-download-button').prop('disabled')
    ).toBe(true);

    const authenticated = shallow(
      <Import
        {...COMPONENT_PROPS}
        isAuthenticated
        onPrivateDeviceDataImport={onPrivateDeviceDataImport}
      />
    );
    authenticated.setState({
      privateDeviceDataPassphrase: 'correct-horse-battery-staple'
    });
    authenticated
      .find('#private-device-data-download-button')
      .simulate('click');
    authenticated.update();

    expect(onPrivateDeviceDataImport).toHaveBeenCalledWith(
      expect.any(Function),
      'merge',
      expect.any(Function),
      expect.any(Function),
      'correct-horse-battery-staple'
    );
    expect(authenticated.find('.Import__Review')).toHaveLength(1);
  });
});
