import React from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';

export default function CommunicationPlaybackDialog({
  open,
  item,
  isSpeaking,
  statusLabel,
  replayLabel,
  doneLabel,
  onReplay,
  onClose
}) {
  const output = item && Array.isArray(item.output) ? item.output : [];
  const sentence = item ? String(item.sentence || '').trim() : '';

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      aria-labelledby="communication-playback-sentence"
    >
      <DialogContent className="CommunicationSupportPanel__playbackScreen">
        <div className="CommunicationSupportPanel__playbackCard">
          {output.length > 0 && (
            <div className="CommunicationSupportPanel__playbackImages">
              {output.map((outputItem, index) => (
                <figure
                  className="CommunicationSupportPanel__playbackFigure"
                  key={`${outputItem.id || outputItem.label}-${index}`}
                >
                  {outputItem.image ? (
                    <img
                      className="CommunicationSupportPanel__playbackImage"
                      src={outputItem.image}
                      alt=""
                    />
                  ) : (
                    <div
                      className="CommunicationSupportPanel__playbackMissing"
                      aria-hidden="true"
                    >
                      ?
                    </div>
                  )}
                  <figcaption className="CommunicationSupportPanel__playbackLabel">
                    {outputItem.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <div
            id="communication-playback-sentence"
            className="CommunicationSupportPanel__playbackSentence"
          >
            {sentence}
          </div>
          <div
            className="CommunicationSupportPanel__playbackStatus"
            role="status"
            aria-live="polite"
          >
            {statusLabel}
          </div>
          <div className="CommunicationSupportPanel__playbackActions">
            <Button
              color="primary"
              variant="outlined"
              disabled={isSpeaking}
              onClick={onReplay}
            >
              {replayLabel}
            </Button>
            <Button color="primary" variant="contained" onClick={onClose}>
              {doneLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

CommunicationPlaybackDialog.propTypes = {
  open: PropTypes.bool,
  item: PropTypes.shape({
    sentence: PropTypes.string.isRequired,
    output: PropTypes.arrayOf(PropTypes.object).isRequired
  }),
  isSpeaking: PropTypes.bool,
  statusLabel: PropTypes.string.isRequired,
  replayLabel: PropTypes.string.isRequired,
  doneLabel: PropTypes.string.isRequired,
  onReplay: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};

CommunicationPlaybackDialog.defaultProps = {
  open: false,
  item: null,
  isSpeaking: false
};
