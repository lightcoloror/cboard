import { cvaTrackEvent } from './cordova-util';

describe('optional Cordova analytics', () => {
  const originalCordova = window.cordova;
  const originalFirebasePlugin = window.FirebasePlugin;

  afterEach(() => {
    window.cordova = originalCordova;
    window.FirebasePlugin = originalFirebasePlugin;
  });

  test('does not require Firebase in a local Android core package', () => {
    window.cordova = { platformId: 'android' };
    window.FirebasePlugin = undefined;

    expect(() =>
      cvaTrackEvent('communication', 'receiver confirmed', 'local')
    ).not.toThrow();
  });

  test('keeps using Firebase analytics when the release plugin is present', () => {
    const logEvent = jest.fn();
    window.cordova = { platformId: 'android' };
    window.FirebasePlugin = { logEvent };

    cvaTrackEvent('communication', 'receiver confirmed', 'local');

    expect(logEvent).toHaveBeenCalledWith('receiver_confirmed', {
      event_category: 'communication',
      event_label: 'local'
    });
  });
});
