import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage, intlShape } from 'react-intl';
import Link from '@material-ui/core/Link';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';
import List from '@material-ui/core/List';
import CircularProgress from '@material-ui/core/CircularProgress';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import Select from '@material-ui/core/Select';
import InputLabel from '@material-ui/core/InputLabel';
import FormControl from '@material-ui/core/FormControl';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import GetAppIcon from '@material-ui/icons/GetApp';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';

import FullScreenDialog from '../../UI/FullScreenDialog';
import messages from './Export.messages';

import './Export.css';
import ListSubheader from '@material-ui/core/ListSubheader';
import {
  LARGE_FONT_SIZE,
  MEDIUM_FONT_SIZE,
  SMALL_FONT_SIZE
} from './Export.constants';
import { validatePrivateArchivePassphrase } from '../../../common/communicationSupport/privateArchivePassphrase';

const propTypes = {
  /**
   * Callback fired when clicking the export Cboard button
   */
  onExportClick: PropTypes.func.isRequired,
  onPrivateLibraryUpload: PropTypes.func.isRequired,
  onPrivateDeviceDataUpload: PropTypes.func.isRequired,
  /**
   * Callback fired when clicking the back button
   */
  onClose: PropTypes.func,
  boards: PropTypes.array.isRequired,
  intl: intlShape.isRequired,
  isAuthenticated: PropTypes.bool.isRequired
};

class Export extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      exportSingleBoard: '',
      exportAllBoard: '',
      labelFontSize: MEDIUM_FONT_SIZE,
      singleBoard: '',
      loadingSingle: false,
      loadingAll: false,
      loadingPictureLibrary: false,
      loadingPrivateLibrary: false,
      loadingPrivateDeviceData: false,
      pictureLibraryScope: 'custom',
      pictureLibraryProgress: null,
      privateLibraryProgress: null,
      privateDeviceDataProgress: null,
      privateLibraryPassphrase: '',
      privateLibraryPassphraseConfirmation: '',
      privateDeviceDataPassphrase: '',
      privateDeviceDataPassphraseConfirmation: '',
      boardError: false
    };
  }

  openMenu(e) {
    this.setState({ exportMenu: e.currentTarget });
  }

  closeMenu() {
    this.setState({ exportMenu: null });
  }

  handleBoardChange = event => {
    this.setState({
      boardError: false,
      singleBoard: event.target.value
    });
  };

  handleSizeChange = event => {
    this.setState({
      boardError: false,
      labelFontSize: event.target.value
    });
  };

  handleSingleBoardChange = event => {
    this.setState({ exportSingleBoard: event.target.value });
  };

  handleAllBoardChange = event => {
    this.setState({ exportAllBoard: event.target.value });
  };

  handlePictureLibraryScopeChange = event => {
    this.setState({ pictureLibraryScope: event.target.value });
  };

  handlePictureLibraryExport = () => {
    const doneCallback = () => this.setState({ loadingPictureLibrary: false });
    const onProgress = pictureLibraryProgress =>
      this.setState({ pictureLibraryProgress });
    this.setState(
      {
        loadingPictureLibrary: true,
        pictureLibraryProgress: null
      },
      () => {
        this.props.onExportClick(
          'pictureLibrary',
          this.state.pictureLibraryScope,
          '',
          doneCallback,
          onProgress
        );
      }
    );
  };

  handlePrivateLibraryUpload = () => {
    const doneCallback = () =>
      this.setState({
        loadingPrivateLibrary: false,
        privateLibraryPassphrase: '',
        privateLibraryPassphraseConfirmation: ''
      });
    const onProgress = privateLibraryProgress =>
      this.setState({ privateLibraryProgress });
    this.setState(
      {
        loadingPrivateLibrary: true,
        privateLibraryProgress: null
      },
      () => {
        this.props.onPrivateLibraryUpload(
          doneCallback,
          onProgress,
          this.state.privateLibraryPassphrase
        );
      }
    );
  };

  handlePrivateDeviceDataUpload = () => {
    const doneCallback = () =>
      this.setState({
        loadingPrivateDeviceData: false,
        privateDeviceDataPassphrase: '',
        privateDeviceDataPassphraseConfirmation: ''
      });
    const onProgress = privateDeviceDataProgress =>
      this.setState({ privateDeviceDataProgress });
    this.setState(
      {
        loadingPrivateDeviceData: true,
        privateDeviceDataProgress: null
      },
      () => {
        this.props.onPrivateDeviceDataUpload(
          doneCallback,
          onProgress,
          this.state.privateDeviceDataPassphrase
        );
      }
    );
  };

  handleAllExport = () => {
    if (!this.state.exportAllBoard) return;
    const doneCallback = () => this.setState({ loadingAll: false });
    this.setState({ loadingAll: true }, () => {
      this.props.onExportClick(
        this.state.exportAllBoard,
        '',
        this.state.labelFontSize,
        doneCallback
      );
    });
  };

  handleSingleExport = () => {
    if (!this.state.singleBoard || !this.state.exportSingleBoard) {
      this.setState({ boardError: true });
      return;
    }
    const doneCallback = () => this.setState({ loadingSingle: false });
    this.setState({ loadingSingle: true }, () => {
      this.props.onExportClick(
        this.state.exportSingleBoard,
        this.state.singleBoard,
        this.state.labelFontSize,
        doneCallback
      );
    });
  };

  render() {
    const { onClose, boards, intl, isAuthenticated } = this.props;
    const passphraseValidation = validatePrivateArchivePassphrase(
      this.state.privateDeviceDataPassphrase
    );
    const completePassphraseValidation = validatePrivateArchivePassphrase(
      this.state.privateDeviceDataPassphrase,
      this.state.privateDeviceDataPassphraseConfirmation
    );
    const privateLibraryPassphraseValidation = validatePrivateArchivePassphrase(
      this.state.privateLibraryPassphrase
    );
    const completePrivateLibraryPassphraseValidation = validatePrivateArchivePassphrase(
      this.state.privateLibraryPassphrase,
      this.state.privateLibraryPassphraseConfirmation
    );
    const passphraseErrorMessage =
      passphraseValidation.code === 'PRIVATE_ARCHIVE_PASSPHRASE_TOO_LONG'
        ? messages.privateDeviceDataPassphraseTooLong
        : messages.privateDeviceDataPassphraseTooShort;
    return (
      <div className="Export">
        <FullScreenDialog
          open
          title={<FormattedMessage {...messages.export} />}
          onClose={onClose}
        >
          <Paper className="Export__section">
            <List>
              <ListItem className="Export__ListItem">
                <ListItemText
                  className="Export__ListItemText"
                  primary={<FormattedMessage {...messages.exportSingle} />}
                  secondary={
                    <FormattedMessage
                      {...messages.exportSingleSecondary}
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
                  <div className="Export__SelectContainer">
                    {this.state.loadingSingle ? (
                      <CircularProgress
                        size={25}
                        className="Export__SelectContainer--spinner"
                        thickness={7}
                      />
                    ) : (
                      <div className="Export__SelectContainer">
                        <FormControl
                          className="Export__SelectContainer__Select"
                          variant="standard"
                          error={this.state.boardError}
                          disabled={this.state.loading}
                        >
                          <InputLabel id="boards-select-label">
                            {intl.formatMessage(messages.boards)}
                          </InputLabel>
                          <Select
                            labelId="boards-select-label"
                            id="boards-select"
                            autoWidth={false}
                            value={this.state.singleBoard}
                            onChange={this.handleBoardChange}
                          >
                            {boards.map(
                              board =>
                                !board.hidden && (
                                  <MenuItem key={board.id} value={board}>
                                    {board.name ||
                                      (board.nameKey &&
                                        intl.formatMessage({
                                          id: board.nameKey
                                        }))}
                                  </MenuItem>
                                )
                            )}
                          </Select>
                        </FormControl>
                        <FormControl
                          className="Export__SelectContainer__Select"
                          variant="standard"
                          disabled={this.state.loading}
                        >
                          <InputLabel id="export-single-select-label">
                            {intl.formatMessage(messages.export)}
                          </InputLabel>
                          <Select
                            labelId="export-single-select-label"
                            id="export-single-select"
                            autoWidth={false}
                            disabled={this.state.loading}
                            value={this.state.exportSingleBoard}
                            onChange={this.handleSingleBoardChange}
                          >
                            <MenuItem value="cboard">Cboard</MenuItem>
                            <MenuItem value="structured">
                              <FormattedMessage
                                {...messages.structuredPictogramLibrary}
                              />
                            </MenuItem>
                            <MenuItem value="openboard">OpenBoard</MenuItem>
                            <MenuItem value="pdf">PDF</MenuItem>
                            <MenuItem value="picsee_pdf">
                              PicseePal PDF
                            </MenuItem>
                          </Select>
                        </FormControl>
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={this.handleSingleExport}
                          disabled={
                            !this.state.singleBoard ||
                            !this.state.exportSingleBoard ||
                            this.state.loadingSingle
                          }
                          startIcon={<GetAppIcon />}
                        >
                          <FormattedMessage {...messages.export} />
                        </Button>
                      </div>
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          <Paper className="Export__section">
            <List>
              <ListItem>
                <ListItemText
                  className="Export__ListItemText"
                  primary={<FormattedMessage {...messages.exportAll} />}
                  secondary={
                    <FormattedMessage
                      {...messages.exportAllSecondary}
                      values={{
                        cboardLink: (
                          <Link
                            href="https://www.cboard.io/help/#HowdoIimportaboardintoCboard"
                            target="_blank"
                          >
                            Cboard
                          </Link>
                        ),
                        link: (
                          <Link
                            href="https://www.openboardformat.org/"
                            target="_blank"
                          >
                            OpenBoard
                          </Link>
                        )
                      }}
                    />
                  }
                />
                <ListItemSecondaryAction>
                  <div className="Export__SelectContainer">
                    {this.state.loadingAll ? (
                      <CircularProgress
                        size={25}
                        className="Export__SelectContainer--spinner"
                        thickness={7}
                      />
                    ) : (
                      <div className="Export__SelectContainer">
                        <FormControl
                          className="Export__SelectContainer__Select"
                          variant="standard"
                          disabled={this.state.loadingAll}
                        >
                          <InputLabel id="export-all-select-label">
                            {intl.formatMessage(messages.export)}
                          </InputLabel>
                          <Select
                            labelId="export-all-select-label"
                            id="export-all-select"
                            autoWidth={false}
                            value={this.state.exportAllBoard}
                            onChange={this.handleAllBoardChange}
                          >
                            <MenuItem value="cboard">Cboard</MenuItem>
                            <MenuItem value="structured">
                              <FormattedMessage
                                {...messages.structuredPictogramLibrary}
                              />
                            </MenuItem>
                            <MenuItem value="openboard">OpenBoard</MenuItem>
                            <MenuItem value="pdf">PDF</MenuItem>
                            <MenuItem value="picsee_pdf">
                              PicseePal PDF
                            </MenuItem>
                          </Select>
                        </FormControl>
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={this.handleAllExport}
                          disabled={
                            !this.state.exportAllBoard || this.state.loadingAll
                          }
                          startIcon={<GetAppIcon />}
                        >
                          <FormattedMessage {...messages.export} />
                        </Button>
                      </div>
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          <Paper className="Export__section">
            <List>
              <ListItem className="Export__ListItem">
                <ListItemText
                  className="Export__ListItemText"
                  primary={<FormattedMessage {...messages.pictureLibrary} />}
                  secondary={
                    <FormattedMessage {...messages.pictureLibrarySecondary} />
                  }
                />
                <ListItemSecondaryAction>
                  <div className="Export__SelectContainer">
                    <FormControl
                      className="Export__SelectContainer__Select"
                      variant="standard"
                      disabled={this.state.loadingPictureLibrary}
                    >
                      <InputLabel id="picture-library-scope-label">
                        {intl.formatMessage(messages.pictureLibraryScope)}
                      </InputLabel>
                      <Select
                        labelId="picture-library-scope-label"
                        id="picture-library-scope"
                        value={this.state.pictureLibraryScope}
                        onChange={this.handlePictureLibraryScopeChange}
                      >
                        <MenuItem value="custom">
                          <FormattedMessage
                            {...messages.pictureLibraryCustom}
                          />
                        </MenuItem>
                        <MenuItem value="full">
                          <FormattedMessage {...messages.pictureLibraryFull} />
                        </MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      id="picture-library-export-button"
                      variant="contained"
                      color="primary"
                      disabled={this.state.loadingPictureLibrary}
                      onClick={this.handlePictureLibraryExport}
                      startIcon={<GetAppIcon />}
                    >
                      <FormattedMessage {...messages.export} />
                    </Button>
                    {this.state.loadingPictureLibrary && (
                      <CircularProgress
                        size={25}
                        className="Export__SelectContainer--spinner"
                        thickness={7}
                      />
                    )}
                    {this.state.pictureLibraryProgress && (
                      <span className="Export__Progress" role="status">
                        {this.state.pictureLibraryProgress.detail ||
                          `${this.state.pictureLibraryProgress.percent}%`}
                      </span>
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          <Paper className="Export__section">
            <List>
              <ListItem className="Export__ListItem Export__PrivateDeviceDataItem">
                <ListItemText
                  className="Export__ListItemText"
                  primary={
                    <FormattedMessage {...messages.privatePictureLibrary} />
                  }
                  secondary={
                    <FormattedMessage
                      {...messages.privatePictureLibrarySecondary}
                    />
                  }
                />
                <ListItemSecondaryAction className="Export__PrivateDeviceDataAction">
                  <div className="Export__SelectContainer">
                    <TextField
                      id="private-picture-library-passphrase"
                      type="password"
                      autoComplete="new-password"
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
                    <TextField
                      id="private-picture-library-passphrase-confirmation"
                      type="password"
                      autoComplete="new-password"
                      value={this.state.privateLibraryPassphraseConfirmation}
                      onChange={event =>
                        this.setState({
                          privateLibraryPassphraseConfirmation:
                            event.target.value
                        })
                      }
                      label={
                        <FormattedMessage
                          {...messages.privateDeviceDataPassphraseConfirmation}
                        />
                      }
                      error={
                        Boolean(
                          this.state.privateLibraryPassphraseConfirmation
                        ) &&
                        completePrivateLibraryPassphraseValidation.code ===
                          'PRIVATE_ARCHIVE_PASSPHRASE_MISMATCH'
                      }
                      helperText={
                        completePrivateLibraryPassphraseValidation.code ===
                        'PRIVATE_ARCHIVE_PASSPHRASE_MISMATCH' ? (
                          <FormattedMessage
                            {...messages.privateDeviceDataPassphraseMismatch}
                          />
                        ) : null
                      }
                    />
                    <Button
                      id="private-picture-library-upload-button"
                      variant="contained"
                      color="primary"
                      disabled={
                        !isAuthenticated ||
                        this.state.loadingPrivateLibrary ||
                        !completePrivateLibraryPassphraseValidation.ok
                      }
                      onClick={this.handlePrivateLibraryUpload}
                      startIcon={<CloudUploadIcon />}
                    >
                      <FormattedMessage
                        {...messages.uploadPrivatePictureLibrary}
                      />
                    </Button>
                    {this.state.loadingPrivateLibrary && (
                      <CircularProgress
                        size={25}
                        className="Export__SelectContainer--spinner"
                        thickness={7}
                      />
                    )}
                    {this.state.privateLibraryProgress && (
                      <span className="Export__Progress" role="status">
                        {this.state.privateLibraryProgress.detail ||
                          `${this.state.privateLibraryProgress.percent}%`}
                      </span>
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          <Paper className="Export__section">
            <List>
              <ListItem className="Export__ListItem Export__PrivateDeviceDataItem">
                <ListItemText
                  className="Export__ListItemText"
                  primary={<FormattedMessage {...messages.privateDeviceData} />}
                  secondary={
                    <FormattedMessage
                      {...messages.privateDeviceDataSecondary}
                    />
                  }
                />
                <ListItemSecondaryAction className="Export__PrivateDeviceDataAction">
                  <div className="Export__SelectContainer">
                    <TextField
                      id="private-device-data-passphrase"
                      type="password"
                      autoComplete="new-password"
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
                    <TextField
                      id="private-device-data-passphrase-confirmation"
                      type="password"
                      autoComplete="new-password"
                      value={this.state.privateDeviceDataPassphraseConfirmation}
                      onChange={event =>
                        this.setState({
                          privateDeviceDataPassphraseConfirmation:
                            event.target.value
                        })
                      }
                      label={
                        <FormattedMessage
                          {...messages.privateDeviceDataPassphraseConfirmation}
                        />
                      }
                      error={
                        Boolean(
                          this.state.privateDeviceDataPassphraseConfirmation
                        ) &&
                        completePassphraseValidation.code ===
                          'PRIVATE_ARCHIVE_PASSPHRASE_MISMATCH'
                      }
                      helperText={
                        completePassphraseValidation.code ===
                        'PRIVATE_ARCHIVE_PASSPHRASE_MISMATCH' ? (
                          <FormattedMessage
                            {...messages.privateDeviceDataPassphraseMismatch}
                          />
                        ) : null
                      }
                    />
                    <Button
                      id="private-device-data-upload-button"
                      variant="contained"
                      color="primary"
                      disabled={
                        !isAuthenticated ||
                        this.state.loadingPrivateDeviceData ||
                        !completePassphraseValidation.ok
                      }
                      onClick={this.handlePrivateDeviceDataUpload}
                      startIcon={<CloudUploadIcon />}
                    >
                      <FormattedMessage {...messages.uploadPrivateDeviceData} />
                    </Button>
                    {this.state.loadingPrivateDeviceData && (
                      <CircularProgress
                        size={25}
                        className="Export__SelectContainer--spinner"
                        thickness={7}
                      />
                    )}
                    {this.state.privateDeviceDataProgress && (
                      <span className="Export__Progress" role="status">
                        {this.state.privateDeviceDataProgress.detail ||
                          `${this.state.privateDeviceDataProgress.percent}%`}
                      </span>
                    )}
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
          <Paper className="Export__section">
            <List
              className="Export__List"
              subheader={
                <ListSubheader>
                  <FormattedMessage {...messages.pdfSettings} />
                </ListSubheader>
              }
            >
              <ListItem>
                <ListItemText
                  className="Export__ListItemText"
                  primary={<FormattedMessage {...messages.fontSize} />}
                  secondary={
                    <FormattedMessage {...messages.fontSizeSecondary} />
                  }
                />
                <ListItemSecondaryAction>
                  <div className="Export__SelectContainer">
                    <FormControl
                      className="Export__SelectContainer__Select"
                      variant="standard"
                    >
                      <InputLabel id="export-all-select-label-size">
                        {intl.formatMessage(messages.fontSize)}
                      </InputLabel>
                      <Select
                        labelId="export-all-select-label-size"
                        id="export-all-select-size"
                        autoWidth={false}
                        value={this.state.labelFontSize}
                        onChange={this.handleSizeChange}
                      >
                        <MenuItem value={SMALL_FONT_SIZE}>
                          <FormattedMessage {...messages.small} />
                        </MenuItem>
                        <MenuItem value={MEDIUM_FONT_SIZE}>
                          <FormattedMessage {...messages.medium} />
                        </MenuItem>
                        <MenuItem value={LARGE_FONT_SIZE}>
                          <FormattedMessage {...messages.large} />
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </div>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </Paper>
        </FullScreenDialog>
      </div>
    );
  }
}

Export.propTypes = propTypes;

export default Export;
