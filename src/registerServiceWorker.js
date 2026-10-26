// The production worker precaches the page during install, then claims it during
// activation. A completed install alone does not make the current page offline-ready.

export function runWhenPageLoaded(callback) {
  if (document.readyState === 'complete') {
    callback();
    return () => {};
  }

  window.addEventListener('load', callback, { once: true });
  return () => window.removeEventListener('load', callback);
}

export default function register(
  onNewContentAvailable = () => {},
  onContentCached = () => {},
  onReadinessChange = () => {}
) {
  let stopped = false;
  let registration;
  let failed = false;
  let lastStatus;
  let cachedNotified = false;
  const cleanups = [];
  const watched = new Set();
  const notifiedUpdates = new Set();
  const serviceWorker = navigator.serviceWorker;
  let pageVersion = serviceWorker && serviceWorker.controller;

  const report = status => {
    if (stopped || status === lastStatus) return;
    lastStatus = status;
    onReadinessChange({ status });
  };
  const cleanup = () => {
    stopped = true;
    cleanups.forEach(remove => remove());
  };
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler);
    cleanups.push(() => target.removeEventListener(event, handler));
  };

  if (
    process.env.NODE_ENV !== 'production' ||
    !serviceWorker ||
    window.isSecureContext === false
  ) {
    report('unavailable');
    return cleanup;
  }

  const publicUrl = new URL(
    process.env.PUBLIC_URL || '/',
    window.location.href
  );
  if (publicUrl.origin !== window.location.origin) {
    report('unavailable');
    return cleanup;
  }
  const swUrl = new URL(
    `${publicUrl.pathname.replace(/\/$/, '')}/service-worker.js`,
    publicUrl.origin
  ).href;

  const watchWorker = worker => {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    let previousState = worker.state;
    listen(worker, 'statechange', () => {
      // Retiring an already active version is a normal update transition.
      if (worker.state === 'redundant' && previousState !== 'activated') {
        failed = true;
      }
      previousState = worker.state;
      updateReadiness();
    });
  };
  const updateReadiness = () => {
    if (stopped) return;
    if (registration) {
      watchWorker(registration.installing);
      watchWorker(registration.waiting);
      watchWorker(registration.active);
    }
    const active = registration && registration.active;
    const ready =
      active &&
      active.state === 'activated' &&
      active === serviceWorker.controller &&
      active.scriptURL === swUrl;

    if (!ready) {
      report(failed ? 'error' : 'preparing');
      return;
    }

    report('ready');
    if (pageVersion && active !== pageVersion) {
      if (!notifiedUpdates.has(active)) {
        notifiedUpdates.add(active);
        onNewContentAvailable();
      }
    } else if (!pageVersion && !cachedNotified) {
      pageVersion = active;
      cachedNotified = true;
      onContentCached();
    }
  };
  const observeRegistration = next => {
    if (stopped || !next) return;
    registration = next;
    if (!watched.has(next)) {
      watched.add(next);
      listen(next, 'updatefound', () => {
        failed = false;
        updateReadiness();
      });
    }
    updateReadiness();
  };

  report('preparing');
  listen(serviceWorker, 'controllerchange', updateReadiness);
  cleanups.push(
    runWhenPageLoaded(() => {
      // Recover readiness on a reopen even when the network registration fails.
      // Never unregister a usable old worker as a side effect of that failure.
      if (typeof serviceWorker.getRegistration === 'function') {
        serviceWorker
          .getRegistration(swUrl)
          .then(existing => {
            if (!registration) observeRegistration(existing);
          })
          .catch(() => {});
      }

      const hostname = window.location.hostname;
      const isLocalhost =
        hostname === 'localhost' ||
        hostname === '[::1]' ||
        /^127(?:\.\d{1,3}){3}$/.test(hostname);
      const check = isLocalhost
        ? fetch(swUrl).then(response => {
            const contentType = response.headers.get('content-type') || '';
            if (!response.ok || !contentType.includes('javascript')) {
              throw new Error('Service worker script is unavailable');
            }
          })
        : Promise.resolve();

      check
        .then(() => {
          if (!stopped) return serviceWorker.register(swUrl);
        })
        .then(observeRegistration)
        .catch(error => {
          if (stopped) return;
          failed = true;
          updateReadiness();
          console.error('Error during service worker registration:', error);
        });
    })
  );
  return cleanup;
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.unregister();
    });
  }
}
