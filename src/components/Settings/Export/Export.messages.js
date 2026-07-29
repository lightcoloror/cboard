import { defineMessages } from 'react-intl';

export default defineMessages({
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
  boardDownloadedCvaIOS: {
    id: 'cboard.components.Settings.Export.boardDownloadedCvaIOS',
    defaultMessage:
      'Your board was downloaded. Find your file under "On My device" folder'
  },
  boards: {
    id: 'cboard.components.Settings.Export.boards',
    defaultMessage: 'Boards'
  },
  boardDownloadError: {
    id: 'cboard.components.Settings.Export.boardDownloadedError',
    defaultMessage: 'Oops..Something went wrong. Please try again'
  },
  downloadNoConnectionError: {
    id: 'cboard.components.Settings.Export.downloadNoConnectionError',
    defaultMessage: 'Need internet connection to download the PDF.'
  },
  pdfSettings: {
    id: 'cboard.components.Settings.Export.pdfSettings',
    defaultMessage: 'PDF Settings'
  },
  fontSize: {
    id: 'cboard.components.Settings.Export.fontSize',
    defaultMessage: 'Font size'
  },
  fontSizeSecondary: {
    id: 'cboard.components.Settings.Export.fontSizeSecondary',
    defaultMessage:
      'Select the desired font size. This option is useful if you have problems with the dimensions of the exported board.'
  },
  small: {
    id: 'cboard.components.Settings.Export.small',
    defaultMessage: 'Small'
  },
  medium: {
    id: 'cboard.components.Settings.Export.medium',
    defaultMessage: 'Medium'
  },
  large: {
    id: 'cboard.components.Settings.Export.large',
    defaultMessage: 'Large'
  },
  structuredPictogramLibrary: {
    id: 'cboard.components.Settings.Export.structuredPictogramLibrary',
    defaultMessage: 'Structured AAC JSON'
  },
  pictureLibrary: {
    id: 'cboard.components.Settings.Export.pictureLibrary',
    defaultMessage: 'Picture library backup'
  },
  pictureLibrarySecondary: {
    id: 'cboard.components.Settings.Export.pictureLibrarySecondary',
    defaultMessage:
      'Create a restorable ZIP with picture metadata and every referenced image. Device-private identity is not included.'
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
    id: 'cboard.components.Settings.Export.privatePictureLibrary',
    defaultMessage: 'Private account picture backup'
  },
  privatePictureLibrarySecondary: {
    id: 'cboard.components.Settings.Export.privatePictureLibrarySecondary',
    defaultMessage:
      'Encrypt custom pictures on this device before explicitly replacing the private backup for this account. The server stores ciphertext only and never receives the recovery password.'
  },
  uploadPrivatePictureLibrary: {
    id: 'cboard.components.Settings.Export.uploadPrivatePictureLibrary',
    defaultMessage: 'Back up private pictures'
  },
  privatePictureLibraryUploaded: {
    id: 'cboard.components.Settings.Export.privatePictureLibraryUploaded',
    defaultMessage:
      'The end-to-end encrypted private account picture backup was replaced.'
  },
  privatePictureLibraryError: {
    id: 'cboard.components.Settings.Export.privatePictureLibraryError',
    defaultMessage: 'The private account picture backup could not be stored.'
  },
  privatePictureLibraryUnavailable: {
    id: 'cboard.components.Settings.privatePictureLibraryUnavailable',
    defaultMessage:
      'This server has not configured private account picture storage. Local ZIP backup is still available.'
  },
  privateDeviceData: {
    id: 'cboard.components.Settings.Export.privateDeviceData',
    defaultMessage: 'Private account complete data backup'
  },
  privateDeviceDataSecondary: {
    id: 'cboard.components.Settings.Export.privateDeviceDataSecondary',
    defaultMessage:
      'Encrypt a separate complete snapshot on this device before upload. The server stores ciphertext only and cannot read the password, custom pictures, saved phrases, communication history, confirmed receives, caregiver corrections, or feedback drafts.'
  },
  privateDeviceDataPassphrase: {
    id: 'cboard.components.Settings.Export.privateDeviceDataPassphrase',
    defaultMessage: 'Recovery password'
  },
  privateDeviceDataPassphraseConfirmation: {
    id:
      'cboard.components.Settings.Export.privateDeviceDataPassphraseConfirmation',
    defaultMessage: 'Confirm recovery password'
  },
  privateDeviceDataPassphraseHelp: {
    id: 'cboard.components.Settings.Export.privateDeviceDataPassphraseHelp',
    defaultMessage:
      'Use at least 12 characters. This password is never uploaded or saved and cannot be recovered.'
  },
  privateDeviceDataPassphraseTooShort: {
    id: 'cboard.components.Settings.Export.privateDeviceDataPassphraseTooShort',
    defaultMessage: 'Enter at least 12 characters.'
  },
  privateDeviceDataPassphraseTooLong: {
    id: 'cboard.components.Settings.Export.privateDeviceDataPassphraseTooLong',
    defaultMessage: 'Use no more than 256 characters.'
  },
  privateDeviceDataPassphraseMismatch: {
    id: 'cboard.components.Settings.Export.privateDeviceDataPassphraseMismatch',
    defaultMessage: 'The two recovery passwords do not match.'
  },
  uploadPrivateDeviceData: {
    id: 'cboard.components.Settings.Export.uploadPrivateDeviceData',
    defaultMessage: 'Back up complete data'
  },
  privateDeviceDataUploaded: {
    id: 'cboard.components.Settings.Export.privateDeviceDataUploaded',
    defaultMessage:
      'The end-to-end encrypted complete data backup was replaced.'
  },
  privateDeviceDataError: {
    id: 'cboard.components.Settings.Export.privateDeviceDataError',
    defaultMessage:
      'The private account complete data backup could not be stored.'
  }
});
