describe('Azure Speech configuration', () => {
  const originalKey = process.env.REACT_APP_AZURE_SPEECH_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.REACT_APP_AZURE_SPEECH_KEY;
    } else {
      process.env.REACT_APP_AZURE_SPEECH_KEY = originalKey;
    }
    jest.resetModules();
  });

  it('does not provide an implicit subscription key when unconfigured', () => {
    process.env.REACT_APP_AZURE_SPEECH_KEY = '';
    jest.resetModules();

    const { AZURE_SPEECH_SUBSCR_KEY } = require('./constants');

    expect(AZURE_SPEECH_SUBSCR_KEY).toBe('');
  });

  it('uses an explicitly configured subscription key', () => {
    process.env.REACT_APP_AZURE_SPEECH_KEY = 'configured-test-key';
    jest.resetModules();

    const { AZURE_SPEECH_SUBSCR_KEY } = require('./constants');

    expect(AZURE_SPEECH_SUBSCR_KEY).toBe('configured-test-key');
  });
});
