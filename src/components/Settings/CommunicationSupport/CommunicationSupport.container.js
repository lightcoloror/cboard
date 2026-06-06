import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { injectIntl } from 'react-intl';
import API from '../../../api';
import {
  COMMUNICATION_SUPPORT_EXPORT_FILENAME,
  createCommunicationSupportSettingsPatch,
  getCommunicationSupportSettings
} from '../../../common/communicationSupport/settingsAdapter';
import {
  buildCommunicationSettingsPayload,
  loadCommunicationHistory,
  loadCommunicationSavedPhrases,
  mergeCommunicationSettings,
  normalizeCommunicationSettings,
  overwriteCommunicationHistory,
  overwriteCommunicationSavedPhrases,
  overwriteCommunicationSettings
} from '../../../common/communicationSupport/localData';
import messages from './CommunicationSupport.messages';
import CommunicationSupportSettings from './CommunicationSupport.component';

export class CommunicationSupportContainer extends PureComponent {
  state = {
    savedCount: 0,
    historyCount: 0,
    syncMessage: ''
  };

  componentDidMount() {
    this.refreshCounts();
  }

  refreshCounts = () => {
    this.setState({
      savedCount: loadCommunicationSavedPhrases().length,
      historyCount: loadCommunicationHistory().length
    });
  };

  getLocalSettings = () => {
    return buildCommunicationSettingsPayload(
      loadCommunicationSavedPhrases(),
      loadCommunicationHistory()
    );
  };

  setSyncMessage = messageDescriptor => {
    this.setState({
      syncMessage: this.props.intl.formatMessage(messageDescriptor)
    });
  };

  syncRemote = async () => {
    if (!this.props.isLogged) {
      return;
    }

    try {
      const settings = await API.getSettings();
      const mergedSettings = mergeCommunicationSettings(
        this.getLocalSettings(),
        getCommunicationSupportSettings(settings)
      );
      overwriteCommunicationSettings(mergedSettings);
      await API.updateSettings(
        createCommunicationSupportSettingsPatch(mergedSettings)
      );
      this.refreshCounts();
      this.setSyncMessage(messages.syncSuccess);
    } catch (error) {
      this.setSyncMessage(messages.syncFailed);
    }
  };

  uploadLocalToRemote = async () => {
    if (!this.props.isLogged) {
      return;
    }

    try {
      await API.updateSettings(
        createCommunicationSupportSettingsPatch(this.getLocalSettings())
      );
      this.setSyncMessage(messages.uploadSuccess);
    } catch (error) {
      this.setSyncMessage(messages.syncFailed);
    }
  };

  exportJson = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const payload = this.getLocalSettings();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = COMMUNICATION_SUPPORT_EXPORT_FILENAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  importJson = async event => {
    const file =
      event && event.target && event.target.files && event.target.files.length
        ? event.target.files[0]
        : null;

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const importedValue = normalizeCommunicationSettings(JSON.parse(text));
      const merged = mergeCommunicationSettings(
        this.getLocalSettings(),
        importedValue
      );
      overwriteCommunicationSettings(merged);
      this.refreshCounts();

      if (this.props.isLogged) {
        await API.updateSettings(
          createCommunicationSupportSettingsPatch(merged)
        );
      }

      this.setSyncMessage(messages.importSuccess);
    } catch (error) {
      this.setSyncMessage(messages.importFailed);
    } finally {
      if (event && event.target) {
        event.target.value = '';
      }
    }
  };

  clearSaved = async () => {
    overwriteCommunicationSavedPhrases([]);
    this.refreshCounts();

    if (this.props.isLogged) {
      try {
        await API.updateSettings(
          createCommunicationSupportSettingsPatch({
            savedPhrases: [],
            history: loadCommunicationHistory()
          })
        );
      } catch (error) {}
    }
  };

  clearHistory = async () => {
    overwriteCommunicationHistory([]);
    this.refreshCounts();

    if (this.props.isLogged) {
      try {
        await API.updateSettings(
          createCommunicationSupportSettingsPatch({
            savedPhrases: loadCommunicationSavedPhrases(),
            history: []
          })
        );
      } catch (error) {}
    }
  };

  render() {
    return (
      <CommunicationSupportSettings
        {...this.state}
        isLogged={this.props.isLogged}
        onClose={this.props.history.goBack}
        onSyncNow={this.syncRemote}
        onUploadLocal={this.uploadLocalToRemote}
        onExportJson={this.exportJson}
        onImportJson={this.importJson}
        onClearSaved={this.clearSaved}
        onClearHistory={this.clearHistory}
        titleOverride={this.props.titleOverride}
        summaryOverride={this.props.summaryOverride}
      />
    );
  }
}

const mapStateToProps = ({ app }) => ({
  isLogged: Boolean(app && app.userData && app.userData.authToken)
});

export default connect(mapStateToProps)(
  injectIntl(CommunicationSupportContainer)
);
