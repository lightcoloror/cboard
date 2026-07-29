import { createBrowserNetworkStatusPort } from './browserNetworkStatus';

function createTarget(onLine = true) {
  const listeners = {
    online: new Set(),
    offline: new Set()
  };
  const target = {
    navigator: { onLine },
    addEventListener: jest.fn((eventName, listener) => {
      listeners[eventName].add(listener);
    }),
    removeEventListener: jest.fn((eventName, listener) => {
      listeners[eventName].delete(listener);
    })
  };

  return {
    target,
    emit(eventName) {
      listeners[eventName].forEach(listener => listener());
    }
  };
}

describe('browser communication network status port', () => {
  test('reads the current browser connection state', () => {
    expect(
      createBrowserNetworkStatusPort(createTarget(true).target).getCurrent()
    ).toEqual({
      availability: 'online',
      networkType: 'browser'
    });
    expect(
      createBrowserNetworkStatusPort(createTarget(false).target).getCurrent()
    ).toEqual({
      availability: 'offline',
      networkType: 'none'
    });
  });

  test('forwards browser changes and removes both exact listeners', () => {
    const harness = createTarget(true);
    const port = createBrowserNetworkStatusPort(harness.target);
    const listener = jest.fn();
    const unsubscribe = port.subscribe(listener);

    harness.target.navigator.onLine = false;
    harness.emit('offline');

    expect(listener).toHaveBeenCalledWith({
      availability: 'offline',
      networkType: 'none'
    });

    unsubscribe();
    expect(harness.target.removeEventListener).toHaveBeenCalledTimes(2);
    harness.target.navigator.onLine = true;
    harness.emit('online');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('degrades to unknown without a browser event target', () => {
    const port = createBrowserNetworkStatusPort(null);
    const unsubscribe = port.subscribe(jest.fn());

    expect(port.getCurrent()).toEqual({
      availability: 'unknown',
      networkType: 'unknown'
    });
    expect(() => unsubscribe()).not.toThrow();
  });
});
