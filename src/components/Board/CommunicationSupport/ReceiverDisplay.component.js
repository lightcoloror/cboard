import React from 'react';
import PropTypes from 'prop-types';
import FullScreenDialog, {
  FullScreenDialogContent
} from '../../UI/FullScreenDialog';
import Symbol from '../Symbol';

export default function ReceiverDisplay({ open, title, items, onClose }) {
  return (
    <FullScreenDialog open={open} onClose={onClose} title={title} fullWidth>
      <FullScreenDialogContent className="CommunicationSupportPanel__displayScreen">
        <div className="CommunicationSupportPanel__displayOverlay">
          {items.map((item, index) => (
            <div
              className="CommunicationSupportPanel__displayItem"
              key={(item.id || item.label) + '-' + index}
            >
              <Symbol
                className="CommunicationSupportPanel__symbol CommunicationSupportPanel__symbol--display"
                image={item.image}
                keyPath={item.keyPath}
                label={item.label}
                labelpos="Below"
              />
            </div>
          ))}
        </div>
      </FullScreenDialogContent>
    </FullScreenDialog>
  );
}

ReceiverDisplay.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.node.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      image: PropTypes.string,
      keyPath: PropTypes.string,
      label: PropTypes.string.isRequired
    })
  ).isRequired,
  onClose: PropTypes.func.isRequired
};
