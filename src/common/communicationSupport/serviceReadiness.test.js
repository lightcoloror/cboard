import { normalizeCommunicationServiceReadiness } from './serviceReadiness';

describe('communication service readiness', () => {
  test('accepts only a fully ready API as ready', () => {
    expect(
      normalizeCommunicationServiceReadiness({
        status: 'ok',
        database: 'connected',
        communicationIndexes: 'ready',
        privatePictureLibrary: 'configured'
      })
    ).toEqual({
      recognized: true,
      ready: true,
      status: 'ok',
      database: 'connected',
      communicationIndexes: 'ready',
      privatePictureLibrary: 'configured'
    });
  });

  test('preserves a reachable degraded response without claiming readiness', () => {
    expect(
      normalizeCommunicationServiceReadiness({
        status: 'degraded',
        database: 'connected',
        communicationIndexes: 'building',
        privatePictureLibrary: 'unconfigured'
      })
    ).toEqual(
      expect.objectContaining({
        recognized: true,
        ready: false,
        status: 'degraded',
        database: 'connected',
        communicationIndexes: 'building',
        privatePictureLibrary: 'unconfigured'
      })
    );
  });

  test('fails closed for malformed or invented status values', () => {
    expect(
      normalizeCommunicationServiceReadiness({
        status: 'excellent',
        database: 'maybe',
        communicationIndexes: 'done',
        privatePictureLibrary: true
      })
    ).toEqual({
      recognized: false,
      ready: false,
      status: 'unknown',
      database: 'unknown',
      communicationIndexes: 'unknown',
      privatePictureLibrary: 'unknown'
    });
  });
});
