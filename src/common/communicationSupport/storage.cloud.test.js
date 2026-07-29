import {
  buildCommunicationSupportCloudSettings,
  normalizeCommunicationHistory
} from './storage';

describe('communication history cloud privacy', () => {
  test('preserves imported local-only markers but excludes them from cloud settings', () => {
    const localOnly = {
      id: 'history-obl',
      sessionId: 'obl-session',
      direction: 'express',
      sentence: '私密导入记录',
      labels: [],
      createdAt: 20,
      updatedAt: 20,
      localOnly: true,
      importSource: 'open-board-log'
    };
    const normal = {
      id: 'history-local',
      sessionId: 'local-session',
      direction: 'express',
      sentence: '本机表达',
      labels: [],
      createdAt: 10,
      updatedAt: 10
    };
    const normalized = normalizeCommunicationHistory([localOnly, normal]);
    const cloud = buildCommunicationSupportCloudSettings([], normalized);

    expect(normalized[0]).toEqual(
      expect.objectContaining({
        id: 'history-obl',
        localOnly: true,
        importSource: 'open-board-log'
      })
    );
    expect(cloud.history.map(entry => entry.id)).toEqual(['history-local']);
  });
});
