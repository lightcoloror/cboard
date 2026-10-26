import { createStore, applyMiddleware, compose } from 'redux';
import thunk from 'redux-thunk';
import { persistStore } from 'redux-persist';
import googleAnalytics from './analytics';
import createReducer, { createPersistenceContext } from './reducers';
import { createVerifiedBoardPersistence } from './common/communicationSupport/verifiedBoardPersistence';
import { createWebGalleryTileUndo } from './common/communicationSupport/webGalleryTileUndo';
let store;

export default function configureStore(initialState = {}, options = {}) {
  const services = {};
  const boundThunk = thunk.withExtraArgument(services);
  const middlewares = options.demoMode ? [boundThunk] : [boundThunk, googleAnalytics];
  const enhancers = [applyMiddleware(...middlewares)];

  // If Redux DevTools Extension is installed use it, otherwise use Redux compose
  /* eslint-disable no-underscore-dangle */
  const composeEnhancers =
    process.env.NODE_ENV !== 'production' &&
    typeof window === 'object' &&
    window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
      ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
      : compose;

  const persistence = options.persistence || createPersistenceContext(options);
  const configuredStore = createStore(
    createReducer({ ...options, persistence }),
    initialState,
    composeEnhancers(...enhancers)
  );
  // Care's registered identity resolver reads getStore() while local services
  // capture their initial scope. Publish this store before those initializers.
  store = configuredStore;

  const persistor = persistStore(configuredStore);
  services.verifiedBoardPersistence = createVerifiedBoardPersistence({ store: configuredStore, persistor, persistence });
  services.galleryTileUndo = createWebGalleryTileUndo({ store: configuredStore, persistence: services.verifiedBoardPersistence });

  return { persistor, store: configuredStore };
}

export const getStore = () => store;
