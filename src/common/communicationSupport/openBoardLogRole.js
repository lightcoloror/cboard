// OBL modeling describes who operated the device, not our conversation direction.
// Imported role facts stay local and separate from understanding/confirmation.
export function normalizeOpenBoardLogRole(entry) {
  if (!entry || entry.localOnly !== true || entry.importSource !== 'open-board-log') return null;
  const role = entry.openBoardLogRole;
  if (!role || typeof role.modeling !== 'boolean' ||
      (role.directionSource !== 'extension' && role.directionSource !== 'compatibility')) return null;
  return { modeling: role.modeling, directionSource: role.directionSource };
}

export function getCommunicationHistoryImportRoleText(entry) {
  if (!entry || entry.importSource !== 'open-board-log') return '';
  const role = normalizeOpenBoardLogRole(entry);
  if (!role) return '旧导入记录未保留操作方信息，不能据此判断本人操作或伙伴示范。';
  const actor = role.modeling ? '他人为指导或支持而操作' : '本人操作';
  const direction = role.directionSource === 'extension'
    ? '方向由文件指定' : '方向按兼容规则推定';
  return `导入操作方：${actor}；${direction}。不代表已理解或独立完成。`;
}
