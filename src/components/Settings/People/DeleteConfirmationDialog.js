import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import TextField from '@material-ui/core/TextField';
import Checkbox from '@material-ui/core/Checkbox';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import { FormattedMessage } from 'react-intl';
import messages from './People.messages';

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress
} from '@material-ui/core';

const propTypes = {
  open: PropTypes.bool,
  handleClose: PropTypes.func,
  handleDeleteConfirmed: PropTypes.func,
  handleFamilyCloseConfirmed: PropTypes.func,
  isDeletingAccount: PropTypes.bool,
  errorDeletingAccount: PropTypes.bool,
  familyCloseIds: PropTypes.arrayOf(PropTypes.string),
  familyTransferRequired: PropTypes.bool
};

const defaultProps = {
  familyCloseIds: [],
  familyTransferRequired: false
};

const DeleteConfirmationDialog = ({
  open,
  handleClose,
  handleDeleteConfirmed,
  handleFamilyCloseConfirmed,
  isDeletingAccount,
  errorDeletingAccount,
  familyCloseIds,
  familyTransferRequired
}) => {
  const DELETE_ACCOUNT = 'delete-account';
  const [confirmationText, setConfirmationText] = useState('');
  const [closeFamilyConfirmed, setCloseFamilyConfirmed] = useState(false);
  const hasFamilyClose = familyCloseIds && familyCloseIds.length > 0;

  useEffect(
    () => {
      setConfirmationText('');
      setCloseFamilyConfirmed(false);
    },
    [open, familyCloseIds]
  );

  const handleConfirmationChange = e => {
    setConfirmationText(e.target.value);
  };

  const handleDialogClose = () => {
    setConfirmationText('');
    setCloseFamilyConfirmed(false);
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">
        {<FormattedMessage {...messages.deleteAccountPrimary} />}
      </DialogTitle>
      <DialogContent>
        {familyTransferRequired ? (
          <DialogContentText id="alert-dialog-description">
            <FormattedMessage {...messages.familyTransferRequired} />
          </DialogContentText>
        ) : errorDeletingAccount ? (
          <DialogContentText id="alert-dialog-description">
            <FormattedMessage {...messages.errorDeletingAccount} />
          </DialogContentText>
        ) : (
          <DialogContentText id="alert-dialog-description">
            <FormattedMessage {...messages.deleteAccountConfirmation} />
          </DialogContentText>
        )}
        <TextField
          autoFocus={true}
          fullWidth={true}
          value={confirmationText}
          label={
            <FormattedMessage
              {...messages.deleteAccountFinal}
              values={{ deleteAccount: DELETE_ACCOUNT }}
            />
          }
          onChange={handleConfirmationChange}
        />
        {hasFamilyClose && (
          <FormControlLabel
            control={
              <Checkbox
                checked={closeFamilyConfirmed}
                onChange={event =>
                  setCloseFamilyConfirmed(event.target.checked)
                }
                color="secondary"
              />
            }
            label={
              <FormattedMessage
                {...messages.closeFamilyConfirmation}
                values={{ count: familyCloseIds.length }}
              />
            }
          />
        )}
      </DialogContent>
      {!isDeletingAccount && (
        <DialogActions>
          {!familyTransferRequired && (
            <Button
              variant="outlined"
              color="secondary"
              className={'delete_button'}
              disabled={
                confirmationText !== DELETE_ACCOUNT ||
                (hasFamilyClose && !closeFamilyConfirmed)
              }
              onClick={() =>
                hasFamilyClose
                  ? handleFamilyCloseConfirmed(familyCloseIds)
                  : handleDeleteConfirmed()
              }
            >
              {hasFamilyClose ? (
                <FormattedMessage {...messages.closeFamilyAndDelete} />
              ) : (
                <FormattedMessage {...messages.deleteAccountPrimary} />
              )}
            </Button>
          )}
          <Button variant="outlined" onClick={handleDialogClose} autoFocus>
            {<FormattedMessage {...messages.cancelDeleteAccount} />}
          </Button>
        </DialogActions>
      )}
      {isDeletingAccount && <LinearProgress color="secondary" />}
    </Dialog>
  );
};

DeleteConfirmationDialog.propTypes = propTypes;
DeleteConfirmationDialog.defaultProps = defaultProps;

export default DeleteConfirmationDialog;
