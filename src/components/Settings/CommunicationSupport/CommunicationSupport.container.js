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
  buildCommunicationMergePreview,
  buildCommunicationCloudSettingsPayload,
  buildCommunicationSettingsPayload,
  clearCommunicationSavedPhrases,
  loadCommunicationHistory,
  loadCommunicationSavedPhraseTombstones,
  loadCommunicationSavedPhrases,
  loadReceiverRecords,
  mergeCommunicationSettings,
  normalizeCommunicationSettings,
  overwriteCommunicationHistory,
  overwriteCommunicationSavedPhraseTombstones,
  overwriteCommunicationSavedPhrases,
  overwriteCommunicationSettings,
  overwriteReceiverRecords,
  retireAnonymousUserIdentity
} from '../../../common/communicationSupport/localData';
import {
  mergeConfirmedReceiverRecords,
  removeDeletedReceiverHistory
} from '../../../common/communicationSupport/receiverSync';
import {
  mergeVersionedCommunicationSavedPhrases,
  normalizeSavedPhraseTombstones
} from '../../../common/communicationSupport/savedPhraseSync';
import { normalizeCommunicationServiceReadiness } from '../../../common/communicationSupport/serviceReadiness';
import {
  COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES,
  getCommunicationEnhancementLimitScope
} from '../../../common/communicationSupport/communicationEnhancementError';
import messages from './CommunicationSupport.messages';
import CommunicationSupportSettings from './CommunicationSupport.component';

export class CommunicationSupportContainer extends PureComponent {
  state = {
    savedCount: 0,
    historyCount: 0,
    syncMessage: '',
    serviceMessage: '',
    serviceChecking: false,
    aiMessage: '',
    aiChecking: false,
    aiTestMessage: '',
    aiTesting: false
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

  getCloudSettings = value => {
    const settings = value || this.getLocalSettings();
    return buildCommunicationCloudSettingsPayload(
      settings.savedPhrases,
      settings.history
    );
  };

  syncReceiverRecords = async () => {
    try {
      const localRecords = loadReceiverRecords();
      const response = await API.syncConfirmedReceiverRecords(localRecords);
      const receiverRecords = mergeConfirmedReceiverRecords(
        localRecords,
        response.records,
        response.deletedRecordIds
      );
      const activeHistory = removeDeletedReceiverHistory(
        loadCommunicationHistory(),
        response.deletedRecordIds
      );
      const mergedHistory = mergeCommunicationSettings(
        { savedPhrases: [], history: activeHistory },
        { savedPhrases: [], history: response.records }
      ).history;

      overwriteReceiverRecords(receiverRecords);
      overwriteCommunicationHistory(mergedHistory);
      this.refreshCounts();
      return {
        ok: true,
        conflictCount: Number(response.conflictCount) || 0
      };
    } catch (error) {
      return { ok: false, conflictCount: 0 };
    }
  };

  syncSavedPhrases = async (legacySavedPhrases = []) => {
    try {
      let tombstones = loadCommunicationSavedPhraseTombstones();
      const pendingTombstones = tombstones.filter(
        item => item.pending === true
      );
      if (pendingTombstones.length) {
        const deletion = await API.deleteCommunicationSavedPhrases(
          pendingTombstones.map(item => item.id)
        );
        tombstones = normalizeSavedPhraseTombstones([
          ...tombstones,
          ...(deletion.deletedPhrases || [])
        ]);
        overwriteCommunicationSavedPhraseTombstones(tombstones);
      }

      const localPhrases = loadCommunicationSavedPhrases();
      const localIds = new Set(localPhrases.map(item => item.id));
      const localSentences = new Set(
        localPhrases.map(item =>
          String(item.sentence || '')
            .trim()
            .toLocaleLowerCase()
        )
      );
      const deletedIds = new Set(tombstones.map(item => item.id));
      const normalizedLegacy = normalizeCommunicationSettings({
        savedPhrases: legacySavedPhrases,
        history: []
      }).savedPhrases;
      const legacyAdditions = normalizedLegacy.filter(item => {
        const sentence = String(item.sentence || '')
          .trim()
          .toLocaleLowerCase();
        return (
          !deletedIds.has(item.id) &&
          !localIds.has(item.id) &&
          !localSentences.has(sentence)
        );
      });
      const seededPhrases = mergeCommunicationSettings(
        { savedPhrases: localPhrases, history: [] },
        { savedPhrases: legacyAdditions, history: [] }
      ).savedPhrases;
      const response = await API.syncCommunicationSavedPhrases(seededPhrases);
      const merged = mergeVersionedCommunicationSavedPhrases(
        seededPhrases,
        response.phrases,
        [...tombstones, ...(response.deletedPhrases || [])]
      );

      overwriteCommunicationSavedPhraseTombstones(merged.tombstones);
      overwriteCommunicationSavedPhrases(merged.items);
      this.refreshCounts();
      return {
        ok: true,
        conflictCount: Math.max(
          Number(response.conflictCount) || 0,
          merged.conflictCount
        )
      };
    } catch (error) {
      return { ok: false, conflictCount: 0 };
    }
  };

  setSyncMessage = (messageDescriptor, values) => {
    this.setState({
      syncMessage:
        values === undefined
          ? this.props.intl.formatMessage(messageDescriptor)
          : this.props.intl.formatMessage(messageDescriptor, values)
    });
  };

  checkAiStatus = async () => {
    if (!this.props.isLogged || this.state.aiChecking) {
      return;
    }

    this.setState({ aiChecking: true });
    try {
      const health = await API.getCommunicationAiHealth();
      const enhancementConfigured = Boolean(
        health &&
          (health.configured ||
            health.imageAiConfigured ||
            health.dialectAsrConfigured ||
            health.backgroundRemovalConfigured ||
            health.speechConfigured)
      );
      const usage = enhancementConfigured
        ? await API.getCommunicationAiUsage().catch(() => null)
        : null;
      const capabilities = [];
      if (health && health.configured) {
        capabilities.push(
          this.props.intl.formatMessage(messages.aiReady, {
            provider: health.provider || 'unknown',
            model: health.model || 'unknown'
          })
        );
      }
      if (health && health.imageAiConfigured) {
        capabilities.push(this.props.intl.formatMessage(messages.imageAiReady));
      }
      if (health && health.dialectAsrConfigured) {
        capabilities.push(
          this.props.intl.formatMessage(messages.dialectAsrReady, {
            provider: health.dialectAsrProvider || 'unknown',
            engine: health.dialectAsrEngine || 'unknown'
          })
        );
      }
      if (health && health.backgroundRemovalConfigured) {
        capabilities.push(
          this.props.intl.formatMessage(messages.backgroundRemovalReady, {
            provider: health.backgroundRemovalProvider || 'unknown'
          })
        );
      }
      if (health && health.speechConfigured) {
        capabilities.push(
          this.props.intl.formatMessage(messages.speechReady, {
            provider: health.speechProvider || 'unknown',
            model: health.speechModel || 'unknown'
          })
        );
      }
      if (
        enhancementConfigured &&
        health &&
        health.enhancementRateLimitEnabled
      ) {
        capabilities.push(
          this.props.intl.formatMessage(messages.enhancementLimitsReady, {
            pointsPerMinute: health.enhancementPointsPerMinute,
            monthlyPoints: health.enhancementMonthlyPoints
          })
        );
      }
      if (enhancementConfigured && health && health.aiTokenQuotaEnabled) {
        capabilities.push(
          this.props.intl.formatMessage(messages.aiTokenQuotaConfigured, {
            limitTokens: Number(health.aiMonthlyTokenQuota) || 0
          })
        );
      }
      if (usage && usage.tokenQuota && usage.tokenQuota.enabled) {
        capabilities.push(
          this.props.intl.formatMessage(messages.aiTokenQuotaRemaining, {
            month: usage.tokenQuota.month,
            remainingTokens: Number(usage.tokenQuota.remainingTokens) || 0,
            limitTokens: Number(usage.tokenQuota.limitTokens) || 0
          })
        );
      }
      if (usage && Number(usage.requestCount) > 0) {
        capabilities.push(
          this.props.intl.formatMessage(
            Number(usage.unreportedRequestCount) > 0
              ? messages.aiUsageUnreported
              : messages.aiUsageReady,
            {
              month: usage.month,
              totalTokens: Number(usage.totalTokens) || 0,
              requestCount: Number(usage.requestCount) || 0,
              unreportedRequestCount: Number(usage.unreportedRequestCount) || 0
            }
          )
        );
      } else if (usage) {
        capabilities.push(
          this.props.intl.formatMessage(messages.aiUsageEmpty, {
            month: usage.month
          })
        );
      }
      this.setState({
        aiMessage: capabilities.length
          ? this.props.intl.formatMessage(messages.enhancementsReady, {
              capabilities: capabilities.join('; ')
            })
          : this.props.intl.formatMessage(messages.aiUnavailable)
      });
    } catch (error) {
      this.setState({
        aiMessage: this.props.intl.formatMessage(messages.aiFailed)
      });
    } finally {
      this.setState({ aiChecking: false });
    }
  };

  testAiConnection = async () => {
    if (!this.props.isLogged || this.state.aiTesting) {
      return;
    }

    this.setState({ aiTesting: true });
    try {
      const response = await API.generateCommunicationSentences(
        {
          pictogramLabels: ['我', '喝水'],
          candidateCount: 1
        },
        { timeout: 10000 }
      );
      const candidate = String(
        response && Array.isArray(response.candidates) && response.candidates[0]
          ? response.candidates[0]
          : ''
      )
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 120);
      this.setState({
        aiTestMessage: candidate
          ? this.props.intl.formatMessage(messages.aiTestSuccess, {
              candidate
            })
          : this.props.intl.formatMessage(messages.aiTestFailed)
      });
    } catch (error) {
      const limitScope = getCommunicationEnhancementLimitScope(error);
      const message =
        error && error.code === 'ECONNABORTED'
          ? messages.aiTestTimedOut
          : limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month
          ? messages.aiTestMonthlyQuota
          : limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute
          ? messages.aiTestRateLimited
          : messages.aiTestFailed;
      this.setState({
        aiTestMessage: this.props.intl.formatMessage(message)
      });
    } finally {
      this.setState({ aiTesting: false });
    }
  };

  checkServiceStatus = async () => {
    if (this.state.serviceChecking) {
      return;
    }

    this.setState({ serviceChecking: true });
    try {
      const health = normalizeCommunicationServiceReadiness(
        await API.getCommunicationServiceHealth()
      );
      let serviceMessage = messages.serviceDegraded;
      if (!health.recognized) {
        serviceMessage = messages.serviceFailed;
      } else if (health.ready) {
        serviceMessage =
          health.privatePictureLibrary === 'configured'
            ? messages.serviceReady
            : messages.serviceReadyWithoutPrivatePictures;
      }
      this.setState({
        serviceMessage: this.props.intl.formatMessage(serviceMessage)
      });
    } catch (error) {
      this.setState({
        serviceMessage: this.props.intl.formatMessage(messages.serviceFailed)
      });
    } finally {
      this.setState({ serviceChecking: false });
    }
  };

  syncRemote = async () => {
    if (!this.props.isLogged) {
      return;
    }

    try {
      const settings = await API.getSettings();
      const remoteSettings = this.getCloudSettings(
        getCommunicationSupportSettings(settings)
      );
      const localSettings = this.getLocalSettings();
      const mergePreview = buildCommunicationMergePreview(
        localSettings,
        remoteSettings
      );
      const mergedSettings = mergeCommunicationSettings(
        { savedPhrases: [], history: localSettings.history },
        { savedPhrases: [], history: remoteSettings.history }
      );
      overwriteCommunicationHistory(mergedSettings.history);
      const savedPhraseSync = await this.syncSavedPhrases(
        remoteSettings.savedPhrases
      );
      await API.updateSettings(
        createCommunicationSupportSettingsPatch(
          this.getCloudSettings({
            savedPhrases: loadCommunicationSavedPhrases(),
            history: mergedSettings.history
          })
        )
      );
      const receiverSync = await this.syncReceiverRecords();
      this.refreshCounts();
      if (savedPhraseSync.ok && receiverSync.ok) {
        retireAnonymousUserIdentity(this.props.userId);
        this.setSyncMessage(messages.syncSuccessWithSummary, {
          remoteAdded: mergePreview.remoteOnly,
          localAdded: mergePreview.localOnly,
          conflicts: mergePreview.conflicts,
          localWins: mergePreview.localWins,
          remoteWins: mergePreview.remoteWins,
          savedPhraseConflicts: savedPhraseSync.conflictCount,
          receiverConflicts: receiverSync.conflictCount
        });
      } else {
        this.setSyncMessage(messages.syncPartial);
      }
    } catch (error) {
      this.setSyncMessage(messages.syncFailed);
    }
  };

  uploadLocalToRemote = async () => {
    if (!this.props.isLogged) {
      return;
    }

    try {
      const savedPhraseSync = await this.syncSavedPhrases();
      if (!savedPhraseSync.ok) {
        this.setSyncMessage(messages.syncPartial);
        return;
      }
      await API.updateSettings(
        createCommunicationSupportSettingsPatch(this.getCloudSettings())
      );
      const receiverSync = await this.syncReceiverRecords();
      if (!receiverSync.ok) {
        this.setSyncMessage(messages.syncPartial);
      } else {
        retireAnonymousUserIdentity(this.props.userId);
        if (savedPhraseSync.conflictCount || receiverSync.conflictCount) {
          this.setSyncMessage(messages.uploadSuccessWithReceiverConflicts, {
            savedPhraseConflicts: savedPhraseSync.conflictCount,
            receiverConflicts: receiverSync.conflictCount
          });
        } else {
          this.setSyncMessage(messages.uploadSuccess);
        }
      }
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
        const savedPhraseSync = await this.syncSavedPhrases();
        if (!savedPhraseSync.ok) {
          this.setSyncMessage(messages.syncPartial);
          return;
        }
        await API.updateSettings(
          createCommunicationSupportSettingsPatch(this.getCloudSettings(merged))
        );
        const receiverSync = await this.syncReceiverRecords();
        if (!receiverSync.ok) {
          this.setSyncMessage(messages.syncPartial);
          return;
        }
        retireAnonymousUserIdentity(this.props.userId);
        if (savedPhraseSync.conflictCount || receiverSync.conflictCount) {
          this.setSyncMessage(messages.importSuccessWithReceiverConflicts, {
            savedPhraseConflicts: savedPhraseSync.conflictCount,
            receiverConflicts: receiverSync.conflictCount
          });
          return;
        }
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
    clearCommunicationSavedPhrases({
      deletedBy: this.props.userId || 'local'
    });
    this.refreshCounts();

    if (this.props.isLogged) {
      try {
        const deletion = await API.deleteCommunicationSavedPhrases([], {
          deleteAll: true
        });
        overwriteCommunicationSavedPhraseTombstones(
          normalizeSavedPhraseTombstones([
            ...loadCommunicationSavedPhraseTombstones(),
            ...(deletion.deletedPhrases || [])
          ])
        );
        const savedPhraseSync = await this.syncSavedPhrases();
        if (!savedPhraseSync.ok) {
          this.setSyncMessage(messages.syncPartial);
          return;
        }
        await API.updateSettings(
          createCommunicationSupportSettingsPatch(
            this.getCloudSettings({
              savedPhrases: loadCommunicationSavedPhrases(),
              history: loadCommunicationHistory()
            })
          )
        );
      } catch (error) {
        this.setSyncMessage(messages.syncPartial);
      }
    }
  };

  clearHistory = async () => {
    const receiverRecordIds = loadReceiverRecords()
      .filter(entry => entry.recordStatus === 'confirmed')
      .map(entry => entry.id)
      .filter(Boolean);
    overwriteCommunicationHistory([]);
    overwriteReceiverRecords([]);
    this.refreshCounts();

    if (this.props.isLogged) {
      try {
        await API.updateSettings(
          createCommunicationSupportSettingsPatch(
            this.getCloudSettings({
              savedPhrases: loadCommunicationSavedPhrases(),
              history: []
            })
          )
        );
        await API.deleteConfirmedReceiverRecords(receiverRecordIds, {
          deleteAll: true
        });
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
        onCheckService={this.checkServiceStatus}
        onCheckAi={this.checkAiStatus}
        onTestAi={this.testAiConnection}
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
  isLogged: Boolean(app && app.userData && app.userData.authToken),
  userId: String((app && app.userData && app.userData.id) || '')
});

export default connect(mapStateToProps)(
  injectIntl(CommunicationSupportContainer)
);
