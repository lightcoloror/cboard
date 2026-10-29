import React from 'react';
import PropTypes from 'prop-types';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import FirstPageIcon from '@material-ui/icons/FirstPage';
import { FormattedMessage } from 'react-intl';
import { CboardScanItem } from '../UI/CboardScan';

import './NavigationButtons.css';

const NavigationButtons = ({
  active,
  navHistory = [],
  previousBoard,
  toRootBoard,
  isSaving,
  isNavigationButtonsOnTheSide
}) => {
  if (!active) {
    return null;
  }
  const canGoBack = !isSaving && navHistory.length > 1;
  const canGoHome = !isSaving && navHistory.length > 2;
  const classPreviousBoardButton = isNavigationButtonsOnTheSide
    ? `SideNavigationButton SideButtonPreviousBoard ${
        !isSaving && navHistory.length > 1 ? '' : 'disable'
      }`
    : `NavigationButton right`;

  const classToRootBoardButton = isNavigationButtonsOnTheSide
    ? `SideNavigationButton SideButtonToRootBoard ${
        !isSaving && navHistory.length > 2 ? '' : 'disable'
      }`
    : 'NavigationButton left';

  return (
    <React.Fragment>
      <div
        className={
          isNavigationButtonsOnTheSide ? `SideNavigationButtonsContainer` : ''
        }
      >
        {(navHistory.length > 2 || isNavigationButtonsOnTheSide) && (
          <div className={classToRootBoardButton}>
            <FormattedMessage id="cboard.components.CommunicatorDialog.rootBoard" defaultMessage="Home board">
              {label => <CboardScanItem disabled={!canGoHome}><button type="button" aria-label={String(label)} title={String(label)} disabled={!canGoHome} onClick={() => { if (canGoHome) toRootBoard(); }}>
                <FirstPageIcon aria-hidden="true" />
              </button></CboardScanItem>}
            </FormattedMessage>
          </div>
        )}
        {(navHistory.length > 1 || isNavigationButtonsOnTheSide) && (
          <div className={classPreviousBoardButton}>
            <FormattedMessage id="cboard.components.BackButton.back" defaultMessage="Go back">
              {label => <CboardScanItem disabled={!canGoBack}><button type="button" aria-label={String(label)} title={String(label)} disabled={!canGoBack} onClick={() => { if (canGoBack) previousBoard(); }}>
                <ChevronLeftIcon aria-hidden="true" />
              </button></CboardScanItem>}
            </FormattedMessage>
          </div>
        )}
      </div>
    </React.Fragment>
  );
};

NavigationButtons.props = {
  navHistory: PropTypes.arrayOf(PropTypes.string),
  previousBoard: PropTypes.func,
  toRootBoard: PropTypes.func,
  isSaving: PropTypes.bool,
  isNavigationButtonsOnTheSide: PropTypes.bool
};

export default NavigationButtons;
