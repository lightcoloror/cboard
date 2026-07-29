// Semantic action categories for cross-platform compatibility
export var AACSemanticCategory;
(function(AACSemanticCategory) {
  AACSemanticCategory['COMMUNICATION'] = 'communication';
  AACSemanticCategory['NAVIGATION'] = 'navigation';
  AACSemanticCategory['TEXT_EDITING'] = 'text_editing';
  AACSemanticCategory['SYSTEM_CONTROL'] = 'system_control';
  AACSemanticCategory['MEDIA'] = 'media';
  AACSemanticCategory['ACCESSIBILITY'] = 'accessibility';
  AACSemanticCategory['CUSTOM'] = 'custom';
})(AACSemanticCategory || (AACSemanticCategory = {}));
// Semantic intents within each category
export var AACSemanticIntent;
(function(AACSemanticIntent) {
  // Communication
  AACSemanticIntent['SPEAK_TEXT'] = 'SPEAK_TEXT';
  AACSemanticIntent['SPEAK_IMMEDIATE'] = 'SPEAK_IMMEDIATE';
  AACSemanticIntent['STOP_SPEECH'] = 'STOP_SPEECH';
  AACSemanticIntent['INSERT_TEXT'] = 'INSERT_TEXT';
  // Navigation
  AACSemanticIntent['NAVIGATE_TO'] = 'NAVIGATE_TO';
  AACSemanticIntent['GO_BACK'] = 'GO_BACK';
  AACSemanticIntent['GO_HOME'] = 'GO_HOME';
  // Text Editing
  AACSemanticIntent['DELETE_WORD'] = 'DELETE_WORD';
  AACSemanticIntent['DELETE_CHARACTER'] = 'DELETE_CHARACTER';
  AACSemanticIntent['CLEAR_TEXT'] = 'CLEAR_TEXT';
  AACSemanticIntent['COPY_TEXT'] = 'COPY_TEXT';
  AACSemanticIntent['PASTE_TEXT'] = 'PASTE_TEXT';
  AACSemanticIntent['SELECT_ALL'] = 'SELECT_ALL';
  AACSemanticIntent['CURSOR_MOVE'] = 'CURSOR_MOVE';
  AACSemanticIntent['UNDO'] = 'UNDO';
  AACSemanticIntent['PRINT'] = 'PRINT';
  // System Control
  AACSemanticIntent['SEND_KEYS'] = 'SEND_KEYS';
  AACSemanticIntent['MOUSE_CLICK'] = 'MOUSE_CLICK';
  AACSemanticIntent['DEVICE_MUTE'] = 'DEVICE_MUTE';
  AACSemanticIntent['TOGGLE_STATE'] = 'TOGGLE_STATE';
  // Web Control
  AACSemanticIntent['WEB_NAVIGATE'] = 'WEB_NAVIGATE';
  AACSemanticIntent['WEB_SCROLL'] = 'WEB_SCROLL';
  AACSemanticIntent['WEB_FOCUS_ELEMENT'] = 'WEB_FOCUS_ELEMENT';
  AACSemanticIntent['WEB_ACTIVATE_ELEMENT'] = 'WEB_ACTIVATE_ELEMENT';
  AACSemanticIntent['WEB_EXECUTE_SCRIPT'] = 'WEB_EXECUTE_SCRIPT';
  // Media
  AACSemanticIntent['PLAY_SOUND'] = 'PLAY_SOUND';
  AACSemanticIntent['PLAY_VIDEO'] = 'PLAY_VIDEO';
  AACSemanticIntent['STOP_MEDIA'] = 'STOP_MEDIA';
  AACSemanticIntent['TAKE_PHOTO'] = 'TAKE_PHOTO';
  // Command Execution
  AACSemanticIntent['WAIT'] = 'WAIT';
  AACSemanticIntent['REPEAT_COMMANDS'] = 'REPEAT_COMMANDS';
  // Accessibility
  AACSemanticIntent['SCAN_NEXT'] = 'SCAN_NEXT';
  AACSemanticIntent['SCAN_SELECT'] = 'SCAN_SELECT';
  // Custom
  AACSemanticIntent['PLATFORM_SPECIFIC'] = 'PLATFORM_SPECIFIC';
})(AACSemanticIntent || (AACSemanticIntent = {}));
/**
 * Scanning types for accessibility
 */
export var AACScanType;
(function(AACScanType) {
  AACScanType['LINEAR'] = 'linear';
  AACScanType['ROW_COLUMN'] = 'row-column';
  AACScanType['COLUMN_ROW'] = 'column-row';
  AACScanType['BLOCK_ROW_COLUMN'] = 'block-row-column';
  AACScanType['BLOCK_COLUMN_ROW'] = 'block-column-row';
})(AACScanType || (AACScanType = {}));
export class AACButton {
  constructor({
    id,
    label = '',
    message = '',
    targetPageId,
    semanticAction,
    audioRecording,
    style,
    contentType,
    contentSubType,
    image,
    resolvedImageEntry,
    symbolLibrary,
    symbolPath,
    x,
    y,
    columnSpan,
    rowSpan,
    scanBlocks,
    scanBlock,
    visibility,
    directActivate,
    parameters,
    predictions,
    pos,
    wordForms,
    semantic_id,
    clone_id,
    // Legacy input support
    type,
    action
  }) {
    this.id = id;
    this.label = label;
    this.message = message;
    this.targetPageId = targetPageId;
    this.semanticAction = semanticAction;
    this.audioRecording = audioRecording;
    this.style = style;
    this.contentType = contentType;
    this.contentSubType = contentSubType;
    this.image = image;
    this.resolvedImageEntry = resolvedImageEntry;
    this.symbolLibrary = symbolLibrary;
    this.symbolPath = symbolPath;
    this.x = x;
    this.y = y;
    this.columnSpan = columnSpan;
    this.rowSpan = rowSpan;
    this.scanBlocks = scanBlocks;
    this.scanBlock = scanBlock;
    this.visibility = visibility;
    this.directActivate = directActivate;
    this.parameters = parameters;
    this.predictions = predictions;
    this.pos = pos;
    this.wordForms = wordForms;
    this.semantic_id = semantic_id;
    this.clone_id = clone_id;
    // Legacy mapping: if no semanticAction provided, derive from legacy `action` first
    if (!this.semanticAction && action) {
      if (
        action.type === 'NAVIGATE' &&
        (action.targetPageId || this.targetPageId)
      ) {
        if (!this.targetPageId) this.targetPageId = action.targetPageId;
        this.semanticAction = {
          category: AACSemanticCategory.NAVIGATION,
          intent: AACSemanticIntent.NAVIGATE_TO,
          targetId: this.targetPageId,
          fallback: { type: 'NAVIGATE', targetPageId: this.targetPageId }
        };
      } else if (action.type === 'SPEAK') {
        const text = action.message || this.message || this.label || '';
        if (!this.message) this.message = text;
        this.semanticAction = {
          category: AACSemanticCategory.COMMUNICATION,
          intent: AACSemanticIntent.SPEAK_TEXT,
          text,
          fallback: { type: 'SPEAK', message: text }
        };
      } else {
        this.semanticAction = {
          category: AACSemanticCategory.SYSTEM_CONTROL,
          intent: AACSemanticIntent.PLATFORM_SPECIFIC,
          fallback: { type: 'ACTION' }
        };
      }
    }
    // Legacy mapping: if still no semanticAction and `type` provided
    if (!this.semanticAction && type) {
      if (type === 'NAVIGATE' && this.targetPageId) {
        this.semanticAction = {
          category: AACSemanticCategory.NAVIGATION,
          intent: AACSemanticIntent.NAVIGATE_TO,
          targetId: this.targetPageId,
          fallback: { type: 'NAVIGATE', targetPageId: this.targetPageId }
        };
      } else if (type === 'SPEAK') {
        const text = this.message || this.label || '';
        this.semanticAction = {
          category: AACSemanticCategory.COMMUNICATION,
          intent: AACSemanticIntent.SPEAK_TEXT,
          text,
          fallback: { type: 'SPEAK', message: text }
        };
      } else {
        this.semanticAction = {
          category: AACSemanticCategory.SYSTEM_CONTROL,
          intent: AACSemanticIntent.PLATFORM_SPECIFIC,
          fallback: { type: 'ACTION' }
        };
      }
    }
  }
  // Legacy compatibility properties
  get type() {
    if (this.semanticAction) {
      const i = String(this.semanticAction.intent);
      if (i === 'NAVIGATE_TO') return 'NAVIGATE';
      if (i === 'SPEAK_TEXT' || i === 'SPEAK_IMMEDIATE') return 'SPEAK';
      return 'ACTION';
    }
    if (this.targetPageId) return 'NAVIGATE';
    if (this.message) return 'SPEAK';
    return 'SPEAK';
  }
  get action() {
    const t = this.type;
    if (!t) return null;
    if (t === 'SPEAK' && !this.message && !this.label && !this.semanticAction) {
      return null;
    }
    return { type: t, targetPageId: this.targetPageId, message: this.message };
  }
}
export class AACPage {
  constructor({
    id,
    name = '',
    grid = [],
    buttons = [],
    parentId = null,
    style,
    locale,
    descriptionHtml,
    images,
    sounds,
    semantic_ids,
    clone_ids,
    scanningConfig,
    scanBlocksConfig,
    scanType
  }) {
    // Mutation tracking
    this._pendingMutations = [];
    this.id = id;
    this.name = name;
    if (Array.isArray(grid)) {
      this.grid = grid;
    } else if (
      grid &&
      typeof grid === 'object' &&
      'columns' in grid &&
      'rows' in grid
    ) {
      const cols = grid.columns;
      const rows = grid.rows;
      this.grid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => null)
      );
    } else {
      this.grid = [];
    }
    this.buttons = buttons;
    this.parentId = parentId;
    this.style = style;
    this.locale = locale;
    this.descriptionHtml = descriptionHtml;
    this.images = images;
    this.sounds = sounds;
    this.semantic_ids = semantic_ids;
    this.clone_ids = clone_ids;
    this.scanningConfig = scanningConfig;
    this.scanBlocksConfig = scanBlocksConfig;
    this.scanType = scanType;
  }
  addButton(button) {
    this.buttons.push(button);
    // Record the mutation
    this._pendingMutations.push({ type: 'addButton', button });
  }
  /**
   * Internal load-path button push: adds a button to the page WITHOUT recording a mutation.
   * Used by processors during loadIntoTree so the loaded baseline isn't treated as user changes.
   * Not part of the public API — consumers should always use addButton.
   */
  _loadButton(button) {
    this.buttons.push(button);
  }
  /**
   * Discard all recorded mutations on this page.
   * Useful as an escape hatch after loadIntoTree if the consumer wants a clean baseline.
   */
  clearMutations() {
    this._pendingMutations = [];
  }
  /**
   * Get the list of pending mutations for this page (read-only)
   */
  get pendingMutations() {
    return Object.freeze([...this._pendingMutations]);
  }
  /**
   * Remove a button by ID
   * @param buttonId - The ID of the button to remove
   */
  removeButton(buttonId) {
    this._pendingMutations.push({ type: 'removeButton', buttonId });
  }
  /**
   * Update a button by merging a patch
   * @param buttonId - The ID of the button to update
   * @param patch - Partial button object with fields to update
   */
  updateButton(buttonId, patch) {
    this._pendingMutations.push({ type: 'updateButton', buttonId, patch });
  }
  /**
   * Add an item to the page's WordList (for formats with dynamic content cells)
   * @param item - WordList item to add
   */
  addWordListItem(item) {
    this._pendingMutations.push({ type: 'addWordListItem', item });
  }
  /**
   * Remove items from the page's WordList
   * @param textOrPredicate - Text to match or predicate function to filter items
   */
  removeWordListItem(textOrPredicate) {
    this._pendingMutations.push({
      type: 'removeWordListItem',
      match: textOrPredicate
    });
  }
  /**
   * Clear all items from the page's WordList
   */
  clearWordList() {
    this._pendingMutations.push({ type: 'clearWordList' });
  }
}
export class AACTree {
  get rootId() {
    return this.metadata.defaultHomePageId || null;
  }
  set rootId(id) {
    this.metadata.defaultHomePageId = id || undefined;
  }
  get toolbarId() {
    return this.metadata.toolbarId || null;
  }
  set toolbarId(id) {
    this.metadata.toolbarId = id || undefined;
  }
  get dashboardId() {
    return this.metadata.dashboardId || null;
  }
  set dashboardId(id) {
    this.metadata.dashboardId = id || undefined;
  }
  constructor() {
    this.pages = {};
    this.metadata = {};
  }
  addPage(page) {
    this.pages[page.id] = page;
    if (!this.rootId) this.rootId = page.id;
  }
  getPage(id) {
    return this.pages[id];
  }
  traverse(callback) {
    const queue = Object.keys(this.pages);
    const visited = new Set();
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const page = this.pages[id];
      if (page) {
        callback(page);
        // Add child pages to queue
        page.buttons
          .filter(b => {
            const i = String(b.semanticAction?.intent);
            return (
              i === 'NAVIGATE_TO' ||
              !!b.semanticAction?.targetId ||
              !!b.targetPageId
            );
          })
          .forEach(b => {
            const target = b.semanticAction?.targetId || b.targetPageId;
            if (target) queue.push(target);
          });
      }
    }
  }
}
