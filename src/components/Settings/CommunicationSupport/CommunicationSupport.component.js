import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage } from 'react-intl';
import Button from '@material-ui/core/Button';
import Paper from '@material-ui/core/Paper';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import FullScreenDialog from '../../UI/FullScreenDialog';
import messages from './CommunicationSupport.messages';
import './CommunicationSupport.css';

function StatRow({ label, count }) {
  return (
    <ListItem>
      <ListItemText
        primary={label}
        secondary={
          <span>
            <FormattedMessage {...messages.countLabel} />: {count}
          </span>
        }
      />
    </ListItem>
  );
}

StatRow.propTypes = {
  label: PropTypes.node.isRequired,
  count: PropTypes.number.isRequired
};

export default function CommunicationSupportSettings({
  onClose,
  savedCount,
  historyCount,
  isLogged,
  syncMessage,
  serviceMessage,
  serviceChecking,
  aiMessage,
  aiChecking,
  aiTestMessage,
  aiTesting,
  onSyncNow,
  onUploadLocal,
  onCheckService,
  onCheckAi,
  onTestAi,
  onExportJson,
  onImportJson,
  onClearSaved,
  onClearHistory,
  titleOverride,
  summaryOverride
}) {
  return (
    <FullScreenDialog
      open
      title={titleOverride || <FormattedMessage {...messages.title} />}
      onClose={onClose}
    >
      <Paper className="CommunicationSupportSettings">
        <div className="CommunicationSupportSettings__summary">
          {summaryOverride || <FormattedMessage {...messages.summary} />}
        </div>

        <List>
          <StatRow
            label={<FormattedMessage {...messages.savedPhrases} />}
            count={savedCount}
          />
          <Divider />
          <StatRow
            label={<FormattedMessage {...messages.history} />}
            count={historyCount}
          />
          <Divider />
          <ListItem>
            <ListItemText
              primary={<FormattedMessage {...messages.syncState} />}
              secondary={
                syncMessage || (
                  <FormattedMessage
                    {...(isLogged ? messages.syncLoggedIn : messages.syncGuest)}
                  />
                )
              }
            />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary={<FormattedMessage {...messages.aiTestState} />}
              secondary={
                aiTestMessage || (
                  <FormattedMessage
                    {...(isLogged
                      ? messages.aiTestUnknown
                      : messages.aiTestLoginRequired)}
                  />
                )
              }
            />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary={<FormattedMessage {...messages.serviceState} />}
              secondary={
                serviceMessage || (
                  <FormattedMessage {...messages.serviceUnknown} />
                )
              }
            />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary={<FormattedMessage {...messages.aiState} />}
              secondary={
                aiMessage || (
                  <FormattedMessage
                    {...(isLogged
                      ? messages.aiUnknown
                      : messages.aiLoginRequired)}
                  />
                )
              }
            />
          </ListItem>
        </List>

        <div className="CommunicationSupportSettings__actions">
          <Button
            color="primary"
            variant="contained"
            onClick={onSyncNow}
            disabled={!isLogged}
          >
            <FormattedMessage {...messages.syncNow} />
          </Button>
          <Button
            color="primary"
            variant="outlined"
            onClick={onUploadLocal}
            disabled={!isLogged}
          >
            <FormattedMessage {...messages.uploadLocal} />
          </Button>
          <Button
            color="primary"
            variant="outlined"
            onClick={onCheckService}
            disabled={serviceChecking}
          >
            <FormattedMessage
              {...(serviceChecking
                ? messages.checkingService
                : messages.checkService)}
            />
          </Button>
          <Button
            color="primary"
            variant="outlined"
            onClick={onCheckAi}
            disabled={!isLogged || aiChecking}
          >
            <FormattedMessage
              {...(aiChecking ? messages.checkingAi : messages.checkAi)}
            />
          </Button>
          <Button
            color="primary"
            variant="outlined"
            onClick={onTestAi}
            disabled={!isLogged || aiTesting}
          >
            <FormattedMessage
              {...(aiTesting ? messages.testingAi : messages.testAi)}
            />
          </Button>
          <Button color="primary" variant="outlined" onClick={onExportJson}>
            <FormattedMessage {...messages.exportJson} />
          </Button>
          <Button component="label" color="primary" variant="outlined">
            <FormattedMessage {...messages.importJson} />
            <input
              hidden
              accept="application/json"
              type="file"
              onChange={onImportJson}
            />
          </Button>
          <Button color="primary" variant="outlined" onClick={onClearSaved}>
            <FormattedMessage {...messages.clearSaved} />
          </Button>
          <Button color="secondary" variant="outlined" onClick={onClearHistory}>
            <FormattedMessage {...messages.clearHistory} />
          </Button>
        </div>
      </Paper>
    </FullScreenDialog>
  );
}

CommunicationSupportSettings.propTypes = {
  onClose: PropTypes.func.isRequired,
  savedCount: PropTypes.number.isRequired,
  historyCount: PropTypes.number.isRequired,
  isLogged: PropTypes.bool.isRequired,
  syncMessage: PropTypes.string,
  serviceMessage: PropTypes.string,
  serviceChecking: PropTypes.bool.isRequired,
  aiMessage: PropTypes.string,
  aiChecking: PropTypes.bool.isRequired,
  aiTestMessage: PropTypes.string,
  aiTesting: PropTypes.bool.isRequired,
  onSyncNow: PropTypes.func.isRequired,
  onUploadLocal: PropTypes.func.isRequired,
  onCheckService: PropTypes.func.isRequired,
  onCheckAi: PropTypes.func.isRequired,
  onTestAi: PropTypes.func.isRequired,
  onExportJson: PropTypes.func.isRequired,
  onImportJson: PropTypes.func.isRequired,
  onClearSaved: PropTypes.func.isRequired,
  onClearHistory: PropTypes.func.isRequired,
  titleOverride: PropTypes.node,
  summaryOverride: PropTypes.node
};

CommunicationSupportSettings.defaultProps = {
  syncMessage: '',
  serviceMessage: '',
  aiMessage: '',
  aiTestMessage: '',
  titleOverride: null,
  summaryOverride: null
};
