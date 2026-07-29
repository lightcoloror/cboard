export const COMMUNICATION_NETWORK_AVAILABILITY = Object.freeze({
  online: 'online',
  offline: 'offline',
  unknown: 'unknown'
});

export function normalizeCommunicationNetworkStatus(value = {}) {
  const networkType =
    typeof value.networkType === 'string' && value.networkType.trim()
      ? value.networkType.trim().toLowerCase()
      : 'unknown';
  let availability = COMMUNICATION_NETWORK_AVAILABILITY.unknown;

  if (typeof value.isConnected === 'boolean') {
    availability = value.isConnected
      ? COMMUNICATION_NETWORK_AVAILABILITY.online
      : COMMUNICATION_NETWORK_AVAILABILITY.offline;
  } else if (networkType === 'none') {
    availability = COMMUNICATION_NETWORK_AVAILABILITY.offline;
  } else if (networkType !== 'unknown') {
    availability = COMMUNICATION_NETWORK_AVAILABILITY.online;
  }

  return { availability, networkType };
}

export function getCommunicationNetworkStatusCopy(status = {}) {
  if (status.availability !== COMMUNICATION_NETWORK_AVAILABILITY.offline) {
    return null;
  }

  return {
    title: '当前为离线模式',
    detail:
      '本地图板、分词、图片、朗读和本机历史仍可使用；AI、在线补图和账号同步暂时不可用。'
  };
}
