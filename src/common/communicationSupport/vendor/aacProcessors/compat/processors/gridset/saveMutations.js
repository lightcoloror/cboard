/**
 * Gridset Save Mutations Module
 *
 * Handles saving AACTree mutations back to Gridset files.
 * This module extracts the save logic from gridsetProcessor for better modularity.
 */
import { formatGrid3XmlComplete } from './xmlFormatter';
export class GridsetSaveHandler {
  constructor() {
    // Dynamic imports for browser compatibility
  }
  /**
   * Show deprecation warning for legacy save path
   */
  static warnLegacySave() {
    const key = 'gridset_legacy_save_warned';
    if (!global[key]) {
      console.warn(
        'saveModifiedTree: detected button changes without recorded mutations. ' +
          'This will continue to work in 0.x but is deprecated. ' +
          'Use page.addButton / page.addWordListItem to make changes explicit.'
      );
      global[key] = true;
    }
  }
  /**
   * Save using mutation-based logic
   * Fixes bugs A, B, C by processing explicit mutations
   */
  static saveWithMutations(
    tree,
    originalZip,
    outputZip,
    parser,
    gridBuilder,
    createBasicGridXml
  ) {
    for (const page of Object.values(tree.pages)) {
      var _originalGrid$Grid$Ce, _originalGrid$Grid$Ce2;
      // Skip pages with no mutations
      if (page.pendingMutations.length === 0) {
        continue;
      }
      const gridPath = `Grids/${page.name}/grid.xml`;
      // Load or create grid.xml
      const originalEntry = originalZip.getEntry(gridPath);
      let originalGrid;
      if (originalEntry) {
        const originalContent = originalEntry.getData().toString('utf-8');
        originalGrid = parser.parse(originalContent);
        if (!originalGrid.Grid) {
          originalGrid = null;
        }
      }
      if (!originalGrid || !originalGrid.Grid) {
        const basicGrid = createBasicGridXml(page);
        const buffer = Buffer.from(basicGrid, 'utf8');
        outputZip.addFile(gridPath, buffer);
        continue;
      }
      // Index original cells by position
      const cellsByPosition = new Map();
      const cellArray = Array.isArray(
        (_originalGrid$Grid$Ce = originalGrid.Grid.Cells) === null ||
          _originalGrid$Grid$Ce === void 0
          ? void 0
          : _originalGrid$Grid$Ce.Cell
      )
        ? originalGrid.Grid.Cells.Cell
        : (_originalGrid$Grid$Ce2 = originalGrid.Grid.Cells) !== null &&
          _originalGrid$Grid$Ce2 !== void 0 &&
          _originalGrid$Grid$Ce2.Cell
        ? [originalGrid.Grid.Cells.Cell]
        : [];
      for (const cell of cellArray) {
        const x =
          cell['@_X'] !== undefined
            ? parseInt(String(cell['@_X']), 10)
            : undefined;
        const y = parseInt(String(cell['@_Y'] || cell['@_Row'] || '0'), 10);
        if (x !== undefined) {
          cellsByPosition.set(`${x},${y}`, cell);
        }
      }
      // Process mutations in order
      for (const mutation of page.pendingMutations) {
        switch (mutation.type) {
          case 'addButton': {
            var _button$x, _button$y;
            const button = mutation.button;
            const x =
              (_button$x = button.x) !== null && _button$x !== void 0
                ? _button$x
                : 0;
            const y =
              (_button$y = button.y) !== null && _button$y !== void 0
                ? _button$y
                : 0;
            const cell = cellsByPosition.get(`${x},${y}`);
            if (cell && cell.Content) {
              GridsetSaveHandler.applyButtonToCell(cell, button);
            } else {
              // Bug C fix: warn instead of silently dropping
              console.warn(
                `[Gridset] Cannot add button at (${x},${y}) - cell does not exist. ` +
                  `Use addWordListItem for dynamic content.`
              );
            }
            break;
          }
          case 'removeButton': {
            const button = page.buttons.find(b => b.id === mutation.buttonId);
            if (button) {
              var _button$x2, _button$y2;
              const x =
                (_button$x2 = button.x) !== null && _button$x2 !== void 0
                  ? _button$x2
                  : 0;
              const y =
                (_button$y2 = button.y) !== null && _button$y2 !== void 0
                  ? _button$y2
                  : 0;
              const cell = cellsByPosition.get(`${x},${y}`);
              if (cell && cell.Content) {
                cell.Content.Visibility = 'Hidden';
              }
            }
            break;
          }
          case 'updateButton': {
            const button = page.buttons.find(b => b.id === mutation.buttonId);
            if (button) {
              var _button$x3, _button$y3;
              const x =
                (_button$x3 = button.x) !== null && _button$x3 !== void 0
                  ? _button$x3
                  : 0;
              const y =
                (_button$y3 = button.y) !== null && _button$y3 !== void 0
                  ? _button$y3
                  : 0;
              const cell = cellsByPosition.get(`${x},${y}`);
              if (cell && cell.Content) {
                GridsetSaveHandler.applyButtonToCell(
                  cell,
                  button,
                  mutation.patch
                );
              }
            }
            break;
          }
          case 'addWordListItem': {
            GridsetSaveHandler.addWordListItemToGrid(
              originalGrid.Grid,
              mutation.item
            );
            break;
          }
          case 'removeWordListItem': {
            GridsetSaveHandler.removeWordListItemFromGrid(
              originalGrid.Grid,
              mutation.match
            );
            break;
          }
          case 'clearWordList': {
            if (
              originalGrid.Grid.WordList &&
              originalGrid.Grid.WordList.Items
            ) {
              originalGrid.Grid.WordList.Items.WordListItem = [];
            }
            break;
          }
        }
      }
      // Build and write the updated grid XML
      let builtXml = gridBuilder.build(originalGrid);
      builtXml = formatGrid3XmlComplete(builtXml);
      outputZip.addFile(gridPath, Buffer.from(builtXml, 'utf8'));
    }
  }
  /**
   * Apply button changes to a cell
   */
  static applyButtonToCell(cell, button, patch) {
    const updates = patch
      ? {
          ...button,
          ...patch
        }
      : button;
    const isPlaceholderLabel =
      !updates.label ||
      updates.label.startsWith('Cell_') ||
      updates.label.startsWith('AutoContent_') ||
      updates.label.startsWith('Prediction ');
    if (cell.Content.CaptionAndImage || cell.Content.captionAndImage) {
      const captionAndImage =
        cell.Content.CaptionAndImage || cell.Content.captionAndImage;
      if (!isPlaceholderLabel && updates.label) {
        captionAndImage.Caption = updates.label;
        if (captionAndImage['@_xsi:nil'] || captionAndImage['xsi:nil']) {
          delete captionAndImage['@_xsi:nil'];
          delete captionAndImage['xsi:nil'];
        }
      }
      if (updates.image) {
        captionAndImage.Image = updates.image;
      }
    }
    const isPlaceholderMessage =
      !updates.message ||
      updates.message.startsWith('Cell_') ||
      updates.message.startsWith('AutoContent_') ||
      updates.message.startsWith('Prediction ');
    if (
      !isPlaceholderMessage &&
      updates.message &&
      updates.message !== updates.label &&
      !cell.Content.Commands
    ) {
      cell.Content['#text'] = updates.message;
    }
  }
  /**
   * Add an item to the WordList with de-duplication (Bug A fix)
   */
  static addWordListItemToGrid(grid, item) {
    if (!grid.WordList) {
      grid.WordList = {};
    }
    if (!grid.WordList.Items) {
      grid.WordList.Items = {};
    }
    const existingItems =
      grid.WordList.Items.WordListItem ||
      grid.WordList.Items.wordlistitem ||
      [];
    const itemsArray = Array.isArray(existingItems)
      ? existingItems
      : [existingItems];
    // De-duplicate by text
    const existingTexts = new Set(
      itemsArray
        .map(item => {
          var _item$Text;
          if (typeof item.Text === 'string') return item.Text;
          return (
            ((_item$Text = item.Text) === null ||
            _item$Text === void 0 ||
            (_item$Text = _item$Text.p) === null ||
            _item$Text === void 0 ||
            (_item$Text = _item$Text.s) === null ||
            _item$Text === void 0
              ? void 0
              : _item$Text.r) || ''
          );
        })
        .filter(Boolean)
    );
    if (!existingTexts.has(item.text)) {
      itemsArray.push({
        Text: {
          p: {
            s: {
              r: item.text
            }
          }
        },
        Image: item.image || '',
        PartOfSpeech: item.partOfSpeech || 'Unknown'
      });
      grid.WordList.Items.WordListItem = itemsArray;
    }
  }
  /**
   * Remove items from the WordList
   */
  static removeWordListItemFromGrid(grid, match) {
    if (!grid.WordList || !grid.WordList.Items) {
      return;
    }
    const existingItems =
      grid.WordList.Items.WordListItem ||
      grid.WordList.Items.wordlistitem ||
      [];
    const itemsArray = Array.isArray(existingItems)
      ? existingItems
      : [existingItems];
    let filteredItems;
    if (typeof match === 'string') {
      filteredItems = itemsArray.filter(item => {
        var _item$Text2;
        const text =
          ((_item$Text2 = item.Text) === null ||
          _item$Text2 === void 0 ||
          (_item$Text2 = _item$Text2.p) === null ||
          _item$Text2 === void 0 ||
          (_item$Text2 = _item$Text2.s) === null ||
          _item$Text2 === void 0
            ? void 0
            : _item$Text2.r) ||
          item.Text ||
          '';
        return text !== match;
      });
    } else {
      filteredItems = itemsArray.filter(match);
    }
    grid.WordList.Items.WordListItem = filteredItems;
  }
}
