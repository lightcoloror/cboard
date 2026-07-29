import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import {
  EMERGENCY_COMMUNICATION_PHRASES,
  buildEmergencyCommunicationFallback
} from '../../../common/communicationSupport/emergencyCommunication';
import { matchTextToCommunicationTiles } from '../../../common/communicationSupport/symbolMatching';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import PatientActionButton from './PatientActionButton.component';

function findEmergencyPictogram(phrase, boards) {
  const phraseTexts = [phrase.label, phrase.text].map(text =>
    String(text || '').trim()
  );
  const directMatch = (boards || [])
    .flatMap(board => board.tiles || [])
    .find(tile => {
      if (!tile || !tile.image) return false;
      return [tile.label, tile.vocalization]
        .map(text => String(text || '').trim())
        .filter(Boolean)
        .some(label =>
          phraseTexts.some(
            text =>
              text === label || (label.length >= 2 && text.includes(label))
          )
        );
    });
  if (directMatch) return directMatch;

  const result = matchTextToCommunicationTiles(phrase.text, boards);
  const matches = result && Array.isArray(result.matches) ? result.matches : [];
  const match = [...matches]
    .reverse()
    .find(item => item.tile && item.tile.tile && item.tile.tile.image);

  return match ? match.tile.tile : null;
}

export default function EmergencyCommunicationDialog({
  open,
  onClose,
  onSpeak,
  onConfirm,
  boards
}) {
  const [selected, setSelected] = useState(null);
  const phraseOptions = useMemo(
    () =>
      EMERGENCY_COMMUNICATION_PHRASES.map(phrase => ({
        phrase,
        pictogram: findEmergencyPictogram(phrase, boards)
      })),
    [boards]
  );

  useEffect(
    () => {
      if (!open) setSelected(null);
    },
    [open]
  );

  function selectPhrase(phrase) {
    const fallback = buildEmergencyCommunicationFallback(phrase.id);
    if (!fallback) return;
    setSelected(phrase);
    onSpeak(fallback.text);
    onConfirm({
      contractVersion: 1,
      direction: 'express',
      sentence: fallback.text,
      labels: [phrase.label],
      output: []
    });
  }

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      aria-labelledby="communication-emergency-title"
    >
      <DialogTitle id="communication-emergency-title">紧急求助</DialogTitle>
      <DialogContent className="CommunicationSupportPanel__emergencyScreen">
        <p className="CommunicationSupportPanel__emergencyHint">
          点击一句立即朗读；文字会同时放大显示，便于无法听清时直接查看。
        </p>
        {selected && (
          <div
            className="CommunicationSupportPanel__emergencyDisplay"
            role="status"
            aria-live="assertive"
          >
            {selected.text}
          </div>
        )}
        <div className="CommunicationSupportPanel__emergencyGrid">
          {phraseOptions.map(({ phrase, pictogram }) => {
            return (
              <button
                className={`CommunicationSupportPanel__emergencyPhrase CommunicationSupportPanel__emergencyPhrase--${
                  phrase.tone
                }`}
                key={phrase.id}
                data-emergency-phrase={phrase.id}
                aria-label={`朗读紧急短句：${phrase.text}`}
                onClick={() => selectPhrase(phrase)}
              >
                {pictogram ? (
                  <img
                    className="CommunicationSupportPanel__emergencyPictogram"
                    src={pictogram.image}
                    alt=""
                  />
                ) : (
                  <span
                    className="CommunicationSupportPanel__emergencyPictogramFallback"
                    aria-hidden="true"
                  >
                    !
                  </span>
                )}
                <span className="CommunicationSupportPanel__emergencyPhraseLabel">
                  {phrase.label}
                </span>
                <span
                  className="CommunicationSupportPanel__emergencyPhraseSound"
                  aria-hidden="true"
                >
                  ▶
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
      <DialogActions>
        <PatientActionButton
          action={PATIENT_ACTION_IDS.back}
          color="primary"
          variant="contained"
          onClick={onClose}
          label="返回"
          ariaLabel="返回沟通"
        />
      </DialogActions>
    </Dialog>
  );
}

EmergencyCommunicationDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onSpeak: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  boards: PropTypes.arrayOf(PropTypes.object)
};

EmergencyCommunicationDialog.defaultProps = {
  open: false,
  boards: []
};
