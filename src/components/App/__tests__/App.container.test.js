import { AppContainer, resetSyncThrottle } from '../App.container';
import { setDemoModeOverride } from '../../../demoMode';

jest.mock('../App.component', () => () => null);
jest.mock('../App.messages', () => ({
  __esModule: true,
  default: {
    newContentAvailable: {
      defaultMessage: 'New content is available; please refresh.'
    },
    contentIsCached: {
      defaultMessage: 'Content is cached for offline use.'
    }
  }
}));

describe('AppContainer.handleDataRefresh', () => {
  const buildInstance = (props = {}) => {
    const instance = new AppContainer();
    instance.props = {
      isLogged: true,
      getApiObjects: jest.fn(() => Promise.resolve()),
      ...props
    };
    return instance;
  };

  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    resetSyncThrottle();
    setDemoModeOverride(null);
    Object.defineProperty(window.navigator, 'onLine', {
      value: true,
      configurable: true
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    setDemoModeOverride(null);
    Object.defineProperty(window.navigator, 'onLine', {
      value: originalOnLine,
      configurable: true
    });
    jest.restoreAllMocks();
  });

  it('dispatches a sync when the throttle window has not started', () => {
    const getApiObjects = jest.fn(() => Promise.resolve());
    const instance = buildInstance({ getApiObjects });

    instance.handleDataRefresh('App started');

    expect(getApiObjects).toHaveBeenCalledTimes(1);
  });

  it('skips sync when throttled', () => {
    const getApiObjects = jest.fn(() => Promise.resolve());
    const instance = buildInstance({ getApiObjects });

    instance.handleDataRefresh('App started');
    instance.handleDataRefresh('Tab focused');

    expect(getApiObjects).toHaveBeenCalledTimes(1);
  });

  it('keeps the throttle across a remount (new instance)', () => {
    const getApiObjects = jest.fn(() => Promise.resolve());
    const firstMount = buildInstance({ getApiObjects });
    firstMount.handleDataRefresh('App started');

    const secondMount = buildInstance({ getApiObjects });
    secondMount.handleDataRefresh('App started');

    expect(getApiObjects).toHaveBeenCalledTimes(1);
  });

  it('skips sync when offline', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      value: false,
      configurable: true
    });
    const getApiObjects = jest.fn();
    const instance = buildInstance({ getApiObjects });

    instance.handleDataRefresh('App started');

    expect(getApiObjects).not.toHaveBeenCalled();
  });

  it('skips sync when not logged in', () => {
    const getApiObjects = jest.fn();
    const instance = buildInstance({ isLogged: false, getApiObjects });

    instance.handleDataRefresh('App started');

    expect(getApiObjects).not.toHaveBeenCalled();
  });

  it('never syncs an authenticated browser while it is on the demo route', () => {
    setDemoModeOverride(true);
    const getApiObjects = jest.fn();
    const instance = buildInstance({ isLogged: true, getApiObjects });

    instance.handleDataRefresh('Demo opened');

    expect(getApiObjects).not.toHaveBeenCalled();
  });
});

describe('AppContainer service worker notifications', () => {
  const buildInstance = () => {
    const instance = new AppContainer();
    instance.props = {
      intl: {
        formatMessage: descriptor => descriptor.defaultMessage
      },
      showNotification: jest.fn()
    };
    return instance;
  };

  it('offers a refresh action when a new PWA version is ready', () => {
    const instance = buildInstance();

    instance.handleNewContentAvailable();

    expect(instance.props.showNotification).toHaveBeenCalledWith(
      'New content is available; please refresh.',
      'refresh'
    );
  });

  it('announces when the application is cached for offline use', () => {
    const instance = buildInstance();

    instance.handleContentCached();

    expect(instance.props.showNotification).toHaveBeenCalledWith(
      'Content is cached for offline use.'
    );
  });
});
