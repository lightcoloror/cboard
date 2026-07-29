import React from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import ChatBubbleOutlineIcon from '@material-ui/icons/ChatBubbleOutline';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import ClearIcon from '@material-ui/icons/Clear';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import FullscreenIcon from '@material-ui/icons/Fullscreen';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import PlaylistPlayIcon from '@material-ui/icons/PlaylistPlay';
import ReplayIcon from '@material-ui/icons/Replay';
import ShareIcon from '@material-ui/icons/Share';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import StarsIcon from '@material-ui/icons/Stars';
import StopIcon from '@material-ui/icons/Stop';
import UndoIcon from '@material-ui/icons/Undo';
import VisibilityIcon from '@material-ui/icons/Visibility';
import WarningIcon from '@material-ui/icons/Warning';
import {
  PATIENT_ACTION_IDS,
  getPatientActionDefinition
} from '../../../common/communicationSupport/patientActionLanguage';
import './PatientActionButton.css';

const ICON_BY_NAME = {
  back: ArrowBackIcon,
  clear: ClearIcon,
  confirm: CheckCircleOutlineIcon,
  fullscreen: FullscreenIcon,
  improve: StarsIcon,
  left: ChevronLeftIcon,
  message: ChatBubbleOutlineIcon,
  'not-understood': HelpOutlineIcon,
  play: PlayArrowIcon,
  'play-all': PlaylistPlayIcon,
  receive: VisibilityIcon,
  remove: DeleteOutlineIcon,
  replay: ReplayIcon,
  right: ChevronRightIcon,
  save: StarBorderIcon,
  share: ShareIcon,
  stop: StopIcon,
  understood: CheckCircleOutlineIcon,
  undo: UndoIcon,
  warning: WarningIcon
};

export default function PatientActionButton({
  action,
  label,
  ariaLabel,
  className,
  ...buttonProps
}) {
  const definition = getPatientActionDefinition(action, {
    label,
    ariaLabel
  });
  if (!definition) return null;

  const Icon = ICON_BY_NAME[definition.icon];
  return (
    <Button
      {...buttonProps}
      className={`PatientActionButton-root ${className}`.trim()}
      aria-label={definition.ariaLabel}
      data-patient-action={definition.id}
    >
      {Icon && <Icon className="PatientActionButton-icon" aria-hidden="true" />}
      <span className="PatientActionButton-label">{definition.label}</span>
    </Button>
  );
}

PatientActionButton.propTypes = {
  action: PropTypes.oneOf(Object.values(PATIENT_ACTION_IDS)).isRequired,
  label: PropTypes.string,
  ariaLabel: PropTypes.string,
  className: PropTypes.string
};

PatientActionButton.defaultProps = {
  label: '',
  ariaLabel: '',
  className: ''
};
