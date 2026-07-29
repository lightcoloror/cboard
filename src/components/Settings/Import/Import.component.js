import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage } from 'react-intl';
import Link from '@material-ui/core/Link';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Paper from '@material-ui/core/Paper';
import List from '@material-ui/core/List';
import CircularProgress from '@material-ui/core/CircularProgress';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import DeleteIcon from '@material-ui/icons/Delete';
import FullScreenDialog from '../../UI/FullScreenDialog';
import messages from './Import.messages';

import './Import.css';
import { requestCvaPermissions, isCordova } from '../../../cordova-util';
import { validatePrivateArchivePassphrase } from '../../../common/communicationSupport/privateArchivePassphrase';

const propTypes = {
  /**
   * Callback fired when clicking the import Cboard button
   */
  onImportClick: PropTypes.func.isRequired,
  onConfirmImport: PropTypes.func.isRequired,
  onPrivateLibraryImport: PropTypes.func.isRequired,
  onPrivateLibraryDelete: PropTypes.func.isRequired,
  privateLibraryDeletePrompt: PropTypes.string.isRequired,
  onPrivateDeviceDataImport: PropTypes.func.isRequired,
  onPrivateDeviceDataDelete: PropTypes.func.isRequired,
  privateDeviceDataDeletePrompt: PropTypes.string.isRequired,
  isAuthenticated: PropTypes.bool.isRequired,
  /**
   * Callback fired when clicking the back button
   */
  onClose: PropTypes.func
};

class Import extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: false,
      loadingPrivateLibrary: false,
      loadingPrivateDeviceData: false,
      conflictStrategy: 'merge',
      pictureLibraryProgress: null,
      privateLibraryPassphrase: '',
      privateDeviceDataPassphrase: '',
      pendingImport: null
    };
  }

  handleConflictStrategyChange = event => {
    this.setState({ conflictStrategy: event.target.value });
  };

  onImportClick(event) {
    const doneCallback = () => {
      this.setState({ loading: false });
    };
    const onProgress = pictureLibraryProgress => {
      this.setState({ pictureLibraryProgress });
    };
    const onReview = pendingImport => {
      this.setState({ pendingImport });
    };

    // https://reactjs.org/docs/events.html#event-pooling
    event.persist();

    this.setState(
      {
        loading: true,
        exportMenu: null,
        pictureLibraryProgress: null
      },
      () => {
        this.props.onImportClick(
          event,
          doneCallback,
          this.state.conflictStrategy,
          onProgress,
          onReview
        );
      }
    );
  }

  handleConfirmImport = () => {
    const { pendingImport } = this.state;
    if (!pendingImport) return;
    this.setState({ loading: true }, () => {
      this.props.onConfirmImport(pendingImport, succeeded => {
        this.setState({
          loading: false,
          pendingImport: succeeded ? null : pendingImport,
          pictureLibraryProgress: succeeded
            ? null
            : this.state.pictureLibraryProgress
        });
      });
    });
  };

  handleCancelImport = () => {
    this.setState({
      pendingImport: null,
      pictureLibraryProgress: null
    });
  };

  handlePrivateLibraryImport = () => {
    const doneCallback = () =>
      this.setState({
        loadingPrivateLibrary: false,
        privateLibraryPassphrase: ''
      });
    const onProgress = pictureLibraryProgress =>
      this.setState({ pictureLibraryProgress });
    const onReview = pendingImport => this.setState({ pendingImport });
    this.setState(
      {
        loadingPrivateLibrary: true,
        pictureLibraryProgress: null
      },
      () => {
        this.props.onPrivateLibraryImport(
          doneCallback,
          this.state.conflictStrategy,
          onProgress,
          onReview,
          this.state.privateLibraryPassphrase
        );
      }
    );
  };

  handlePrivateLibraryDelete = () => {
    if (!window.confirm(this.props.privateLibraryDeletePrompt)) {
      return;
    }
    this.setState({ loadingPrivateLibrary: true }, () => {
      this.props.onPrivateLibraryDelete(() =>
        this.setState({ loadingPrivateLibrary: false })
      );
    });
  };

  handlePrivateDeviceDataImport = () => {
    const doneCallback = () =>
      this.setState({
        loadingPrivateDeviceData: false,
        privateDeviceDataPassphrase: ''
      });
    const onProgress = pictureLibraryProgress =>
      this.setState({ pictureLibraryProgress });
    const onReview = pendingImport => this.setState({ pendingImport });
    this.setState(
      {
        loadingPrivateDeviceData: true,
        pictureLibraryProgress: null
      },
      () => {
        this.props.onPrivateDeviceDataImport(
          doneCallback,
          this.state.conflictStrategy,
          onProgress,
          onReview,
          this.state.privateDeviceDataPassphrase
        );
      }
    );
  };

  handlePrivateDeviceDataDelete = () => {
    if (!window.confirm(this.props.privateDeviceDataDeletePrompt)) {
      return;
    }
    this.setState({ loadingPrivateDeviceData: true }, () => {
      this.props.onPrivateDeviceDataDelete(() =>
        this.setState({ loadingPrivateDeviceData: false })
      );
    });
  };

  render() {
    const { onClose, isAuthenticated } = this.props;
    const { pendingImport } = this.state;
    const passphraseValidation = validatePrivateArchivePassphrase(
      this.state.privateDeviceDataPassphrase
    );
    const privateLibraryPassphraseValidation = validatePrivateArchivePassphrase(
      this.state.privateLibraryPassphrase
    );
    const passphraseErrorMessage =
      passphraseValidation.code === 'PRIVATE_ARCHIVE_PASSPHRASE_TOO_LONG'
        ? messages.privateDeviceDataPassphraseTooLong
        : messages.privateDeviceDataPassphraseTooShort;
    const reviewItems = pendingImport ? pendingImport.items.slice(0, 20) : [];
    if (isCordova()) {
      requestCvaPermissions();
    }

    return (
      <div className="Import">
        <FullScreenDialog
          open
          title={<FormattedMessage {...messages.import} />}
          onClose={onClose}
        >
          <Paper>
            <List>
              <ListItem className="Import__ListItem">
                <ListItemText
                  className="Import__ListItemText"
                  primary={<FormattedMessage {...messages.import} />}
                  secondary={
                    <FormattedMessage
                      {...messages.importSecondary}
                      values={{
                        cboardLink: (
                          <Link
                            href="https://www.cboard.io/help/#HowdoIimportaboardintoCboard"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Cboard
                          </Link>
                        ),
                        link: (
                          <Link
                            href="https://www.openboardformat.org/"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            OpenBoard
                          </Link>
                        )
                      }}
                    />
                  }
                />
                <ListItemSecondaryAction>
                  <div className="Import__ButtonContainer">
                    <FormControl
                      className="Import__ConflictSelect"
                      variant="standard"
                      disabled={this.state.loading || Boolean(pendingImport)}
                    >
                      <InputLabel id="picture-library-conflict-label">
                        <FormattedMessage {...messages.conflictStrategy} />
                      </InputLabel>
                      <Select
                        labelId="picture-library-conflict-label"
                        id="picture-library-conflict"
                        value={this.state.conflictStrategy}
                        onChange={this.handleConflictStrategyChange}
                      >
                        <MenuItem value="merge">
                          <FormattedMessage {...messages.conflictMerge} />
                        </MenuItem>
                        <MenuItem value="skip">
                          <FormattedMessage {...messages.conflictSkip} />
                        </MenuItem>
                      </Select>
                    </FormControl>
                    {this.state.loading && (
                      <CircularProgress
                        size={25}
                        className="Import__ButtonContainer--spinner"
                        thickness={7}
                      />
                    )}
                    <Button
                      id="import-button"
                      variant="contained"
                      color="primary"
                      component="span"
                      disabled={this.state.loading || Boolean(pendingImport)}
                    >
                      <label htmlFor="file">
                        <FormattedMessage {...messages.import} />
                      </label>
                      <input
                        id="file"
                        type="file"
                        accept=".json,.zip,.obz,.obf,.grd,.gridset,.sps,.spb,.ce"
                        style={{ display: 'none' }}
                        onChange={e => this.onImportClick(e)}
                      />
                    </Button>
                    {this.state.pictureLibraryProgress && (
                      <span className="Import__Progress" role="status">
                        {this.state.pictureLibraryProgress.detail ||
                          `${this.state.pictureLibraryProgress.percent}%`}
                      </span>
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          <Paper className="Import__PrivateLibrary">
            <List>
              <ListItem className="Import__ListItem Import__PrivateDeviceDataItem">
                <ListItemText
                  className="Import__ListItemText"
                  primary={
                    <FormattedMessage {...messages.privatePictureLibrary} />
                  }
                  secondary={
                    <FormattedMessage
                      {...messages.privatePictureLibrarySecondary}
                    />
                  }
                />
                <ListItemSecondaryAction className="Import__PrivateDeviceDataAction">
                  <div className="Import__ButtonContainer">
                    <TextField
                      id="private-picture-library-passphrase"
                      type="password"
                      autoComplete="current-password"
                      value={this.state.privateLibraryPassphrase}
                      onChange={event =>
                        this.setState({
                          privateLibraryPassphrase: event.target.value
                        })
                      }
                      label={
                        <FormattedMessage
                          {...messages.privateDeviceDataPassphrase}
                        />
                      }
                      error={
                        Boolean(this.state.privateLibraryPassphrase) &&
                        !privateLibraryPassphraseValidation.ok
                      }
                      helperText={
                        <FormattedMessage
                          {...(Boolean(this.state.privateLibraryPassphrase) &&
                          !privateLibraryPassphraseValidation.ok
                            ? passphraseErrorMessage
                            : messages.privateDeviceDataPassphraseHelp)}
                        />
                      }
                    />
                    <Button
                      id="private-picture-library-download-button"
                      variant="contained"
                      color="primary"
                      disabled={
                        !isAuthenticated ||
                        this.state.loadingPrivateLibrary ||
                        Boolean(pendingImport) ||
                        !privateLibraryPassphraseValidation.ok
                      }
                      onClick={this.handlePrivateLibraryImport}
                      startIcon={<CloudDownloadIcon />}
                    >
                      <FormattedMessage
                        {...messages.restorePrivatePictureLibrary}
                      />
                    </Button>
                    <Button
                      id="private-picture-library-delete-button"
                      disabled={
                        !isAuthenticated || this.state.loadingPrivateLibrary
                      }
                      onClick={this.handlePrivateLibraryDelete}
                      startIcon={<DeleteIcon />}
                    >
                      <FormattedMessage
                        {...messages.deletePrivatePictureLibrary}
                      />
                    </Button>
                    {this.state.loadingPrivateLibrary && (
                      <CircularProgress
                        size={25}
                        className="Import__ButtonContainer--spinner"
                        thickness={7}
                      />
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          <Paper className="Import__PrivateLibrary">
            <List>
              <ListItem className="Import__ListItem Import__PrivateDeviceDataItem">
                <ListItemText
                  className="Import__ListItemText"
                  primary={<FormattedMessage {...messages.privateDeviceData} />}
                  secondary={
                    <FormattedMessage
                      {...messages.privateDeviceDataSecondary}
                    />
                  }
                />
                <ListItemSecondaryAction className="Import__PrivateDeviceDataAction">
                  <div className="Import__ButtonContainer">
                    <TextField
                      id="private-device-data-passphrase"
                      type="password"
                      autoComplete="current-password"
                      value={this.state.privateDeviceDataPassphrase}
                      onChange={event =>
                        this.setState({
                          privateDeviceDataPassphrase: event.target.value
                        })
                      }
                      label={
                        <FormattedMessage
                          {...messages.privateDeviceDataPassphrase}
                        />
                      }
                      error={
                        Boolean(this.state.privateDeviceDataPassphrase) &&
                        !passphraseValidation.ok
                      }
                      helperText={
                        <FormattedMessage
                          {...(Boolean(
                            this.state.privateDeviceDataPassphrase
                          ) && !passphraseValidation.ok
                            ? passphraseErrorMessage
                            : messages.privateDeviceDataPassphraseHelp)}
                        />
                      }
                    />
                    <Button
                      id="private-device-data-download-button"
                      variant="contained"
                      color="primary"
                      disabled={
                        !isAuthenticated ||
                        this.state.loadingPrivateDeviceData ||
                        Boolean(pendingImport) ||
                        !passphraseValidation.ok
                      }
                      onClick={this.handlePrivateDeviceDataImport}
                      startIcon={<CloudDownloadIcon />}
                    >
                      <FormattedMessage
                        {...messages.restorePrivateDeviceData}
                      />
                    </Button>
                    <Button
                      id="private-device-data-delete-button"
                      disabled={
                        !isAuthenticated || this.state.loadingPrivateDeviceData
                      }
                      onClick={this.handlePrivateDeviceDataDelete}
                      startIcon={<DeleteIcon />}
                    >
                      <FormattedMessage {...messages.deletePrivateDeviceData} />
                    </Button>
                    {this.state.loadingPrivateDeviceData && (
                      <CircularProgress
                        size={25}
                        className="Import__ButtonContainer--spinner"
                        thickness={7}
                      />
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          {pendingImport && (
            <Paper
              className="Import__Review"
              role="region"
              aria-label="Import review"
            >
              <h2>
                <FormattedMessage {...messages.reviewTitle} />
              </h2>
              <p className="Import__ReviewFile">
                {pendingImport.fileName} ({pendingImport.format})
              </p>
              <p>
                <FormattedMessage
                  {...messages.reviewSummary}
                  values={{
                    boards: pendingImport.summary.boardCount,
                    importable: pendingImport.summary.importableBoardCount,
                    pictures: pendingImport.summary.tileCount,
                    conflicts: pendingImport.summary.conflictCount
                  }}
                />
              </p>
              {pendingImport.summary.structuredLibrary && (
                <p id="structured-pictogram-library-summary">
                  <FormattedMessage
                    {...messages.reviewStructuredLibrary}
                    values={{
                      concepts: pendingImport.summary.conceptCount,
                      pictures: pendingImport.summary.symbolAssetCount,
                      attributed:
                        pendingImport.summary.attributedSymbolAssetCount,
                      unattributed:
                        pendingImport.summary.unattributedSymbolAssetCount,
                      linked: pendingImport.summary.linkedConceptCount
                    }}
                  />
                </p>
              )}
              {pendingImport.summary.customPictureCount > 0 && (
                <p>
                  <FormattedMessage
                    {...messages.reviewCustomPictures}
                    values={{
                      pictures: pendingImport.summary.customPictureCount
                    }}
                  />
                </p>
              )}
              {pendingImport.summary.deviceDataStats && (
                <p id="local-device-data-summary">
                  <FormattedMessage
                    {...messages.reviewLocalDeviceData}
                    values={{
                      phrases:
                        pendingImport.summary.deviceDataStats.savedPhraseCount,
                      records:
                        pendingImport.summary.deviceDataStats.expressionCount,
                      corrections:
                        pendingImport.summary.deviceDataStats.correctionCount,
                      drafts: pendingImport.summary.deviceDataStats.draftCount
                    }}
                  />
                </p>
              )}
              {pendingImport.summary.conflictCount > 0 && (
                <p className="Import__ReviewWarning" role="status">
                  <FormattedMessage {...messages.reviewConflicts} />
                </p>
              )}
              {pendingImport.summary.skippedCount > 0 && (
                <p className="Import__ReviewWarning" role="status">
                  <FormattedMessage
                    {...messages.reviewSkipped}
                    values={{
                      count: pendingImport.summary.skippedCount
                    }}
                  />
                </p>
              )}
              <List dense className="Import__ReviewList">
                {reviewItems.map(item => (
                  <ListItem key={item.key}>
                    <ListItemText
                      primary={item.name}
                      secondary={
                        <FormattedMessage
                          {...messages.reviewBoard}
                          values={{
                            pictures: item.tileCount,
                            conflict: item.conflict ? ' · duplicate ID' : ''
                          }}
                        />
                      }
                    />
                  </ListItem>
                ))}
              </List>
              {pendingImport.items.length > reviewItems.length && (
                <p>
                  <FormattedMessage
                    {...messages.reviewMore}
                    values={{
                      count: pendingImport.items.length - reviewItems.length
                    }}
                  />
                </p>
              )}
              <div className="Import__ReviewActions">
                <Button
                  id="cancel-import-button"
                  onClick={this.handleCancelImport}
                  disabled={this.state.loading}
                >
                  <FormattedMessage {...messages.cancelReview} />
                </Button>
                <Button
                  id="confirm-import-button"
                  variant="contained"
                  color="primary"
                  onClick={this.handleConfirmImport}
                  disabled={this.state.loading || !pendingImport.canApply}
                >
                  <FormattedMessage {...messages.confirmReview} />
                </Button>
              </div>
            </Paper>
          )}
        </FullScreenDialog>
      </div>
    );
  }
}

Import.propTypes = propTypes;

export default Import;
