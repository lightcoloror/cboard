import { createBoardDTO } from './dto';
import {
  boardDTOToCboardBoard,
  createCboardGridOrder
} from './cboardBoardAdapter';

describe('CBoard BoardDTO adapter', () => {
  test('preserves native board and tile fields while applying DTO changes', () => {
    const sourceBoard = {
      id: 'device_private_board_family',
      name: '旧名称',
      email: 'owner@example.com',
      syncMarker: 'keep-me',
      tiles: [
        {
          id: 'water',
          label: '水',
          customNativeField: 'keep-tile',
          action: { type: 'speak' }
        }
      ]
    };
    const dto = createBoardDTO({
      ...sourceBoard,
      name: '家庭常用',
      layout: { columns: 2, rows: 1, tileIds: ['water', 'apple'] },
      tiles: [
        {
          id: 'water',
          label: '喝水',
          image: 'default://water'
        },
        {
          id: 'apple',
          label: '苹果',
          image: 'default://apple'
        }
      ]
    });

    const result = boardDTOToCboardBoard(dto, sourceBoard);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'device_private_board_family',
        name: '家庭常用',
        email: 'owner@example.com',
        syncMarker: 'keep-me',
        isFixed: true,
        grid: {
          rows: 1,
          columns: 2,
          order: [['water', 'apple']]
        }
      })
    );
    expect(result.tiles[0]).toEqual(
      expect.objectContaining({
        id: 'water',
        label: '喝水',
        customNativeField: 'keep-tile',
        action: { type: 'speak' }
      })
    );
    expect(result.tiles[1]).toEqual(
      expect.objectContaining({ id: 'apple', label: '苹果' })
    );
  });

  test('creates a fixed grid order from BoardDTO layout', () => {
    expect(
      createCboardGridOrder({
        rows: 2,
        columns: 2,
        tileIds: ['one', '', 'three']
      })
    ).toEqual([['one', null], ['three', null]]);
  });
});
