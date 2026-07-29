import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { injectIntl, intlShape } from 'react-intl';
import shortid from 'shortid';

import { addBoards, changeBoard, updateBoard } from '../../Board/Board.actions';
import { getVisibleBoards } from '../../Board/Board.selectors';
import { pushCommunicator } from '../../Communicator/Communicator.actions';
import { switchBoard } from '../../Board/Board.actions';
import { showNotification } from '../../Notifications/Notifications.actions';
import Import from './Import.component';
import API, {
  isPrivateDeviceDataReencryptionRequiredError,
  isPrivatePictureLibraryReencryptionRequiredError,
  isPrivatePictureLibraryUnavailableError
} from '../../../api';
import messages from './Import.messages';
import {
  createBoardImportReview,
  createPictureLibraryImportReview
} from './Import.review';

export class ImportContainer extends PureComponent {
  static propTypes = {
    boards: PropTypes.array.isRequired,
    history: PropTypes.object.isRequired,
    intl: intlShape.isRequired
  };

  async updateLoadBoardsIds(boards, shouldUpdate = false) {
    const updatedBoards = await Promise.all(
      boards.map(async board => {
        const boardsToBeLoaded = {};
        const tilesToBeReplaced = {};
        const tempBoards = this.props.boards
          .concat(boards)
          .filter(b => b.prevId);
        let updated = false;
        board.tiles.forEach((tile, i) => {
          if (tile.loadBoard) {
            const boardToBeLoaded = tempBoards.find(
              tb => tb.prevId && tb.prevId === tile.loadBoard
            );
            if (boardToBeLoaded) {
              tilesToBeReplaced[i] = tile;
              boardsToBeLoaded[boardToBeLoaded.prevId] = boardToBeLoaded.id;
            }
          }
        });

        const tilesIndexes = Object.keys(tilesToBeReplaced);
        tilesIndexes.forEach(i => {
          const tile = board.tiles[i];

          if (boardsToBeLoaded[tile.loadBoard]) {
            board.tiles[i].loadBoard = boardsToBeLoaded[tile.loadBoard];

            updated = true;
          }
        });

        let boardToBeUpdated = board;
        if (shouldUpdate && updated) {
          try {
            const { board: sanitized } = await API.uploadBoardLocalMedia(
              boardToBeUpdated
            );
            boardToBeUpdated = await API.updateBoard(sanitized);
          } catch (err) {
            console.error(err.message);
          }
        }

        return boardToBeUpdated;
      })
    );

    return updatedBoards;
  }

  async syncBoardsWithAPI(boards) {
    const { userData } = this.props;

    let boardsResponse = boards;
    if (userData.email) {
      const { email, name: author } = userData;

      boardsResponse = await Promise.all(
        boards.map(async board => {
          const boardToCreate = {
            ...board,
            email,
            author,
            isPublic: false,
            locale: this.props.intl.locale
          };
          //board validate
          if (typeof boardToCreate.id !== 'undefined') {
            delete boardToCreate.id;
          }
          if (typeof boardToCreate.name === 'undefined') {
            boardToCreate.name = 'unknow';
          }
          try {
            const { board: sanitized } = await API.uploadBoardLocalMedia(
              boardToCreate
            );
            const response = await API.createBoard(sanitized);
            if (board.id) {
              response.prevId = board.id;
            }
            return response;
          } catch (err) {
            console.error(err.message);
            const localBoard = this.prepareLocalBoard(boardToCreate);
            if (board.id) {
              localBoard.prevId = board.id;
            }
            return localBoard;
          }
        })
      );
    } else {
      boardsResponse = boardsResponse.map(board =>
        this.prepareLocalBoard(board)
      );
    }

    boardsResponse = await this.updateLoadBoardsIds(
      boardsResponse,
      userData.email
    );

    this.props.addBoards(boardsResponse);
    await this.addBoardsToCommunicator(boardsResponse);
    this.props.switchBoard(boardsResponse[0].id);
  }

  prepareLocalBoard(board) {
    const boardWithNewId = { ...board };
    if (boardWithNewId.id) {
      boardWithNewId.prevId = boardWithNewId.id;
    }
    boardWithNewId.id = shortid.generate();
    return boardWithNewId;
  }

  async addBoardsToCommunicator(boards) {
    const { currentCommunicator, pushCommunicator } = this.props;

    const communicatorBoards = new Set(
      currentCommunicator.boards.concat(boards.map(b => b.id))
    );
    const communicatorModified = {
      ...currentCommunicator,
      boards: Array.from(communicatorBoards)
    };

    try {
      await pushCommunicator(communicatorModified);
    } catch (err) {
      console.error('Error upserting communicator', err);
    }
  }

  async applyPictureLibraryImport(restored) {
    const existingById = new Map(
      this.props.boards.map(board => [board.id, board])
    );
    const updatedBoards = restored.boards.filter(board => {
      const existing = existingById.get(board.id);
      return existing && JSON.stringify(existing) !== JSON.stringify(board);
    });
    const addedBoards = restored.boards.filter(
      board => !existingById.has(board.id)
    );

    updatedBoards.forEach(board => this.props.updateBoard(board));
    if (addedBoards.length) {
      await this.syncBoardsWithAPI(addedBoards);
    }
    const pictureLibrary = await import('../Export/PictureLibraryArchive.helpers');
    pictureLibrary.persistPictureLibraryRestore(restored);
    return {
      ...restored.summary,
      changedBoardCount: updatedBoards.length + addedBoards.length
    };
  }

  async confirmImportReview(review) {
    const { showNotification, intl } = this.props;
    const importHelpers = await import('./Import.helpers');

    if (review.kind === 'picture-library') {
      if (review.imported.archive.scope === 'full') {
        await importHelpers.requestQuota(review.imported.boards);
      }
      const summary = await this.applyPictureLibraryImport(review.imported);
      showNotification(
        summary.deviceDataStats
          ? intl.formatMessage(messages.localDeviceDataSuccess, {
              boards: summary.boardCount,
              phrases: summary.deviceDataStats.savedPhraseCount,
              records: summary.deviceDataStats.expressionCount,
              corrections: summary.deviceDataStats.correctionCount,
              drafts: summary.deviceDataStats.draftCount
            })
          : intl.formatMessage(messages.pictureLibrarySuccess, {
              boards: summary.boardCount,
              pictures: summary.customPictureCount
            })
      );
      return;
    }

    if (!review.applicableBoards.length) {
      showNotification(intl.formatMessage(messages.emptyImport));
      return;
    }
    await importHelpers.requestQuota(review.applicableBoards);
    await this.syncBoardsWithAPI(review.applicableBoards);
    showNotification(
      intl.formatMessage(messages.success, {
        boards: review.applicableBoards.length
      })
    );
  }

  async handleConfirmImport(review, doneCallback) {
    let succeeded = false;
    try {
      await this.confirmImportReview(review);
      succeeded = true;
    } catch (error) {
      this.props.showNotification(
        this.props.intl.formatMessage(messages.errorImport)
      );
      console.error(error);
    } finally {
      if (doneCallback) doneCallback(succeeded);
    }
  }

  async handleImportClick(
    e,
    doneCallback,
    conflictStrategy = 'merge',
    onProgress,
    onReview
  ) {
    const { showNotification, intl, boards } = this.props;

    // Check for the various File API support.
    if (window.File && window.FileReader && window.FileList && window.Blob) {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const extensionMatch = file.name.match(/\.([^.]+)$/);
        const ext = extensionMatch ? extensionMatch[1] : '';
        const importConstants = await import('./Import.constants');

        const importCallback =
          importConstants.IMPORT_CONFIG_BY_EXTENSION[ext.toLowerCase()];
        if (importCallback) {
          try {
            const imported = await importCallback(
              file,
              this.props.intl,
              boards,
              {
                conflictStrategy,
                onProgress,
                includeConflicts: true,
                deferMediaUpload: true
              }
            );
            if (imported && imported.kind === 'picture-library') {
              const review = createPictureLibraryImportReview({
                restored: imported,
                existingBoards: boards,
                fileName: file.name,
                format: ext.toUpperCase()
              });
              if (review.canApply || review.items.length) {
                if (onReview) onReview(review);
              } else {
                showNotification(intl.formatMessage(messages.emptyImport));
              }
            } else {
              const review = createBoardImportReview({
                boards: imported,
                existingBoards: boards,
                fileName: file.name,
                format: ext.toUpperCase()
              });
              if (review.items.length || review.summary.skippedCount) {
                if (onReview) onReview(review);
              } else {
                showNotification(intl.formatMessage(messages.emptyImport));
              }
            }
          } catch (e) {
            showNotification(intl.formatMessage(messages.errorImport));
            console.error(e);
          }
        } else {
          showNotification(intl.formatMessage(messages.invalidImport));
          alert(
            'Please, select a valid file: json, zip, obz, obf, grd, gridset, sps, spb, ce'
          );
        }
      } else {
        showNotification(intl.formatMessage(messages.noImport));
        console.warn('There is no selected file.');
      }
    } else {
      console.warn('The File APIs are not fully supported in this browser.');
    }

    if (doneCallback) {
      doneCallback();
    }
    if (e.target) e.target.value = '';
  }

  async handlePrivateLibraryImport(
    doneCallback,
    conflictStrategy = 'merge',
    onProgress,
    onReview,
    passphrase
  ) {
    const { boards, intl, showNotification } = this.props;
    try {
      const encryptedArchive = await API.downloadPrivatePictureLibrary();
      const encryption = await import('../Export/PrivateArchiveEncryption.browser');
      const archive = await encryption.decryptPrivateArchiveBlob({
        archive: encryptedArchive,
        passphrase
      });
      const pictureLibrary = await import('../Export/PictureLibraryArchive.helpers');
      const restored = await pictureLibrary.readPictureLibraryArchive({
        file: archive,
        existingBoards: boards,
        conflictStrategy,
        onProgress
      });
      const review = createPictureLibraryImportReview({
        restored,
        existingBoards: boards,
        fileName: 'private-account-picture-library.zip',
        format: 'PRIVATE ZIP'
      });
      if (review.canApply || review.items.length) {
        if (onReview) onReview(review);
      } else {
        showNotification(intl.formatMessage(messages.emptyImport));
      }
    } catch (error) {
      console.error(error);
      let message = messages.privatePictureLibraryError;
      if (isPrivatePictureLibraryUnavailableError(error)) {
        message = messages.privatePictureLibraryUnavailable;
      } else if (isPrivatePictureLibraryReencryptionRequiredError(error)) {
        message = messages.privateDeviceDataReencryptionRequired;
      } else if (error && error.code === 'PRIVATE_ARCHIVE_DECRYPTION_FAILED') {
        message = messages.privateDeviceDataWrongPassphrase;
      } else if (
        error &&
        [
          'PRIVATE_ARCHIVE_INVALID_FORMAT',
          'PRIVATE_ARCHIVE_UNSUPPORTED_VERSION',
          'PRIVATE_ARCHIVE_UNSUPPORTED_KDF'
        ].includes(error.code)
      ) {
        message = messages.privateDeviceDataUnsupportedBackup;
      }
      showNotification(intl.formatMessage(message));
    } finally {
      if (doneCallback) doneCallback();
    }
  }

  async handlePrivateLibraryDelete(doneCallback) {
    const { intl, showNotification } = this.props;
    try {
      await API.deletePrivatePictureLibrary();
      showNotification(
        intl.formatMessage(messages.privatePictureLibraryDeleted)
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
      if (doneCallback) doneCallback();
    }
  }

  async handlePrivateDeviceDataImport(
    doneCallback,
    conflictStrategy = 'merge',
    onProgress,
    onReview,
    passphrase
  ) {
    const { boards, intl, showNotification } = this.props;
    try {
      const encryptedArchive = await API.downloadPrivateDeviceData();
      const encryption = await import('../Export/PrivateArchiveEncryption.browser');
      const archive = await encryption.decryptPrivateArchiveBlob({
        archive: encryptedArchive,
        passphrase
      });
      const pictureLibrary = await import('../Export/PictureLibraryArchive.helpers');
      const restored = await pictureLibrary.readPictureLibraryArchive({
        file: archive,
        existingBoards: boards,
        conflictStrategy,
        onProgress
      });
      const review = createPictureLibraryImportReview({
        restored,
        existingBoards: boards,
        fileName: 'private-account-complete-data.zip',
        format: 'PRIVATE DEVICE DATA ZIP'
      });
      if (review.canApply || review.items.length) {
        if (onReview) onReview(review);
      } else {
        showNotification(intl.formatMessage(messages.emptyImport));
      }
    } catch (error) {
      console.error(error);
      let message = messages.privateDeviceDataError;
      if (isPrivatePictureLibraryUnavailableError(error)) {
        message = messages.privatePictureLibraryUnavailable;
      } else if (isPrivateDeviceDataReencryptionRequiredError(error)) {
        message = messages.privateDeviceDataReencryptionRequired;
      } else if (error && error.code === 'PRIVATE_ARCHIVE_DECRYPTION_FAILED') {
        message = messages.privateDeviceDataWrongPassphrase;
      } else if (
        error &&
        [
          'PRIVATE_ARCHIVE_INVALID_FORMAT',
          'PRIVATE_ARCHIVE_UNSUPPORTED_VERSION',
          'PRIVATE_ARCHIVE_UNSUPPORTED_KDF'
        ].includes(error.code)
      ) {
        message = messages.privateDeviceDataUnsupportedBackup;
      }
      showNotification(intl.formatMessage(message));
    } finally {
      if (doneCallback) doneCallback();
    }
  }

  async handlePrivateDeviceDataDelete(doneCallback) {
    const { intl, showNotification } = this.props;
    try {
      await API.deletePrivateDeviceData();
      showNotification(intl.formatMessage(messages.privateDeviceDataDeleted));
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
      if (doneCallback) doneCallback();
    }
  }

  render() {
    const { boards, history, userData } = this.props;

    return (
      <Import
        boards={boards}
        onImportClick={this.handleImportClick.bind(this)}
        onConfirmImport={this.handleConfirmImport.bind(this)}
        onPrivateLibraryImport={this.handlePrivateLibraryImport.bind(this)}
        onPrivateLibraryDelete={this.handlePrivateLibraryDelete.bind(this)}
        onPrivateDeviceDataImport={this.handlePrivateDeviceDataImport.bind(
          this
        )}
        onPrivateDeviceDataDelete={this.handlePrivateDeviceDataDelete.bind(
          this
        )}
        privateLibraryDeletePrompt={this.props.intl.formatMessage(
          messages.privatePictureLibraryDeletePrompt
        )}
        privateDeviceDataDeletePrompt={this.props.intl.formatMessage(
          messages.privateDeviceDataDeletePrompt
        )}
        isAuthenticated={Boolean(userData && userData.email)}
        onClose={history.goBack}
      />
    );
  }
}

export const mapStateToProps = ({ board, communicator, app }) => {
  const activeCommunicatorId = communicator.activeCommunicatorId;
  const currentCommunicator = communicator.communicators.find(
    communicator => communicator.id === activeCommunicatorId
  );

  const { userData } = app;

  return {
    boards: getVisibleBoards({ board }),
    currentCommunicator,
    communicators: communicator.communicators,
    userData
  };
};

const mapDispatchToProps = {
  addBoards,
  changeBoard,
  updateBoard,
  switchBoard,
  showNotification,
  pushCommunicator
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(ImportContainer));
