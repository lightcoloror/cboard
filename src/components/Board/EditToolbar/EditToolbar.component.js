import React, { Fragment, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { injectIntl, intlShape } from 'react-intl';
import classNames from 'classnames';
import Switch from '@material-ui/core/Switch';
import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import DeleteIcon from '@material-ui/icons/Delete';
import DashboardIcon from '@material-ui/icons/Dashboard';
import DashboardOutlinedIcon from '@material-ui/icons/DashboardOutlined';
import EditIcon from '@material-ui/icons/Edit';
import AddBoxIcon from '@material-ui/icons/AddBox';
import { MdContentCopy } from 'react-icons/md';
import { MdContentPaste } from 'react-icons/md';

import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import SelectedCounter from '../../UI/SelectedCounter';
import IconButton from '../../UI/IconButton';
import messages from './EditToolbar.messages';
import './EditToolbar.css';
import { FormControlLabel } from '@material-ui/core';
import PremiumFeature from '../../PremiumFeature';
import { resolveBoardName } from '../../../helpers';

EditToolbar.propTypes = {
  /**
   * @ignore
   */
  className: PropTypes.string,
  /**
   * @ignore
   */
  classes: PropTypes.object,
  /**
   * @ignore
   */
  intl: intlShape.isRequired,
  /**
   * If true, select all checkbox will be checked
   */
  isSelectAll: PropTypes.bool,
  isFixedBoard: PropTypes.bool,
  /**
   * Used to show a second Toolbar -- Todo: rename for seperation
   */
  isSelecting: PropTypes.bool,
  isLoggedIn: PropTypes.bool,
  /**
   * Used to render how many items were selected in selection mode
   */
  selectedItemsCount: PropTypes.number.isRequired,
  /**
   * Callback fired when clicking on select button
   */
  onSelectClick: PropTypes.func,
  /**
   * Callback fired when clicking on delete button
   */
  onDeleteClick: PropTypes.func,
  // Native CBoard requires an explicit verified local receipt. Other callers
  // keep their existing synchronous, no-argument delete callback contract.
  deleteContextKey: PropTypes.string,
  /**
   * Callback fired when clicking on edit button
   */
  onEditClick: PropTypes.func,
  /**
   * Callback fired when clicking on select all checkbox
   */
  onSelectAllToggle: PropTypes.func,
  onBoardTitleClick: PropTypes.func,
  board: PropTypes.object,
  /**
   * Callback fired when clicking on add button
   */
  onAddClick: PropTypes.func,
  onBoardTypeChange: PropTypes.func,
  copiedTiles: PropTypes.arrayOf(PropTypes.object)
};

function EditToolbar({
  board,
  className,
  classes,
  intl,
  isSelectAll,
  isSelecting,
  isFixedBoard,
  isSaving,
  isLoggedIn,
  selectedItemsCount,
  onSelectClick,
  onDeleteClick,
  deleteContextKey,
  onEditClick,
  onSelectAllToggle,
  onBoardTitleClick,
  onAddClick,
  onBoardTypeChange,
  onCopyTiles,
  onPasteTiles,
  copiedTiles
}) {
  const isItemsSelected = !!selectedItemsCount;
  const isFixed = !!isFixedBoard;

  const [openDeleteTilesDialog, setOpenDeleteTilesDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const mounted = useRef(true);
  const dialogOpen = useRef(false);
  const activeDelete = useRef(null);
  const liveContext = useRef(null);
  const context = JSON.stringify([deleteContextKey, board?.id]);
  liveContext.current = { context, isSelecting };

  useLayoutEffect(() => () => {
    mounted.current = false;
    dialogOpen.current = false;
    activeDelete.current = null;
  }, []);

  useLayoutEffect(() => {
    activeDelete.current = null;
    dialogOpen.current = false;
    setOpenDeleteTilesDialog(false);
    setIsDeleting(false);
    setDeleteFailed(false);
  }, [context, isSelecting]);

  const handleOpenDeleteTilesDialog = () => {
    if (activeDelete.current) return;
    dialogOpen.current = true;
    setDeleteFailed(false);
    setOpenDeleteTilesDialog(true);
  };

  const handleCloseDeleteTilesDialog = () => {
    activeDelete.current = null;
    dialogOpen.current = false;
    setIsDeleting(false);
    setDeleteFailed(false);
    setOpenDeleteTilesDialog(false);
  };

  const handleDeleteTilesAccepted = async () => {
    if (activeDelete.current || !dialogOpen.current) return false;
    const attempt = {};
    activeDelete.current = attempt;
    const guard = () => mounted.current && dialogOpen.current &&
      activeDelete.current === attempt && liveContext.current.context === context &&
      liveContext.current.isSelecting;
    setIsDeleting(true);
    setDeleteFailed(false);
    try {
      const result = await (deleteContextKey == null ? onDeleteClick() : onDeleteClick({ guard }));
      if (!guard()) return false;
      if (result !== true && !(deleteContextKey == null && result === undefined)) {
        setDeleteFailed(true);
        return false;
      }
      handleCloseDeleteTilesDialog();
      return true;
    } catch (_) {
      if (guard()) setDeleteFailed(true);
      return false;
    } finally {
      if (activeDelete.current === attempt) {
        activeDelete.current = null;
        if (mounted.current) setIsDeleting(false);
      }
    }
  };

  return (
    <div
      className={classNames('EditToolbar', className, {
        'EditToolbar--selecting': isSelecting
      })}
    >
      {(isSaving || !isLoggedIn) && (
        <span className="EditToolbar__BoardTitle">
          {resolveBoardName(board, intl)}
        </span>
      )}

      {!isSaving && isLoggedIn && (
        <Button
          className={classNames('EditToolbar__BoardTitle', {
            'logged-in': isLoggedIn
          })}
          onClick={onBoardTitleClick}
        >
          {resolveBoardName(board, intl)}
        </Button>
      )}

      <div className="EditToolbar__group EditToolbar__group--start">
        <Button
          label={intl.formatMessage(
            messages[isSelecting ? 'cancel' : 'editTilesButton']
          )}
          id="edit-board-tiles"
          aria-label="edit-board-tiles"
          onClick={onSelectClick}
          disabled={isSaving}
          className={'edit__board__ride'}
        >
          {isSelecting ? (
            <DashboardOutlinedIcon className="EditToolbar__group EditToolbar__group--start--button" />
          ) : (
            <DashboardIcon className="EditToolbar__group EditToolbar__group--start--button" />
          )}
          {!isSelecting ? intl.formatMessage(messages.editTilesButton) : ''}
        </Button>

        {isSelecting && (
          <Fragment>
            <FormControlLabel
              control={
                <Switch
                  checked={isFixed}
                  onChange={onBoardTypeChange}
                  name="switchFixedBoard"
                  color="secondary"
                />
              }
              label={intl.formatMessage(messages.fixedBoard)}
            />
          </Fragment>
        )}
      </div>
      <div className="EditToolbar__group EditToolbar__group--end">
        {isSelecting && (
          <Fragment>
            <Checkbox checked={isSelectAll} onChange={onSelectAllToggle} />
            <SelectedCounter
              count={selectedItemsCount}
              className="EditToolbar__SelectedCounter"
            />
            <IconButton
              label={intl.formatMessage(messages.deleteTiles)}
              disabled={!isItemsSelected}
              onClick={handleOpenDeleteTilesDialog}
            >
              <DeleteIcon />
            </IconButton>
            <Dialog
              open={openDeleteTilesDialog}
              onClose={handleCloseDeleteTilesDialog}
            >
              <DialogTitle id="alert-dialog-title">
                {intl.formatMessage(messages.deleteTileTitle)}
              </DialogTitle>
              <DialogContent>
                {intl.formatMessage(messages.deleteTileDescription)}
                {isDeleting && <p role="status">{intl.formatMessage(messages.deleteSaving)}</p>}
                {deleteFailed && <p role="alert">{intl.formatMessage(messages.deleteFailed)}</p>}
              </DialogContent>
              <DialogActions>
                <Button onClick={handleCloseDeleteTilesDialog} color="primary">
                  {intl.formatMessage(messages.deleteTileCancel)}
                </Button>
                <Button
                  onClick={handleDeleteTilesAccepted}
                  variant="contained"
                  color="primary"
                  autoFocus
                  disabled={isDeleting}
                >
                  {intl.formatMessage(messages.deleteTileOk)}
                </Button>
              </DialogActions>
            </Dialog>

            <PremiumFeature>
              <IconButton
                label={intl.formatMessage(messages.copyTiles)}
                disabled={!isItemsSelected}
                onClick={onCopyTiles}
              >
                <MdContentCopy />
              </IconButton>
              <IconButton
                label={intl.formatMessage(messages.pasteTiles)}
                disabled={!copiedTiles.length}
                onClick={onPasteTiles}
              >
                <MdContentPaste />
              </IconButton>
            </PremiumFeature>
            <IconButton
              label={intl.formatMessage(messages.editTiles)}
              disabled={!isItemsSelected}
              onClick={onEditClick}
            >
              <EditIcon />
            </IconButton>
          </Fragment>
        )}
        {!isSelecting && (
          <div className={'add__board__tile'}>
            <IconButton
              label={intl.formatMessage(messages.addTileButton)}
              onClick={onAddClick}
              disabled={isSaving}
              color="inherit"
            >
              <AddBoxIcon />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

export default injectIntl(EditToolbar);
