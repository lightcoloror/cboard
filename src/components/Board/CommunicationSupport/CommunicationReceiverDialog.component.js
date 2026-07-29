import React from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

export default function CommunicationReceiverDialog({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  children
}) {
  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      aria-labelledby="communication-receiver-title"
    >
      <DialogTitle id="communication-receiver-title">
        <div className="CommunicationSupportPanel__receiverHeader">
          <div>
            <strong>{title}</strong>
            <p className="CommunicationSupportPanel__receiverSubtitle">
              {subtitle}
            </p>
          </div>
          <Button color="primary" variant="contained" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      </DialogTitle>
      <DialogContent className="CommunicationSupportPanel__receiverScreen">
        {children}
      </DialogContent>
    </Dialog>
  );
}

CommunicationReceiverDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
  closeLabel: PropTypes.string.isRequired,
  children: PropTypes.node
};

CommunicationReceiverDialog.defaultProps = {
  open: false,
  children: null
};
