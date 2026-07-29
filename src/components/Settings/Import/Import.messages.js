import { defineMessages } from 'react-intl';

export default defineMessages({
  import: {
    id: 'cboard.components.Settings.Import.import',
    defaultMessage: 'Import'
  },
  importSecondary: {
    id: 'cboard.components.Settings.Import.importSecondary',
    defaultMessage:
      'This option will import JUST the new boards detected. It WILL NOT import the default boards included on Cboard. Supported formats are {cboardLink}, {link}, AsTeRICS Grid (.grd), unencrypted Gridset (.gridset), Snap (.sps/.spb), and TouchChat (.ce). Snap and TouchChat conversion requires login and a configured CBoard API.'
  },
  success: {
    id: 'cboard.components.Settings.Import.success',
    defaultMessage: 'Success!! {boards} boards were imported successfully.'
  },
  emptyImport: {
    id: 'cboard.components.Settings.Import.emptyImport',
    defaultMessage: 'WARNING: There is nothing to import from the current file.'
  },
  errorImport: {
    id: 'cboard.components.Settings.Import.errorImport',
    defaultMessage:
      'WARNING: There was an error trying to import from the current file.'
  },
  invalidImport: {
    id: 'cboard.components.Settings.Import.invalidImport',
    defaultMessage:
      'Please, select a valid file: json, zip, obz, obf, grd, gridset, sps, spb, ce'
  },
  noImport: {
    id: 'cboard.components.Settings.Import.noImport',
    defaultMessage: 'WARNING: There is no selected file.'
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
  pictureLibrarySuccess: {
    id: 'cboard.components.Settings.Import.pictureLibrarySuccess',
    defaultMessage:
      'Picture library restored: {boards} boards and {pictures} custom pictures processed.'
  },
  localDeviceDataSuccess: {
    id: 'cboard.components.Settings.Import.localDeviceDataSuccess',
    defaultMessage:
      'Complete local data restored: {boards} boards, {phrases} saved phrases, {records} communication records, {corrections} corrections, and {drafts} feedback drafts.'
  },
  reviewTitle: {
    id: 'cboard.components.Settings.Import.reviewTitle',
    defaultMessage: 'Review before import'
  },
  reviewSummary: {
    id: 'cboard.components.Settings.Import.reviewSummary',
    defaultMessage:
      '{boards} boards and {pictures} pictures were found. {importable} boards are ready to import; {conflicts} duplicate board IDs need attention.'
  },
  reviewCustomPictures: {
    id: 'cboard.components.Settings.Import.reviewCustomPictures',
    defaultMessage: '{pictures} personal pictures will also be restored.'
  },
  reviewLocalDeviceData: {
    id: 'cboard.components.Settings.Import.reviewLocalDeviceData',
    defaultMessage:
      'Complete local data: {phrases} saved phrases, {records} communication records, {corrections} corrections, and {drafts} feedback drafts will be restored.'
  },
  reviewStructuredLibrary: {
    id: 'cboard.components.Settings.Import.reviewStructuredLibrary',
    defaultMessage:
      'Structured AAC data: {concepts} concepts and {pictures} picture assets; {attributed} have verified source/license metadata, {unattributed} still need attribution, and {linked} concepts are linked to pictures.'
  },
  reviewConflicts: {
    id: 'cboard.components.Settings.Import.reviewConflicts',
    defaultMessage:
      'Duplicate boards are not silently added. Standard CBoard/OpenBoard imports keep the local board; picture-library archives use the selected duplicate-ID strategy.'
  },
  reviewSkipped: {
    id: 'cboard.components.Settings.Import.reviewSkipped',
    defaultMessage:
      '{count} malformed or unsupported board entries will be skipped.'
  },
  reviewBoard: {
    id: 'cboard.components.Settings.Import.reviewBoard',
    defaultMessage: '{pictures} pictures{conflict}'
  },
  reviewMore: {
    id: 'cboard.components.Settings.Import.reviewMore',
    defaultMessage: 'And {count} more boards.'
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
    id: 'cboard.components.Settings.Import.privatePictureLibrary',
    defaultMessage: 'Private account picture backup'
  },
  privatePictureLibrarySecondary: {
    id: 'cboard.components.Settings.Import.privatePictureLibrarySecondary',
    defaultMessage:
      'Download the encrypted picture snapshot, decrypt and review it only on this device, then explicitly confirm before restoring. The password is never uploaded or saved.'
  },
  restorePrivatePictureLibrary: {
    id: 'cboard.components.Settings.Import.restorePrivatePictureLibrary',
    defaultMessage: 'Review cloud backup'
  },
  deletePrivatePictureLibrary: {
    id: 'cboard.components.Settings.Import.deletePrivatePictureLibrary',
    defaultMessage: 'Delete cloud backup'
  },
  privatePictureLibraryDeletePrompt: {
    id: 'cboard.components.Settings.Import.privatePictureLibraryDeletePrompt',
    defaultMessage: 'Delete the private picture backup from this account?'
  },
  privatePictureLibraryDeleted: {
    id: 'cboard.components.Settings.Import.privatePictureLibraryDeleted',
    defaultMessage: 'The private account picture backup was deleted.'
  },
  privatePictureLibraryError: {
    id: 'cboard.components.Settings.Import.privatePictureLibraryError',
    defaultMessage: 'The private account picture backup is unavailable.'
  },
  privatePictureLibraryUnavailable: {
    id: 'cboard.components.Settings.privatePictureLibraryUnavailable',
    defaultMessage:
      'This server has not configured private account picture storage. Local ZIP backup is still available.'
  },
  privateDeviceData: {
    id: 'cboard.components.Settings.Import.privateDeviceData',
    defaultMessage: 'Private account complete data backup'
  },
  privateDeviceDataSecondary: {
    id: 'cboard.components.Settings.Import.privateDeviceDataSecondary',
    defaultMessage:
      'Download the encrypted snapshot, decrypt it only on this device, review every count locally, and explicitly confirm before restoring. The password is never uploaded or saved.'
  },
  privateDeviceDataPassphrase: {
    id: 'cboard.components.Settings.Import.privateDeviceDataPassphrase',
    defaultMessage: 'Recovery password'
  },
  privateDeviceDataPassphraseHelp: {
    id: 'cboard.components.Settings.Import.privateDeviceDataPassphraseHelp',
    defaultMessage:
      'Enter the password used when this encrypted backup was uploaded.'
  },
  privateDeviceDataPassphraseTooShort: {
    id: 'cboard.components.Settings.Import.privateDeviceDataPassphraseTooShort',
    defaultMessage: 'Enter at least 12 characters.'
  },
  privateDeviceDataPassphraseTooLong: {
    id: 'cboard.components.Settings.Import.privateDeviceDataPassphraseTooLong',
    defaultMessage: 'Use no more than 256 characters.'
  },
  restorePrivateDeviceData: {
    id: 'cboard.components.Settings.Import.restorePrivateDeviceData',
    defaultMessage: 'Review complete cloud backup'
  },
  deletePrivateDeviceData: {
    id: 'cboard.components.Settings.Import.deletePrivateDeviceData',
    defaultMessage: 'Delete complete cloud backup'
  },
  privateDeviceDataDeletePrompt: {
    id: 'cboard.components.Settings.Import.privateDeviceDataDeletePrompt',
    defaultMessage:
      'Delete the private complete data backup from this account? The separate private picture backup will remain.'
  },
  privateDeviceDataDeleted: {
    id: 'cboard.components.Settings.Import.privateDeviceDataDeleted',
    defaultMessage: 'The private account complete data backup was deleted.'
  },
  privateDeviceDataError: {
    id: 'cboard.components.Settings.Import.privateDeviceDataError',
    defaultMessage: 'The private account complete data backup is unavailable.'
  },
  privateDeviceDataWrongPassphrase: {
    id: 'cboard.components.Settings.Import.privateDeviceDataWrongPassphrase',
    defaultMessage:
      'The recovery password is incorrect, or the encrypted backup was changed.'
  },
  privateDeviceDataUnsupportedBackup: {
    id: 'cboard.components.Settings.Import.privateDeviceDataUnsupportedBackup',
    defaultMessage: 'This encrypted backup format is not supported.'
  },
  privateDeviceDataReencryptionRequired: {
    id:
      'cboard.components.Settings.Import.privateDeviceDataReencryptionRequired',
    defaultMessage:
      'This is a legacy plaintext backup. Re-upload it from the original device with a recovery password before restoring it here.'
  }
});
