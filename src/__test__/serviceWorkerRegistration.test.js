import { runWhenPageLoaded } from '../registerServiceWorker';

describe('runWhenPageLoaded', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete document.readyState;
  });

  test('runs immediately when registration starts after page load', () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete'
    });
    const callback = jest.fn();

    runWhenPageLoaded(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('waits for one load event while the page is loading', () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'loading'
    });
    const addEventListener = jest.spyOn(window, 'addEventListener');
    const callback = jest.fn();

    runWhenPageLoaded(callback);

    expect(callback).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith('load', callback, {
      once: true
    });
  });
});
