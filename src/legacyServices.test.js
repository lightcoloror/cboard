jest.mock('@redux-beacon/google-analytics-gtag', () => ({
  __esModule: true,
  default: jest.fn(() => jest.fn()),
  trackEvent: jest.fn(() => jest.fn())
}));
jest.mock('@redux-beacon/offline-web', () => jest.fn());
jest.mock('redux-beacon', () => ({ createMiddleware: jest.fn() }));
jest.mock('./constants', () => ({
  NODE_ENV: 'production',
  AZURE_INST_KEY: 'test-only'
}));
jest.mock('@microsoft/applicationinsights-web', () => ({
  ApplicationInsights: jest.fn().mockImplementation(() => ({
    loadAppInsights: jest.fn(),
    trackPageView: jest.fn(),
    addDependencyInitializer: jest.fn()
  }))
}));

describe('care build external service isolation', () => {
  const original = process.env.REACT_APP_CARE_COLLABORATION;
  afterEach(() => {
    if (original === undefined) delete process.env.REACT_APP_CARE_COLLABORATION;
    else process.env.REACT_APP_CARE_COLLABORATION = original;
  });
  test.each(['true', 'false'])('telemetry follows care flag %s', flag => {
    jest.resetModules();
    process.env.REACT_APP_CARE_COLLABORATION = flag;
    const ga = require('@redux-beacon/google-analytics-gtag').default;
    const offline = require('@redux-beacon/offline-web');
    const middleware = require('./analytics').default;
    const { appInsights, initializeAppInsights } = require('./appInsights');
    const {
      ApplicationInsights
    } = require('@microsoft/applicationinsights-web');
    initializeAppInsights();
    if (flag === 'true') {
      expect(ga).not.toHaveBeenCalled();
      expect(offline).not.toHaveBeenCalled();
      expect(appInsights.loadAppInsights).not.toHaveBeenCalled();
      expect(appInsights.trackPageView).not.toHaveBeenCalled();
      expect(ApplicationInsights.mock.calls[0][0].config.disableTelemetry).toBe(
        true
      );
      const next = jest.fn(action => action);
      const action = { type: 'CARE_LOCAL_ACTION' };
      expect(middleware({})(next)(action)).toBe(action);
      expect(next).toHaveBeenCalledTimes(1);
    } else {
      expect(ga).toHaveBeenCalledTimes(1);
      expect(appInsights.loadAppInsights).toHaveBeenCalledTimes(1);
    }
  });
});
