import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { injectIntl, intlShape } from 'react-intl';

import { showNotification } from '../../Notifications/Notifications.actions';
import { getVisibleBoards } from '../../Board/Board.selectors';
import Export from './Export.component';
import { EXPORT_CONFIG_BY_TYPE } from './Export.constants';
import messages from './Export.messages';
import { isAndroid, isIOS } from '../../../cordova-util';
import API, { isPrivatePictureLibraryUnavailableError } from '../../../api';

export class ExportContainer extends PureComponent {
  static propTypes = {
    boards: PropTypes.array.isRequired,
    history: PropTypes.object.isRequired,
    intl: intlShape.isRequired
  };

  handleExportClick = async (
    type = 'cboard',
    singleBoard = '',
    labelFontSize = '',
    doneCallback,
    onProgress
  ) => {
    const { boards, intl, activeBoardId, showNotification } = this.props;
    try {
      if (type === 'pictureLibrary') {
        const pictureLibrary = await import('./PictureLibraryArchive.helpers');
        await pictureLibrary.pictureLibraryExportAdapter({
          boards,
          scope: singleBoard,
          onProgress
        });
      } else if (type === 'structured') {
        const structuredLibrary = await import('./StructuredPictogramLibrary.helpers');
        await structuredLibrary.structuredPictogramLibraryExportAdapter({
          boards,
          rootBoard: singleBoard || null,
          intl
        });
      } else {
        const exportConfig = EXPORT_CONFIG_BY_TYPE[type];
        const EXPORT_HELPERS = await import('./Export.helpers');
        if (
          !exportConfig ||
          !exportConfig.callback ||
          !EXPORT_HELPERS[exportConfig.callback]
        ) {
          return false;
        }

        if (type === 'openboard' && singleBoard) {
          await EXPORT_HELPERS.openboardExportAdapter(singleBoard, intl);
        } else if (type === 'cboard') {
          await EXPORT_HELPERS.cboardExportAdapter(boards, singleBoard);
        } else if (type === 'picsee_pdf') {
          if (singleBoard) {
            await EXPORT_HELPERS[exportConfig.callback](
              [singleBoard],
              labelFontSize,
              intl,
              true
            );
          } else {
            const currentBoard = boards.filter(
              board => board.id === activeBoardId
            );
            await EXPORT_HELPERS[exportConfig.callback](
              currentBoard,
              labelFontSize,
              intl,
              true
            );
          }
        } else if (type !== 'pdf' && !singleBoard) {
          await EXPORT_HELPERS[exportConfig.callback](
            boards,
            labelFontSize,
            intl
          );
        } else {
          if (singleBoard) {
            await EXPORT_HELPERS[exportConfig.callback](
              [singleBoard],
              labelFontSize,
              intl
            );
          } else {
            const currentBoard = boards.filter(
              board => board.id === activeBoardId
            );
            await EXPORT_HELPERS[exportConfig.callback](
              currentBoard,
              labelFontSize,
              intl
            );
          }
        }
      }
      const showBoardDowloadedNotification = () => {
        if (isAndroid())
          return showNotification(
            intl.formatMessage(messages.boardDownloadedCva)
          );
        if (isIOS())
          return showNotification(
            intl.formatMessage(messages.boardDownloadedCvaIOS)
          );
        return showNotification(intl.formatMessage(messages.boardDownloaded));
      };

      showBoardDowloadedNotification();
    } catch (e) {
      console.error(e);
      const message = e.reason?.message?.startsWith('Failed to fetch')
        ? messages.downloadNoConnectionError
        : messages.boardDownloadError;
      showNotification(intl.formatMessage(message));
    } finally {
      if (typeof doneCallback === 'function') {
        doneCallback();
      }
    }
  };

  handlePrivateLibraryUpload = async (doneCallback, onProgress, passphrase) => {
    const { boards, intl, showNotification } = this.props;
    try {
      const pictureLibrary = await import('./PictureLibraryArchive.helpers');
      const { content } = await pictureLibrary.buildPictureLibraryArchive({
        boards,
        scope: 'custom',
        onProgress
      });
      const encryption = await import('./PrivateArchiveEncryption.browser');
      const encryptedArchive = await encryption.encryptPrivateArchiveBlob({
        archive: content,
        passphrase
      });
      await API.uploadPrivatePictureLibrary(encryptedArchive);
      showNotification(
        intl.formatMessage(messages.privatePictureLibraryUploaded)
      );
    } catch (error) {
      console.error(error);
      showNotification(
        intl.formatMessage(
          isPrivatePictureLibraryUnavailableError(error)
            ? messages.privatePictureLibraryUnavailable
            : messages.privatePictureLibraryError
        )
      );
    } finally {
      if (typeof doneCallback === 'function') doneCallback();
    }
  };

  handlePrivateDeviceDataUpload = async (
    doneCallback,
    onProgress,
    passphrase
  ) => {
    const { intl, showNotification } = this.props;
    try {
      const pictureLibrary = await import('./PictureLibraryArchive.helpers');
      const { content } = await pictureLibrary.buildPrivateDeviceDataArchive({
        onProgress
      });
      const encryption = await import('./PrivateArchiveEncryption.browser');
      const encryptedArchive = await encryption.encryptPrivateArchiveBlob({
        archive: content,
        passphrase
      });
      await API.uploadPrivateDeviceData(encryptedArchive);
      showNotification(intl.formatMessage(messages.privateDeviceDataUploaded));
    } catch (error) {
      console.error(error);
      showNotification(
        intl.formatMessage(
          isPrivatePictureLibraryUnavailableError(error)
            ? messages.privatePictureLibraryUnavailable
            : messages.privateDeviceDataError
        )
      );
    } finally {
      if (typeof doneCallback === 'function') doneCallback();
    }
  };

  render() {
    const { boards, intl, history, userData } = this.props;

    return (
      <Export
        intl={intl}
        boards={boards}
        onExportClick={this.handleExportClick}
        onPrivateLibraryUpload={this.handlePrivateLibraryUpload}
        onPrivateDeviceDataUpload={this.handlePrivateDeviceDataUpload}
        isAuthenticated={Boolean(userData && userData.email)}
        onClose={history.goBack}
      />
    );
  }
}

export const mapStateToProps = state => ({
  boards: getVisibleBoards(state),
  activeBoardId: state.board.activeBoardId,
  userData: state.app.userData
});

const mapDispatchToProps = {
  showNotification
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(ExportContainer));
