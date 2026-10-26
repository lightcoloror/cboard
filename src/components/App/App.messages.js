import { defineMessages } from 'react-intl';

export default defineMessages({
  save: {
    id: 'cboard.components.App.save',
    defaultMessage: 'Save'
  },
  newContentAvailable: {
    id: 'cboard.components.App.newContentAvailable',
    defaultMessage: 'New content is available; please refresh.'
  },
  contentIsCached: {
    id: 'cboard.components.App.contentIsCached',
    defaultMessage: 'Content is cached for offline use.'
  },
  offlinePreparing: {
    id: 'cboard.components.App.offlinePreparing',
    defaultMessage:
      'Preparing the offline page. Stay online until the page is ready.'
  },
  offlineReady: {
    id: 'cboard.components.App.offlineReady',
    defaultMessage:
      'Offline page ready. Pictures saved on this device can be used offline; online picture search and cloud features still need a connection.'
  },
  offlineError: {
    id: 'cboard.components.App.offlineError',
    defaultMessage:
      'The offline page is not ready. Reconnect and refresh to retry. Existing data on this device has not been deleted.'
  },
  offlineUnavailable: {
    id: 'cboard.components.App.offlineUnavailable',
    defaultMessage:
      'Offline page preparation is unavailable in this environment. Please stay online.'
  }
});
