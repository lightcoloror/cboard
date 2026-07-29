import boardsFixture from '../api/boards.json';
import zhMessages from './zh-CN.communication';
import reviewedAacMessages from './zh-CN.aac-review.json';

const REVIEWED_MIXED_SCRIPT_LABEL_KEYS = new Set([
  'symbol.clothesGeneral.t-Shirt',
  'symbol.peopleProfession.itAssistant',
  'symbol.electricalMedia.playstation',
  'symbol.electricalComputer.usbStick',
  'symbol.electricalMedia.ipod',
  'symbol.electricalMedia.dvdPlayer',
  'symbol.electricalMedia.wii',
  'symbol.healthcareMedicalItems.xray'
]);

const REVIEWED_SHARED_LABELS = new Set([
  '颜色',
  '鸟类',
  '打开',
  '外面',
  '书架',
  '蜂巢'
]);

function resolveDefaultTileLabel(tile) {
  return zhMessages[tile.labelKey] || tile.label || '';
}

describe('CBoard Chinese communication vocabulary', () => {
  test('applies every reviewed AAC label to a real default tile', () => {
    const defaultLabelKeys = new Set(
      boardsFixture.advanced.flatMap(board =>
        board.tiles.map(tile => tile.labelKey)
      )
    );
    const unusedOrMismatched = Object.entries(reviewedAacMessages)
      .filter(
        ([labelKey, label]) =>
          !defaultLabelKeys.has(labelKey) || zhMessages[labelKey] !== label
      )
      .map(([labelKey, label]) => ({
        labelKey,
        expected: label,
        actual: zhMessages[labelKey]
      }));

    expect(unusedOrMismatched).toEqual([]);
  });

  test.each([
    ['cboard.symbol.iDislike', '我不喜欢'],
    ['symbol.drinkType.milk', '牛奶'],
    ['symbol.foodKitchenItems.fork', '叉子'],
    ['symbol.foodKitchenItems.bowl', '碗'],
    ['symbol.foodVegetablesAndSalads.lettuce', '生菜'],
    ['symbol.healthcareMedicalConditions.toVomit', '想吐'],
    ['symbol.healthcareMedicalItems.syringe', '注射器'],
    ['symbol.peopleRelationship.grandmother', '奶奶'],
    ['symbol.animalMammal.giraffe', '长颈鹿'],
    ['symbol.animalSpidersAndInsects.beetle', '甲虫'],
    ['symbol.animalBirds.owl', '猫头鹰'],
    ['symbol.foodEggs.boiledEgg', '煮鸡蛋'],
    ['symbol.foodIngredients.tomatoSauce', '番茄酱'],
    ['symbol.healthcareGroomingItems.sanitaryTowel', '卫生巾'],
    ['symbol.animalMammal.cat', '猫'],
    ['symbol.healthcareBodyParts.thumb', '拇指']
  ])('uses the reviewed translation for %s', (labelKey, label) => {
    expect(zhMessages[labelKey]).toBe(label);
  });

  test('does not expose unreviewed English or trailing colons in default boards', () => {
    const unreviewed = boardsFixture.advanced
      .flatMap(board => board.tiles)
      .filter(tile => !REVIEWED_MIXED_SCRIPT_LABEL_KEYS.has(tile.labelKey))
      .map(tile => ({
        labelKey: tile.labelKey,
        label: resolveDefaultTileLabel(tile)
      }))
      .filter(item => /[A-Za-z]/.test(item.label) || /[:：]$/.test(item.label));

    expect(unreviewed).toEqual([]);
  });

  test('does not collapse different default concepts into the same label', () => {
    const keysByLabel = new Map();

    boardsFixture.advanced
      .flatMap(board => board.tiles)
      .forEach(tile => {
        const label = resolveDefaultTileLabel(tile);
        const labelKeys = keysByLabel.get(label) || new Set();
        labelKeys.add(tile.labelKey);
        keysByLabel.set(label, labelKeys);
      });

    const collisions = Array.from(keysByLabel.entries())
      .filter(
        ([label, labelKeys]) =>
          labelKeys.size > 1 && !REVIEWED_SHARED_LABELS.has(label)
      )
      .map(([label, labelKeys]) => ({
        label,
        labelKeys: Array.from(labelKeys).sort()
      }));

    expect(collisions).toEqual([]);
  });
});
