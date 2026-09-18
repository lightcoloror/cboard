import boardsFixture from '../../api/boards.json';
import { createBoardDTO } from '../../common/communicationSupport/dto';
import {
  resolveCommunicationBoardName,
  resolveCommunicationTileLabel
} from '../../common/communicationSupport/resolvers';

export function createCareBuiltinBoards(intl) {
  return (boardsFixture.advanced || []).map(board =>
    createBoardDTO(board, {
      resolveName: source => resolveCommunicationBoardName(source, intl),
      resolveTileLabel: source => resolveCommunicationTileLabel(source, intl)
    })
  );
}
