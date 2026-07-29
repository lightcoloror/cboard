export function resolveCommunicationBoardName(board = {}, intl) {
  if (board.name) {
    return board.name;
  }

  if (board.nameKey && intl && intl.messages && intl.messages[board.nameKey]) {
    return intl.formatMessage({ id: board.nameKey });
  }

  return '';
}

export function resolveCommunicationTileLabel(tile = {}, intl) {
  if (tile.label) {
    return tile.label;
  }

  if (tile.labelKey && intl && intl.messages && intl.messages[tile.labelKey]) {
    return intl.formatMessage({ id: tile.labelKey });
  }

  return '';
}
