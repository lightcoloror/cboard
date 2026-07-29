import { normalizeCommunicationNetworkStatus } from './networkStatus';

function resolveBrowserTarget() {
  return typeof window !== 'undefined' ? window : null;
}

export function createBrowserNetworkStatusPort(
  target = resolveBrowserTarget()
) {
  function getCurrent() {
    const isConnected =
      target && target.navigator && typeof target.navigator.onLine === 'boolean'
        ? target.navigator.onLine
        : undefined;

    return normalizeCommunicationNetworkStatus({
      isConnected,
      networkType:
        typeof isConnected === 'boolean'
          ? isConnected
            ? 'browser'
            : 'none'
          : 'unknown'
    });
  }

  function subscribe(listener) {
    if (
      !target ||
      typeof target.addEventListener !== 'function' ||
      typeof target.removeEventListener !== 'function'
    ) {
      return () => {};
    }

    const handleChange = () => listener(getCurrent());
    target.addEventListener('online', handleChange);
    target.addEventListener('offline', handleChange);

    return () => {
      target.removeEventListener('online', handleChange);
      target.removeEventListener('offline', handleChange);
    };
  }

  return { getCurrent, subscribe };
}

export const browserNetworkStatusPort = createBrowserNetworkStatusPort();
