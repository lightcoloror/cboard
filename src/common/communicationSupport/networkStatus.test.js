import {
  COMMUNICATION_NETWORK_AVAILABILITY,
  getCommunicationNetworkStatusCopy,
  normalizeCommunicationNetworkStatus
} from './networkStatus';

describe('communication network status', () => {
  test('normalizes connected and disconnected platform values', () => {
    expect(
      normalizeCommunicationNetworkStatus({ networkType: 'wifi' })
    ).toEqual({
      availability: COMMUNICATION_NETWORK_AVAILABILITY.online,
      networkType: 'wifi'
    });
    expect(
      normalizeCommunicationNetworkStatus({ networkType: 'none' })
    ).toEqual({
      availability: COMMUNICATION_NETWORK_AVAILABILITY.offline,
      networkType: 'none'
    });
  });

  test('uses an explicit connection boolean over a stale network type', () => {
    expect(
      normalizeCommunicationNetworkStatus({
        isConnected: false,
        networkType: 'wifi'
      })
    ).toEqual({
      availability: COMMUNICATION_NETWORK_AVAILABILITY.offline,
      networkType: 'wifi'
    });
  });

  test('keeps missing or failed platform information unknown', () => {
    expect(normalizeCommunicationNetworkStatus()).toEqual({
      availability: COMMUNICATION_NETWORK_AVAILABILITY.unknown,
      networkType: 'unknown'
    });
  });

  test('explains the offline capability boundary only when offline', () => {
    expect(
      getCommunicationNetworkStatusCopy({
        availability: COMMUNICATION_NETWORK_AVAILABILITY.offline
      })
    ).toEqual({
      title: '当前为离线模式',
      detail:
        '本地图板、分词、图片、朗读和本机历史仍可使用；AI、在线补图和账号同步暂时不可用。'
    });
    expect(
      getCommunicationNetworkStatusCopy({
        availability: COMMUNICATION_NETWORK_AVAILABILITY.online
      })
    ).toBeNull();
    expect(
      getCommunicationNetworkStatusCopy({
        availability: COMMUNICATION_NETWORK_AVAILABILITY.unknown
      })
    ).toBeNull();
  });
});
