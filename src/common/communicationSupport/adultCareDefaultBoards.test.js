import boardsFixture from '../../api/boards.json';
import { getPictogramAttribution } from './pictogramAttribution';

const boards = boardsFixture.advanced;

function getBoard(boardId) {
  const board = boards.find(item => item.id === boardId);
  expect(board).toBeDefined();
  return board;
}

function getLiteralLabels(boardId) {
  return getBoard(boardId)
    .tiles.map(tile => tile.label)
    .filter(Boolean);
}

describe('PicInterpreter adult-care profile on CBoard defaults', () => {
  test('keeps the mature CBoard categories and adds two linked care boards', () => {
    expect(boards).toHaveLength(46);
    expect(getBoard('r1-FTvnvaW').nameKey).toBe(
      'symbol.foodBreadsAndBaking.food'
    );
    expect(getBoard('SkmWY6DhwpW').nameKey).toBe('cboard.symbol.medical');
    expect(getBoard('H1iZY6DnvT-').nameKey).toBe('cboard.symbol.hygiene');

    const root = getBoard('root');
    expect(root.tiles.find(tile => tile.id === 'pi-home-core-words')).toEqual(
      expect.objectContaining({ loadBoard: 'pi-core-words-v1' })
    );
    expect(root.tiles.find(tile => tile.id === 'pi-home-repair')).toEqual(
      expect.objectContaining({ loadBoard: 'pi-repair-v1' })
    );
  });

  test('puts the PRD high-frequency adult-care actions directly on home', () => {
    expect(getLiteralLabels('root')).toEqual(
      expect.arrayContaining([
        '要',
        '不要',
        '帮帮我',
        '停止',
        '再说一次',
        '我痛',
        '我不舒服',
        '我要喝水',
        '我想上厕所',
        '请叫医生',
        '请叫家人',
        '核心词',
        '修正澄清'
      ])
    );
    expect(getLiteralLabels('BJgYav2vp-')).toEqual(
      expect.arrayContaining([
        '帮帮我',
        '停止',
        '再说一次',
        '我痛',
        '我不舒服',
        '我要喝水',
        '我想上厕所',
        '请叫医生',
        '请叫家人'
      ])
    );
  });

  test('provides dedicated core-word and repair vocabularies', () => {
    const core = getBoard('pi-core-words-v1');
    expect(core.tiles).toHaveLength(15);
    expect(getLiteralLabels('pi-core-words-v1')).toEqual(
      expect.arrayContaining(['我', '你', '他/她', '要', '可以', '不', '有'])
    );
    expect(core.tiles.map(tile => tile.labelKey).filter(Boolean)).toEqual(
      expect.arrayContaining([
        'symbol.peopleActions.toGo',
        'symbol.peopleActions.toCome',
        'symbol.peopleActions.toGive',
        'symbol.peopleActions.toWatch',
        'symbol.communicationConversation.toTalk',
        'symbol.question.where',
        'symbol.question.what',
        'symbol.question.why'
      ])
    );

    expect(getLiteralLabels('pi-repair-v1')).toEqual([
      '不对',
      '不是这个',
      '再说一次',
      '说慢一点',
      '写下来',
      '指给我看',
      '给我选项',
      '等一下',
      '我说不出话'
    ]);
  });

  test('keeps exact ARASAAC identity for every newly bundled ARASAAC tile', () => {
    const curatedTiles = boards
      .flatMap(board => board.tiles)
      .filter(tile => tile.pictogramProvider === 'arasaac');

    expect(curatedTiles.length).toBeGreaterThan(0);
    curatedTiles.forEach(tile => {
      expect(getPictogramAttribution(tile)).toEqual(
        expect.objectContaining({
          provider: 'arasaac',
          originalId: tile.pictogramOriginalId,
          sourceUrl: `https://arasaac.org/pictograms/zh/${
            tile.pictogramOriginalId
          }`
        })
      );
    });
  });
});
