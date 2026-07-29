import { defineMessages } from 'react-intl';

export default defineMessages({
  title: {
    id: 'cboard.components.Settings.CommunicationSupport.title',
    defaultMessage: 'Communication Support'
  },
  summary: {
    id: 'cboard.components.Settings.CommunicationSupport.summary',
    defaultMessage:
      'Manage saved phrases, receiver history, and account sync for communication support tools.'
  },
  savedPhrases: {
    id: 'cboard.components.Settings.CommunicationSupport.savedPhrases',
    defaultMessage: 'Saved phrases'
  },
  history: {
    id: 'cboard.components.Settings.CommunicationSupport.history',
    defaultMessage: 'Receiver history'
  },
  countLabel: {
    id: 'cboard.components.Settings.CommunicationSupport.countLabel',
    defaultMessage: 'Items'
  },
  syncState: {
    id: 'cboard.components.Settings.CommunicationSupport.syncState',
    defaultMessage: 'Sync state'
  },
  syncLoggedIn: {
    id: 'cboard.components.Settings.CommunicationSupport.syncLoggedIn',
    defaultMessage:
      'Signed in. Communication support data can sync through your Cboard settings.'
  },
  syncGuest: {
    id: 'cboard.components.Settings.CommunicationSupport.syncGuest',
    defaultMessage:
      'Guest mode. Communication support data is currently stored only on this device.'
  },
  serviceState: {
    id: 'cboard.components.Settings.CommunicationSupport.serviceState',
    defaultMessage: 'CBoard cloud service'
  },
  serviceUnknown: {
    id: 'cboard.components.Settings.CommunicationSupport.serviceUnknown',
    defaultMessage:
      'Check the API, database, communication indexes, and private picture storage without sending account or communication data.'
  },
  serviceReady: {
    id: 'cboard.components.Settings.CommunicationSupport.serviceReady',
    defaultMessage:
      'API, database, communication indexes, and private picture storage are ready.'
  },
  serviceReadyWithoutPrivatePictures: {
    id:
      'cboard.components.Settings.CommunicationSupport.serviceReadyWithoutPrivatePictures',
    defaultMessage:
      'API, database, and communication indexes are ready. Private picture cloud storage is not configured; local backup remains available.'
  },
  serviceDegraded: {
    id: 'cboard.components.Settings.CommunicationSupport.serviceDegraded',
    defaultMessage:
      'The API responded, but its database or communication indexes are not ready. Offline communication remains available.'
  },
  serviceFailed: {
    id: 'cboard.components.Settings.CommunicationSupport.serviceFailed',
    defaultMessage:
      'The CBoard API could not be reached. Offline communication remains available.'
  },
  checkService: {
    id: 'cboard.components.Settings.CommunicationSupport.checkService',
    defaultMessage: 'Check cloud service'
  },
  checkingService: {
    id: 'cboard.components.Settings.CommunicationSupport.checkingService',
    defaultMessage: 'Checking cloud service...'
  },
  aiState: {
    id: 'cboard.components.Settings.CommunicationSupport.aiState',
    defaultMessage: 'Optional enhancement services'
  },
  aiUnknown: {
    id: 'cboard.components.Settings.CommunicationSupport.aiUnknown',
    defaultMessage:
      'Check optional AI, image, dialect speech, background removal, and speech services. Local communication remains available.'
  },
  aiLoginRequired: {
    id: 'cboard.components.Settings.CommunicationSupport.aiLoginRequired',
    defaultMessage:
      'Sign in to check optional enhancement services. Local communication remains available.'
  },
  aiUnavailable: {
    id: 'cboard.components.Settings.CommunicationSupport.aiUnavailable',
    defaultMessage:
      'The API is available, but no optional enhancement provider is configured. Local rules remain active.'
  },
  aiReady: {
    id: 'cboard.components.Settings.CommunicationSupport.aiReady',
    defaultMessage: 'Available: {provider} / {model}'
  },
  imageAiReady: {
    id: 'cboard.components.Settings.CommunicationSupport.imageAiReady',
    defaultMessage: 'Image OCR and pictogram suggestions configured'
  },
  dialectAsrReady: {
    id: 'cboard.components.Settings.CommunicationSupport.dialectAsrReady',
    defaultMessage: 'Cantonese ASR: {provider} / {engine}'
  },
  backgroundRemovalReady: {
    id:
      'cboard.components.Settings.CommunicationSupport.backgroundRemovalReady',
    defaultMessage: 'Background removal: {provider}'
  },
  speechReady: {
    id: 'cboard.components.Settings.CommunicationSupport.speechReady',
    defaultMessage: 'Fallback speech: {provider} / {model}'
  },
  enhancementLimitsReady: {
    id:
      'cboard.components.Settings.CommunicationSupport.enhancementLimitsReady',
    defaultMessage:
      'Cost protection: {pointsPerMinute} points/minute, {monthlyPoints} points/month'
  },
  aiTokenQuotaConfigured: {
    id:
      'cboard.components.Settings.CommunicationSupport.aiTokenQuotaConfigured',
    defaultMessage: 'AI token allowance: {limitTokens} tokens/month'
  },
  aiTokenQuotaRemaining: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTokenQuotaRemaining',
    defaultMessage:
      'AI token allowance {month}: {remainingTokens} of {limitTokens} remaining'
  },
  aiUsageReady: {
    id: 'cboard.components.Settings.CommunicationSupport.aiUsageReady',
    defaultMessage:
      'Usage {month}: {totalTokens} provider-reported tokens across {requestCount} calls'
  },
  aiUsageUnreported: {
    id: 'cboard.components.Settings.CommunicationSupport.aiUsageUnreported',
    defaultMessage:
      'Usage {month}: {totalTokens} provider-reported tokens across {requestCount} calls; {unreportedRequestCount} calls did not report token totals'
  },
  aiUsageEmpty: {
    id: 'cboard.components.Settings.CommunicationSupport.aiUsageEmpty',
    defaultMessage: 'Usage {month}: no metered model calls yet'
  },
  enhancementsReady: {
    id: 'cboard.components.Settings.CommunicationSupport.enhancementsReady',
    defaultMessage: 'Configured: {capabilities}'
  },
  aiFailed: {
    id: 'cboard.components.Settings.CommunicationSupport.aiFailed',
    defaultMessage:
      'Enhancement status could not be checked. Local communication remains available.'
  },
  checkAi: {
    id: 'cboard.components.Settings.CommunicationSupport.checkAi',
    defaultMessage: 'Check enhancement services'
  },
  checkingAi: {
    id: 'cboard.components.Settings.CommunicationSupport.checkingAi',
    defaultMessage: 'Checking enhancement services...'
  },
  aiTestState: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestState',
    defaultMessage: 'Live AI connection test'
  },
  aiTestUnknown: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestUnknown',
    defaultMessage:
      'Sends only the fixed labels “I” and “drink water”. It does not use patient data or history, and a successful test consumes one enhancement request.'
  },
  aiTestLoginRequired: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestLoginRequired',
    defaultMessage: 'Sign in to run the live AI connection test.'
  },
  aiTestSuccess: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestSuccess',
    defaultMessage: 'Live AI test succeeded: {candidate}'
  },
  aiTestRateLimited: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestRateLimited',
    defaultMessage:
      'The live AI test is temporarily rate-limited. Try again later; local communication remains available.'
  },
  aiTestMonthlyQuota: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestMonthlyQuota',
    defaultMessage:
      'The monthly enhancement quota is exhausted. Local communication remains available.'
  },
  aiTestTimedOut: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestTimedOut',
    defaultMessage:
      'The live AI test timed out after 10 seconds. Check the provider or network; local communication remains available.'
  },
  aiTestFailed: {
    id: 'cboard.components.Settings.CommunicationSupport.aiTestFailed',
    defaultMessage:
      'The live AI test failed. Configuration may exist, but the model is not currently usable; local communication remains available.'
  },
  testAi: {
    id: 'cboard.components.Settings.CommunicationSupport.testAi',
    defaultMessage: 'Run live AI test'
  },
  testingAi: {
    id: 'cboard.components.Settings.CommunicationSupport.testingAi',
    defaultMessage: 'Running live AI test...'
  },
  syncSuccess: {
    id: 'cboard.components.Settings.CommunicationSupport.syncSuccess',
    defaultMessage: 'Remote settings synced successfully.'
  },
  syncFailed: {
    id: 'cboard.components.Settings.CommunicationSupport.syncFailed',
    defaultMessage: 'Remote sync failed. Local data is still available.'
  },
  syncSuccessWithSummary: {
    id:
      'cboard.components.Settings.CommunicationSupport.syncSuccessWithSummary',
    defaultMessage:
      'Sync complete: {remoteAdded} remote items added locally, {localAdded} local items added to cloud, {conflicts} settings conflicts resolved ({localWins} local / {remoteWins} remote), {savedPhraseConflicts} saved phrase conflicts remain reviewable, and {receiverConflicts} confirmed receiver record conflicts kept the server version.'
  },
  syncPartial: {
    id: 'cboard.components.Settings.CommunicationSupport.syncPartial',
    defaultMessage:
      'Some communication data is still pending. Local data and delete markers are safe.'
  },
  uploadSuccess: {
    id: 'cboard.components.Settings.CommunicationSupport.uploadSuccess',
    defaultMessage:
      'Local communication support data was uploaded to your account.'
  },
  uploadSuccessWithReceiverConflicts: {
    id:
      'cboard.components.Settings.CommunicationSupport.uploadSuccessWithReceiverConflicts',
    defaultMessage:
      'Local communication support data was uploaded. {savedPhraseConflicts} saved phrase conflicts remain reviewable and {receiverConflicts} confirmed receiver record conflicts kept the server-confirmed content.'
  },
  importSuccess: {
    id: 'cboard.components.Settings.CommunicationSupport.importSuccess',
    defaultMessage:
      'Communication support data was imported and merged locally.'
  },
  importSuccessWithReceiverConflicts: {
    id:
      'cboard.components.Settings.CommunicationSupport.importSuccessWithReceiverConflicts',
    defaultMessage:
      'Communication support data was imported. {savedPhraseConflicts} saved phrase conflicts remain reviewable and {receiverConflicts} confirmed receiver record conflicts kept the server-confirmed content.'
  },
  importFailed: {
    id: 'cboard.components.Settings.CommunicationSupport.importFailed',
    defaultMessage: 'The selected file could not be imported.'
  },
  syncNow: {
    id: 'cboard.components.Settings.CommunicationSupport.syncNow',
    defaultMessage: 'Sync now'
  },
  uploadLocal: {
    id: 'cboard.components.Settings.CommunicationSupport.uploadLocal',
    defaultMessage: 'Upload local to cloud'
  },
  exportJson: {
    id: 'cboard.components.Settings.CommunicationSupport.exportJson',
    defaultMessage: 'Export JSON'
  },
  importJson: {
    id: 'cboard.components.Settings.CommunicationSupport.importJson',
    defaultMessage: 'Import JSON'
  },
  clearSaved: {
    id: 'cboard.components.Settings.CommunicationSupport.clearSaved',
    defaultMessage: 'Clear saved phrases'
  },
  clearHistory: {
    id: 'cboard.components.Settings.CommunicationSupport.clearHistory',
    defaultMessage: 'Clear history'
  }
});
