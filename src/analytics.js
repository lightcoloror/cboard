import { createMiddleware } from 'redux-beacon';
import GoogleAnalyticsGtag from '@redux-beacon/google-analytics-gtag';
import offlineWeb from '@redux-beacon/offline-web';
import { legacyServicesEnabled } from './legacyServices';
// import logger from '@redux-beacon/logger';

import boardEventsMap from './components/Board/Board.analytics';
import speechEventsMap from './providers/SpeechProvider/SpeechProvider.analytics';

const isConnected = state => state.app.isConnected;
const offlineStorage = legacyServicesEnabled ? offlineWeb(isConnected) : null;

const eventsMap = {
  ...boardEventsMap,
  ...speechEventsMap
};

const trackingId = 'UA-108091601-1';
const ga = legacyServicesEnabled ? GoogleAnalyticsGtag(trackingId) : null;

const gaMiddleware = legacyServicesEnabled
  ? createMiddleware(eventsMap, ga, {
      offlineStorage
    })
  : () => next => action => next(action);

export default gaMiddleware;
