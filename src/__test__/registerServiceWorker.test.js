import register, { unregister } from '../registerServiceWorker';

const eventTarget = values => Object.assign(new EventTarget(), values);
const dispatch = (target, event) => target.dispatchEvent(new Event(event));

describe('registerServiceWorker readiness', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const originalWorker = navigator.serviceWorker;
  const originalLocation = { ...window.location };
  let worker;
  let registration;
  let onUpdate;
  let onCached;
  let onReadiness;
  let stop;

  const flushPromises = async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  };
  const makeWorker = (state = 'installing') =>
    eventTarget({
      state,
      scriptURL: `${window.location.origin}/service-worker.js`
    });
  const begin = async () => {
    stop = register(onUpdate, onCached, onReadiness);
    await flushPromises();
  };
  const latestStatus = () => onReadiness.mock.calls.slice(-1)[0][0].status;
  const install = (state = 'installing') => {
    const next = makeWorker(state);
    registration.installing = next;
    dispatch(registration, 'updatefound');
    return next;
  };
  const activate = next => {
    registration.installing = null;
    registration.active = next;
    next.state = 'activated';
    dispatch(next, 'statechange');
  };
  const control = next => {
    worker.controller = next;
    dispatch(worker, 'controllerchange');
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_URL = '/';
    Object.assign(window.location, originalLocation);
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete'
    });
    registration = eventTarget({
      unregister: jest.fn().mockResolvedValue(true)
    });
    worker = eventTarget({
      controller: null,
      register: jest.fn().mockResolvedValue(registration),
      getRegistration: jest.fn().mockResolvedValue(undefined),
      ready: Promise.resolve(registration)
    });
    navigator.serviceWorker = worker;
    onUpdate = jest.fn();
    onCached = jest.fn();
    onReadiness = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/javascript' }
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (stop) stop();
    stop = undefined;
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    navigator.serviceWorker = originalWorker;
    Object.assign(window.location, originalLocation);
    delete document.readyState;
    jest.restoreAllMocks();
  });

  it('waits beyond installation and activation until this page is controlled', async () => {
    await begin();
    expect(worker.register).toHaveBeenCalledWith(
      `${window.location.origin}/service-worker.js`
    );
    const next = install();
    next.state = 'installed';
    dispatch(next, 'statechange');
    expect(latestStatus()).toBe('preparing');
    expect(onCached).not.toHaveBeenCalled();
    activate(next);
    expect(latestStatus()).toBe('preparing');
    control(next);
    expect(latestStatus()).toBe('ready');
    expect(onCached).toHaveBeenCalledTimes(1);
    dispatch(next, 'statechange');
    dispatch(worker, 'controllerchange');
    expect(onCached).toHaveBeenCalledTimes(1);
    expect(onReadiness.mock.calls).toEqual([
      [{ status: 'preparing' }],
      [{ status: 'ready' }]
    ]);
  });

  it('also waits for activation when controllerchange arrives first', async () => {
    await begin();
    const next = install('activating');
    registration.active = next;
    control(next);
    expect(latestStatus()).toBe('preparing');
    activate(next);
    expect(latestStatus()).toBe('ready');
  });

  it('does not confuse an old controller with the new active worker at the same URL', async () => {
    worker.controller = makeWorker('activated');
    await begin();
    const next = install();
    activate(next);
    expect(latestStatus()).toBe('preparing');
    expect(onUpdate).not.toHaveBeenCalled();
    control(next);
    expect(latestStatus()).toBe('ready');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('restores readiness for an existing controlled page without replaying notifications', async () => {
    registration.active = makeWorker('activated');
    worker.controller = registration.active;
    await begin();
    expect(latestStatus()).toBe('ready');
    expect(onCached).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('observes an installation already in progress when register resolves', async () => {
    registration.installing = makeWorker('installed');
    const next = registration.installing;
    await begin();
    expect(latestStatus()).toBe('preparing');
    activate(next);
    control(next);
    expect(latestStatus()).toBe('ready');
  });

  it('offers an update only after the new version has activated and taken control', async () => {
    registration.active = makeWorker('activated');
    worker.controller = registration.active;
    await begin();
    const next = install('installed');
    expect(onUpdate).not.toHaveBeenCalled();
    activate(next);
    expect(onUpdate).not.toHaveBeenCalled();
    control(next);
    dispatch(next, 'statechange');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onCached).not.toHaveBeenCalled();
  });

  it('reports a failed first installation instead of ready', async () => {
    await begin();
    const next = install();
    next.state = 'redundant';
    dispatch(next, 'statechange');
    expect(latestStatus()).toBe('error');
    expect(onCached).not.toHaveBeenCalled();
  });

  it('recognizes a later version update in the same initially uncontrolled page', async () => {
    await begin();
    const first = install();
    activate(first);
    control(first);
    const next = install();
    activate(next);
    control(next);
    expect(onCached).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('treats retirement of the old active worker as preparation, not a failed install', async () => {
    const old = makeWorker('activated');
    registration.active = old;
    worker.controller = old;
    await begin();
    const next = install('installed');
    next.state = 'activating';
    registration.active = next;
    old.state = 'redundant';
    dispatch(old, 'statechange');
    expect(latestStatus()).toBe('preparing');
    activate(next);
    control(next);
    expect(latestStatus()).toBe('ready');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('preserves a working old version when an update installation fails', async () => {
    registration.active = makeWorker('activated');
    worker.controller = registration.active;
    await begin();
    const next = install();
    next.state = 'redundant';
    dispatch(next, 'statechange');
    expect(latestStatus()).toBe('ready');
    expect(registration.unregister).not.toHaveBeenCalled();
  });

  it('recovers the existing worker when offline registration fails', async () => {
    registration.active = makeWorker('activated');
    worker.controller = registration.active;
    worker.getRegistration.mockResolvedValue(registration);
    const failure = new TypeError('offline');
    worker.register.mockRejectedValue(failure);
    await begin();
    expect(latestStatus()).toBe('ready');
    expect(registration.unregister).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Error during service worker registration:',
      failure
    );
  });

  it('reports registration failure when no usable cache controller exists', async () => {
    worker.register.mockRejectedValue(new TypeError('offline'));
    await begin();
    expect(latestStatus()).toBe('error');
    expect(onCached).not.toHaveBeenCalled();
    expect(registration.unregister).not.toHaveBeenCalled();
  });

  it('forwards readiness and legacy callbacks through the localhost validation path', async () => {
    Object.assign(window.location, {
      hostname: 'localhost',
      origin: 'http://localhost',
      href: 'http://localhost/board/root'
    });
    await begin();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost/service-worker.js'
    );
    const next = install();
    activate(next);
    control(next);
    expect(latestStatus()).toBe('ready');
    expect(onCached).toHaveBeenCalledTimes(1);
  });

  it('keeps a usable localhost worker when the script check fails', async () => {
    Object.assign(window.location, {
      hostname: 'localhost',
      origin: 'http://localhost',
      href: 'http://localhost/board/root'
    });
    registration.active = makeWorker('activated');
    worker.controller = registration.active;
    worker.getRegistration.mockResolvedValue(registration);
    global.fetch.mockResolvedValue({ ok: true, headers: { get: () => null } });
    await begin();
    expect(latestStatus()).toBe('ready');
    expect(worker.register).not.toHaveBeenCalled();
    expect(registration.unregister).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'])(
    'reports unavailable in %s',
    async environment => {
      process.env.NODE_ENV = environment;
      await begin();
      expect(latestStatus()).toBe('unavailable');
      expect(worker.register).not.toHaveBeenCalled();
    }
  );

  it('reports unavailable when service workers are unsupported', async () => {
    navigator.serviceWorker = undefined;
    await begin();
    expect(latestStatus()).toBe('unavailable');
  });

  it('reports unavailable for cross-origin assets', async () => {
    process.env.PUBLIC_URL = 'https://different-origin.invalid/';
    await begin();
    expect(latestStatus()).toBe('unavailable');
    expect(worker.register).not.toHaveBeenCalled();
  });

  it('removes lifecycle listeners and stops callbacks when unmounted', async () => {
    await begin();
    const next = install();
    const removeControllerListener = jest.spyOn(worker, 'removeEventListener');
    const removeRegistrationListener = jest.spyOn(
      registration,
      'removeEventListener'
    );
    const removeWorkerListener = jest.spyOn(next, 'removeEventListener');
    stop();
    activate(next);
    control(next);
    expect(latestStatus()).toBe('preparing');
    expect(onCached).not.toHaveBeenCalled();
    expect(removeControllerListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    );
    expect(removeRegistrationListener).toHaveBeenCalledWith(
      'updatefound',
      expect.any(Function)
    );
    expect(removeWorkerListener).toHaveBeenCalledWith(
      'statechange',
      expect.any(Function)
    );
  });

  it('cancels a pending page-load registration on unmount', async () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'loading'
    });
    await begin();
    stop();
    window.dispatchEvent(new Event('load'));
    await flushPromises();
    expect(worker.register).not.toHaveBeenCalled();
  });

  it('ignores registration resolving after unmount', async () => {
    let resolveRegistration;
    worker.register.mockReturnValue(
      new Promise(resolve => {
        resolveRegistration = resolve;
      })
    );
    await begin();
    stop();
    registration.active = makeWorker('activated');
    worker.controller = registration.active;
    resolveRegistration(registration);
    await flushPromises();
    expect(latestStatus()).toBe('preparing');
    expect(onCached).not.toHaveBeenCalled();
  });

  it('keeps the two-callback call signature supported', async () => {
    stop = register(onUpdate, onCached);
    await flushPromises();
    const next = install();
    activate(next);
    control(next);
    expect(onCached).toHaveBeenCalledTimes(1);
  });

  it('unregisters only through the explicit cleanup export', async () => {
    unregister();
    await flushPromises();
    expect(registration.unregister).toHaveBeenCalledTimes(1);
    expect(worker.register).not.toHaveBeenCalled();
  });
});
