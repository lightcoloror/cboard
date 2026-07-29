import { BaseProcessor } from '../core/baseProcessor';
import {
  AACTree,
  AACPage,
  AACButton,
  AACSemanticCategory,
  AACSemanticIntent
} from '../core/treeStructure';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { resolveGrid3CellImage } from './gridset/resolver';
import {
  extractAllButtonsForTranslation,
  validateTranslationResults
} from '../utilities/translation/translationProcessor';
import {
  getZipEntriesFromAdapter,
  resolveGridsetPassword
} from './gridset/password';
import { decryptGridsetEntry } from './gridset/crypto';
import { formatGrid3XmlComplete } from './gridset/xmlFormatter';
import { GridsetSaveHandler } from './gridset/saveMutations';
import {
  calculateColumnDefinitions as calcColumnDefs,
  calculateRowDefinitions as calcRowDefs
} from './gridset/gridCalculations';
import { findButtonPosition as findButtonPos } from './gridset/cellHelpers';
// New imports for enhanced Grid 3 support
import { detectPluginCellType, Grid3CellType } from './gridset/pluginTypes';
import { detectCommand } from './gridset/commands';
import { parseSymbolReference } from './gridset/symbolReference';
import { isSymbolLibraryReference } from './gridset/resolver';
import { generateCloneId } from '../utilities/analytics/utils/idGenerator';
import {
  translateWithSymbols,
  extractSymbolsFromButton
} from './gridset/symbolAlignment';
import { decodeText } from '../utils/io';
class GridsetProcessor extends BaseProcessor {
  constructor(options) {
    super(options);
    this.capabilities = {
      wordList: 'native',
      preservesAssetsOnSave: true,
      newCellCreation: 'restricted'
    };
  }
  // Determine password to use when opening encrypted gridset archives (.gridsetx)
  getGridsetPassword(source) {
    return resolveGridsetPassword(this.options, source);
  }
  // Helper function to ensure color has alpha channel (Grid3 format)
  ensureAlphaChannel(color) {
    if (!color) return '#FFFFFFFF';
    // Handle rgb() and rgba() formats
    const rgbMatch = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1.0;
      const alphaHex = Math.round(a * 255)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0');
      return `#${r.toString(16).padStart(2, '0')}${g
        .toString(16)
        .padStart(2, '0')}${b.toString(16).padStart(2, '0')}${alphaHex}`;
    }
    // If already 8 digits (with alpha), return as is
    if (color.match(/^#[0-9A-Fa-f]{8}$/)) return color;
    // If 6 digits (no alpha), add FF for fully opaque
    if (color.match(/^#[0-9A-Fa-f]{6}$/)) return color + 'FF';
    // If 3 digits (shorthand), expand to 8
    if (color.match(/^#[0-9A-Fa-f]{3}$/)) {
      const r = color[1];
      const g = color[2];
      const b = color[3];
      return `#${r}${r}${g}${g}${b}${b}FF`;
    }
    // Invalid or unknown format, return white
    return '#FFFFFFFF';
  }
  /**
   * Calculate appropriate font color (black or white) based on background brightness
   * Uses WCAG relative luminance formula to determine contrast
   */
  getContrastFontColor(backgroundColor) {
    if (!backgroundColor) return '#FF000000FF'; // Default to black
    // Parse color from various formats
    let r = 255,
      g = 255,
      b = 255;
    // Handle hex colors
    const hexMatch = backgroundColor.match(
      /#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/
    );
    if (hexMatch) {
      r = parseInt(hexMatch[1], 16);
      g = parseInt(hexMatch[2], 16);
      b = parseInt(hexMatch[3], 16);
    } else {
      // Handle rgb() format
      const rgbMatch = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        r = parseInt(rgbMatch[1]);
        g = parseInt(rgbMatch[2]);
        b = parseInt(rgbMatch[3]);
      }
    }
    // Calculate relative luminance using WCAG formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Use white text for dark backgrounds (luminance < 0.5), black for light backgrounds
    // Return 6-digit hex (ensureAlphaChannel will add FF for alpha)
    return luminance < 0.5 ? '#FFFFFF' : '#000000';
  }
  /**
   * Extract words from Grid3 WordList structure
   */
  _extractWordsFromWordList(param) {
    var _wordList$Items, _wordList$items;
    if (!param) return [];
    // Sometimes the param itself is the WordList, sometimes it has a WordList property
    const wordList =
      param.WordList ||
      param.wordlist ||
      (param.Items || param.items ? param : undefined);
    if (!wordList || !(wordList.Items || wordList.items)) return [];
    const items =
      ((_wordList$Items = wordList.Items) === null || _wordList$Items === void 0
        ? void 0
        : _wordList$Items.WordListItem) ||
      ((_wordList$items = wordList.items) === null || _wordList$items === void 0
        ? void 0
        : _wordList$items.wordlistitem) ||
      [];
    const itemArr = Array.isArray(items) ? items : [items];
    const words = [];
    for (const item of itemArr) {
      const text = item.Text || item.text;
      if (text) {
        const val = this.textOf(text);
        if (val) words.push(val);
      } else if (item['#text'] !== undefined) {
        words.push(String(item['#text']));
      } else if (typeof item === 'string') {
        words.push(item);
      }
    }
    return words;
  }
  // Helper function to generate Grid3 commands from semantic actions
  generateCommandsFromSemanticAction(button, tree) {
    var _semanticAction$platf;
    const semanticAction = button.semanticAction;
    if (!semanticAction) {
      // Workspace and LiveCell cells should have no commands
      if (
        button.contentType === 'Workspace' ||
        button.contentType === 'LiveCell'
      ) {
        return '';
      }
      // AutoContent cells may or may not have commands
      if (button.contentType === 'AutoContent') {
        return '';
      }
      // Default to insert text action with structured XML format
      // Use two <s> elements: one for the word, one for the space (CDATA preserves whitespace)
      let text = button.message || button.label || '';
      // Remove trailing space from message if present (we'll add it as separate segment)
      if (text.endsWith(' ')) {
        text = text.slice(0, -1);
      }
      return {
        Command: {
          '@_ID': 'Action.InsertText',
          Parameter: {
            '@_Key': 'text',
            p: {
              s: [
                {
                  r: text
                },
                {
                  r: {
                    __cdata: ' '
                  }
                }
              ]
            }
          }
        }
      };
    }
    // Use platform-specific Grid3 data if available
    if (
      (_semanticAction$platf = semanticAction.platformData) !== null &&
      _semanticAction$platf !== void 0 &&
      _semanticAction$platf.grid3
    ) {
      const grid3Data = semanticAction.platformData.grid3;
      const params = Object.entries(grid3Data.parameters || {}).map(
        ([key, value]) => ({
          '@_Key': key,
          '#text': String(value)
        })
      );
      return {
        Command: {
          '@_ID': grid3Data.commandId,
          ...(params.length > 0
            ? {
                Parameter: params
              }
            : {})
        }
      };
    }
    // Convert semantic actions to Grid3 commands
    const intentStr = String(semanticAction.intent);
    switch (intentStr) {
      case 'NAVIGATE_TO': {
        // For Grid3, we need to use the grid name, not the ID
        let targetGridName = semanticAction.targetId || '';
        if (tree && semanticAction.targetId) {
          const targetPage = tree.getPage(semanticAction.targetId);
          if (targetPage) {
            targetGridName = targetPage.name || targetPage.id;
          }
        }
        return {
          Command: {
            '@_ID': 'Jump.To',
            Parameter: {
              '@_Key': 'grid',
              '#text': targetGridName
            }
          }
        };
      }
      case 'GO_BACK':
        return {
          Command: {
            '@_ID': 'Jump.Back'
          }
        };
      case 'GO_HOME':
        return {
          Command: {
            '@_ID': 'Jump.Home'
          }
        };
      case 'DELETE_WORD':
        return {
          Command: {
            '@_ID': 'Action.DeleteWord'
          }
        };
      case 'DELETE_CHARACTER':
        return {
          Command: {
            '@_ID': 'Action.DeleteLetter'
          }
        };
      case 'CLEAR_TEXT':
        return {
          Command: {
            '@_ID': 'Action.Clear'
          }
        };
      case 'SPEAK_TEXT':
      case 'SPEAK_IMMEDIATE': {
        // Users can speak the complete sentence with a dedicated Speak button // Use two <s> elements: one for the word, one for the space (CDATA preserves whitespace) // Grid3 requires explicit trailing space for automatic word spacing // For communication buttons, insert text into message bar (sentence building)
        let text = semanticAction.text || button.message || button.label || '';
        // Remove trailing space from message if present (we'll add it as separate segment)
        if (text.endsWith(' ')) {
          text = text.slice(0, -1);
        }
        return {
          Command: {
            '@_ID': 'Action.InsertText',
            Parameter: {
              '@_Key': 'text',
              p: {
                s: [
                  {
                    r: text
                  },
                  {
                    r: {
                      __cdata: ' '
                    }
                  }
                ]
              }
            }
          }
        };
      }
      case 'INSERT_TEXT': {
        // Use two <s> elements: one for the word, one for the space (CDATA preserves whitespace) // Add trailing space for word buttons to enable sentence building
        let text = semanticAction.text || button.message || button.label || '';
        // Remove trailing space from message if present (we'll add it as separate segment)
        if (text.endsWith(' ')) {
          text = text.slice(0, -1);
        }
        return {
          Command: {
            '@_ID': 'Action.InsertText',
            Parameter: {
              '@_Key': 'text',
              p: {
                s: [
                  {
                    r: text
                  },
                  {
                    r: {
                      __cdata: ' '
                    }
                  }
                ]
              }
            }
          }
        };
      }
      default: {
        var _semanticAction$platf2;
        if (
          (_semanticAction$platf2 = semanticAction.platformData) !== null &&
          _semanticAction$platf2 !== void 0 &&
          _semanticAction$platf2.grid3
        ) {
          break;
        }
        let text = semanticAction.text || button.message || button.label || '';
        if (text.endsWith(' ')) {
          text = text.slice(0, -1);
        }
        return {
          Command: {
            '@_ID': 'Action.InsertText',
            Parameter: {
              '@_Key': 'text',
              p: {
                s: [
                  {
                    r: text
                  },
                  {
                    r: {
                      __cdata: ' '
                    }
                  }
                ]
              }
            }
          }
        };
      }
    }
  }
  // Helper function to convert Grid 3 style to AACStyle
  convertGrid3StyleToAACStyle(grid3Style) {
    if (!grid3Style) return {};
    return {
      backgroundColor: grid3Style.BackColour || grid3Style.TileColour,
      borderColor: grid3Style.BorderColour,
      fontColor: grid3Style.FontColour,
      fontFamily: grid3Style.FontName,
      fontSize: grid3Style.FontSize
        ? parseInt(String(grid3Style.FontSize))
        : undefined,
      backgroundShape:
        grid3Style.BackgroundShape !== undefined
          ? parseInt(String(grid3Style.BackgroundShape))
          : undefined
    };
  }
  // Helper function to get style by ID or return default
  getStyleById(styles, styleId) {
    if (!styleId || !styles.has(styleId)) {
      return {};
    }
    return this.convertGrid3StyleToAACStyle(styles.get(styleId));
  }
  // Helper to safely extract text from XML parser values
  textOf(val) {
    if (!val) return undefined;
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      // Don't immediately return #text - it might be whitespace alongside structured content
      // Process structured format first: <p><s><r>text</r></s></p>
      // Handle Grid3 structured format <p><s><r>text</r></s></p>
      // Can start at p, s, or r level
      const parts = [];
      const processS = s => {
        if (!s) return;
        if (s.r !== undefined) {
          const rElements = Array.isArray(s.r) ? s.r : [s.r];
          for (const r of rElements) {
            if (typeof r === 'number') {
              if (r !== 0) {
                parts.push(String(r));
              }
              continue;
            }
            if (typeof r === 'object' && r !== null) {
              // Check for #text (regular text) or #cdata (CDATA sections)
              if ('#text' in r) {
                parts.push(String(r['#text']));
              } else if ('#cdata' in r) {
                parts.push(String(r['#cdata']));
              } else {
                parts.push(String(r));
              }
            } else {
              parts.push(String(r));
            }
          }
        }
      };
      if (val.p) {
        const p = val.p;
        const sElements = Array.isArray(p.s) ? p.s : p.s ? [p.s] : [];
        sElements.forEach(processS);
      } else if (val.s) {
        const sElements = Array.isArray(val.s) ? val.s : [val.s];
        sElements.forEach(processS);
      } else if (val.r !== undefined) {
        processS(val);
      }
      if (parts.length > 0) {
        return parts.join('').trim();
      }
    }
    return undefined;
  }
  async extractTexts(filePathOrBuffer) {
    const tree = await this.loadIntoTree(filePathOrBuffer);
    const texts = [];
    for (const pageId in tree.pages) {
      const page = tree.pages[pageId];
      if (page.name) texts.push(page.name);
      page.buttons.forEach(btn => {
        if (btn.label) texts.push(btn.label);
        if (btn.message && btn.message !== btn.label) texts.push(btn.message);
      });
    }
    return texts;
  }
  async loadIntoTree(filePathOrBuffer) {
    const { readBinaryFromInput } = this.options.fileAdapter;
    const tree = new AACTree();
    let zipResult;
    try {
      const zipInput = await readBinaryFromInput(filePathOrBuffer);
      zipResult = await this.options.zipAdapter(zipInput);
    } catch (error) {
      throw new Error(`Invalid ZIP file format: ${error.message}`);
    }
    const password = this.getGridsetPassword(filePathOrBuffer);
    const entries = getZipEntriesFromAdapter(zipResult, password);
    const options = {
      ignoreAttributes: false,
      ignoreDeclaration: true,
      parseTagValue: false,
      trimValues: false,
      textNodeName: '#text',
      cdataProp: '#cdata'
    };
    const parser = new XMLParser(options);
    const isEncryptedArchive =
      typeof filePathOrBuffer === 'string' &&
      filePathOrBuffer.toLowerCase().endsWith('.gridsetx');
    const encryptedContentPassword = this.getGridsetPassword(filePathOrBuffer);
    // Initialize metadata
    const metadata = {
      format: 'gridset',
      isSmartBox: isEncryptedArchive,
      // SmartBox files are .gridsetx encrypted archives
      passwordProtected: !!password
    };
    const readEntryBuffer = async entry => {
      const raw = await entry.getData();
      if (!isEncryptedArchive) {
        return raw;
      }
      return decryptGridsetEntry(Buffer.from(raw), encryptedContentPassword);
    };
    // Parse FileMap.xml if present to index dynamic files per grid
    const fileMapIndex = new Map();
    try {
      const fmEntry = entries.find(e => e.entryName.endsWith('FileMap.xml'));
      if (fmEntry) {
        var _fmData$FileMap, _fmData$fileMap;
        const fmXml = decodeText(await readEntryBuffer(fmEntry));
        const fmData = parser.parse(fmXml);
        const entries =
          (fmData === null ||
          fmData === void 0 ||
          (_fmData$FileMap = fmData.FileMap) === null ||
          _fmData$FileMap === void 0 ||
          (_fmData$FileMap = _fmData$FileMap.Entries) === null ||
          _fmData$FileMap === void 0
            ? void 0
            : _fmData$FileMap.Entry) ||
          (fmData === null ||
          fmData === void 0 ||
          (_fmData$fileMap = fmData.fileMap) === null ||
          _fmData$fileMap === void 0 ||
          (_fmData$fileMap = _fmData$fileMap.entries) === null ||
          _fmData$fileMap === void 0
            ? void 0
            : _fmData$fileMap.entry);
        if (entries) {
          const arr = Array.isArray(entries) ? entries : [entries];
          for (const ent of arr) {
            const rawStaticFile =
              ent['@_StaticFile'] || ent.StaticFile || ent.staticFile;
            const staticFile =
              typeof rawStaticFile === 'string'
                ? rawStaticFile.replace(/\\/g, '/')
                : '';
            if (!staticFile) continue;
            const df = ent.DynamicFiles || ent.dynamicFiles;
            const candidates =
              (df === null || df === void 0 ? void 0 : df.File) ||
              (df === null || df === void 0 ? void 0 : df.file) ||
              (df === null || df === void 0 ? void 0 : df.Files) ||
              (df === null || df === void 0 ? void 0 : df.files);
            const list = Array.isArray(candidates)
              ? candidates
              : candidates
              ? [candidates]
              : [];
            const files = [];
            for (const v of list) {
              if (!v) continue;
              if (typeof v === 'string') files.push(v.replace(/\\/g, '/'));
              else if (typeof v === 'object' && '#text' in v)
                files.push(String(v['#text']).replace(/\\/g, '/'));
            }
            fileMapIndex.set(staticFile, files);
          }
        }
      }
    } catch (_e) {
      /* ignore: optional FileMap.xml may be missing or malformed */
    }
    // First, load styles from Settings0/Styles/styles.xml (Grid3 format)
    const styles = new Map();
    const styleEntry = entries.find(
      entry =>
        entry.entryName.endsWith('styles.xml') ||
        entry.entryName.endsWith('style.xml')
    );
    if (styleEntry) {
      try {
        var _styleData$StyleData, _styleData$Styles;
        const styleXmlContent = decodeText(await readEntryBuffer(styleEntry));
        const styleData = parser.parse(styleXmlContent);
        // Parse styles and store them in the map
        // Grid3 uses StyleData.Styles.Style with Key attribute
        if (
          (_styleData$StyleData = styleData.StyleData) !== null &&
          _styleData$StyleData !== void 0 &&
          (_styleData$StyleData = _styleData$StyleData.Styles) !== null &&
          _styleData$StyleData !== void 0 &&
          _styleData$StyleData.Style
        ) {
          const styleArray = Array.isArray(styleData.StyleData.Styles.Style)
            ? styleData.StyleData.Styles.Style
            : [styleData.StyleData.Styles.Style];
          styleArray.forEach(style => {
            if (style['@_Key']) {
              styles.set(String(style['@_Key']), style);
            }
          });
        }
        // Also handle legacy format with @_ID
        else if (
          (_styleData$Styles = styleData.Styles) !== null &&
          _styleData$Styles !== void 0 &&
          _styleData$Styles.Style
        ) {
          const styleArray = Array.isArray(styleData.Styles.Style)
            ? styleData.Styles.Style
            : [styleData.Styles.Style];
          styleArray.forEach(style => {
            if (style['@_ID']) {
              styles.set(String(style['@_ID']), style);
            }
          });
        }
      } catch (e) {
        console.warn('Failed to parse styles.xml:', e);
      }
    }
    const normalizeEntryName = entryName =>
      entryName.replace(/\\/g, '/').toLowerCase();
    const isGridXmlEntry = entryName => {
      const normalized = normalizeEntryName(entryName);
      if (!normalized.endsWith('grid.xml')) return false;
      return normalized.startsWith('grids/') || normalized.includes('/grids/');
    };
    const gridEntries = entries.filter(e => isGridXmlEntry(e.entryName));
    // Pre-load all image data for conversion to other formats (e.g., Snap)
    const imageDataCache = new Map();
    const imageEntries = entries.filter(e => {
      const name = e.entryName.toLowerCase();
      return (
        name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.gif') ||
        name.endsWith('.svg')
      );
    });
    for (const imageEntry of imageEntries) {
      try {
        const raw = await imageEntry.getData();
        const data = isEncryptedArchive
          ? decryptGridsetEntry(Buffer.from(raw), encryptedContentPassword)
          : raw instanceof Uint8Array
          ? raw
          : new Uint8Array(raw);
        const normalizedEntry = imageEntry.entryName.replace(/\\/g, '/');
        imageDataCache.set(normalizedEntry, data);
      } catch (_err) {
        // Silently fail - individual image loading failures shouldn't break the entire load
      }
    }
    // First pass: collect all grid names and IDs for navigation resolution
    const gridNameToIdMap = new Map();
    const gridIdToNameMap = new Map();
    for (const entry of entries) {
      if (isGridXmlEntry(entry.entryName)) {
        try {
          const xmlContent = decodeText(await readEntryBuffer(entry));
          const data = parser.parse(xmlContent);
          const grid = data.Grid || data.grid;
          if (!grid) continue;
          const gridId = this.textOf(grid.GridGuid || grid.gridGuid || grid.id);
          const gridName =
            this.textOf(grid.Name) ||
            this.textOf(grid.name) ||
            this.textOf(grid['@_Name']);
          const folderMatch = entry.entryName.match(/^Grids\/([^/]+)\//);
          const folderName = folderMatch ? folderMatch[1] : undefined;
          if (gridId) {
            if (gridName) {
              gridNameToIdMap.set(gridName, gridId);
              gridIdToNameMap.set(gridId, gridName);
            }
            if (folderName) {
              // Folder name is often used as the grid name in Jump.To commands
              gridNameToIdMap.set(folderName, gridId);
              if (!gridName) {
                gridIdToNameMap.set(gridId, folderName);
              }
            }
          }
        } catch (_e) {
          // Skip errors in first pass
        }
      }
    }
    // Second pass: process each grid file in the gridset
    for (const entry of entries) {
      // Only process files named grid.xml under Grids/ (any subdir)
      if (isGridXmlEntry(entry.entryName)) {
        var _grid$ColumnDefinitio,
          _grid$RowDefinitions,
          _grid$Cells,
          _grid$cells;
        let xmlContent;
        try {
          const buffer = await readEntryBuffer(entry);
          xmlContent = decodeText(buffer);
        } catch (_e) {
          // Skip unreadable files
          continue;
        }
        let data;
        try {
          data = parser.parse(xmlContent);
        } catch (error) {
          // Skip malformed XML but log the specific error
          console.warn(`Malformed XML in ${entry.entryName}: ${error.message}`);
          continue;
        }
        // Grid3 XML: <Grid> root
        const grid = data.Grid || data.grid;
        if (!grid) {
          console.warn(`[Gridset] No Grid/grid found in ${entry.entryName}`);
          continue;
        }
        // Defensive: GridGuid and Name required
        const gridId = this.textOf(grid.GridGuid || grid.gridGuid || grid.id);
        let gridName =
          this.textOf(grid.Name) ||
          this.textOf(grid.name) ||
          this.textOf(grid['@_Name']);
        if (!gridName) {
          // Fallback: get folder name from entry path
          const match = entry.entryName.match(/^Grids\/([^/]+)\//);
          if (match) gridName = match[1];
        }
        if (!gridId || !gridName) {
          continue;
        }
        const page = new AACPage({
          id: String(gridId),
          name: String(gridName),
          grid: [],
          buttons: [],
          parentId: null,
          style: {
            backgroundColor: grid.BackgroundColour || grid.backgroundColour
          }
        });
        // Calculate grid dimensions from ColumnDefinitions and RowDefinitions
        const columnDefs =
          ((_grid$ColumnDefinitio = grid.ColumnDefinitions) === null ||
          _grid$ColumnDefinitio === void 0
            ? void 0
            : _grid$ColumnDefinitio.ColumnDefinition) || [];
        const rowDefs =
          ((_grid$RowDefinitions = grid.RowDefinitions) === null ||
          _grid$RowDefinitions === void 0
            ? void 0
            : _grid$RowDefinitions.RowDefinition) || [];
        const maxCols = Array.isArray(columnDefs)
          ? columnDefs.length
          : columnDefs
          ? 1
          : 5;
        const maxRows = Array.isArray(rowDefs)
          ? rowDefs.length
          : rowDefs
          ? 1
          : 4;
        // Process buttons: <Cells><Cell>
        const cells =
          ((_grid$Cells = grid.Cells) === null || _grid$Cells === void 0
            ? void 0
            : _grid$Cells.Cell) ||
          ((_grid$cells = grid.cells) === null || _grid$cells === void 0
            ? void 0
            : _grid$cells.cell);
        if (cells) {
          // Cells may be array or single object
          const cellArr = Array.isArray(cells) ? cells : [cells];
          // Create a 2D grid to track button positions
          const gridLayout = [];
          for (let r = 0; r < maxRows; r++) {
            gridLayout[r] = new Array(maxCols).fill(null);
          }
          // Track grid-level prediction wordlists so we can attach them to AutoContent
          const gridPredictionWords = [];
          let predictionCellCounter = 0;
          // Extract words from grid-level AutoContentCommands (e.g., Prediction Bar)
          if (grid.AutoContentCommands) {
            const collections =
              grid.AutoContentCommands.AutoContentCommandCollection;
            const collectionArr = Array.isArray(collections)
              ? collections
              : collections
              ? [collections]
              : [];
            collectionArr.forEach(collection => {
              var _collection$Commands;
              const commands =
                (_collection$Commands = collection.Commands) === null ||
                _collection$Commands === void 0
                  ? void 0
                  : _collection$Commands.Command;
              const commandArr = Array.isArray(commands)
                ? commands
                : commands
                ? [commands]
                : [];
              commandArr.forEach(command => {
                const commandId = command['@_ID'] || command.ID || command.id;
                if (commandId === 'Prediction.PredictThis') {
                  const params = command.Parameter;
                  const paramArr = Array.isArray(params)
                    ? params
                    : params
                    ? [params]
                    : [];
                  const wordListParam = paramArr.find(
                    p => (p['@_Key'] || p.Key || p.key) === 'wordlist'
                  );
                  if (wordListParam) {
                    const words = this._extractWordsFromWordList(wordListParam);
                    gridPredictionWords.push(...words);
                  }
                }
              });
            });
          }
          const pageWordListItems = [];
          if (grid.WordList && grid.WordList.Items) {
            const items =
              grid.WordList.Items.WordListItem ||
              grid.WordList.Items.wordlistitem ||
              [];
            const itemArr = Array.isArray(items) ? items : items ? [items] : [];
            for (const item of itemArr) {
              const text = item.Text || item.text;
              if (text) {
                const val = this.textOf(text);
                if (val) {
                  // Debug: log WordList items with spaces to check extraction
                  if (pageWordListItems.length < 3) {
                  }
                  pageWordListItems.push({
                    text: val,
                    image: item.Image || item.image || undefined,
                    partOfSpeech:
                      item.PartOfSpeech || item.partOfSpeech || undefined
                  });
                }
              }
            }
          }
          if (pageWordListItems.length > 0) {
            page.wordListItems = pageWordListItems.map(item => ({
              text: item.text,
              image: item.image,
              partOfSpeech: item.partOfSpeech
            }));
          }
          // Track WordList AutoContent cells and their positions for "more" button placement
          const wordListAutoContentCells = [];
          let wordListCellIndex = 0;
          // Helper function to find next available position in grid (auto-flow)
          // Returns {x, y} for next available slot that can accommodate the given span
          const findNextAvailablePosition = (width, height, gridLayout) => {
            for (let y = 0; y < maxRows; y++) {
              for (let x = 0; x <= maxCols - width; x++) {
                // Check if this position and the required span area are all free
                let fits = true;
                for (let dy = 0; dy < height && y + dy < maxRows; dy++) {
                  for (let dx = 0; dx < width && x + dx < maxCols; dx++) {
                    if (gridLayout[y + dy][x + dx] !== null) {
                      fits = false;
                      break;
                    }
                  }
                  if (!fits) break;
                }
                if (fits) {
                  return {
                    x,
                    y
                  };
                }
              }
            }
            // If no position found, return 0,0 (will be placed at first available)
            return {
              x: 0,
              y: 0
            };
          };
          // Helper function to find next available X position in a specific row
          const findNextAvailableXInRow = (rowY, width, gridLayout) => {
            for (let x = 0; x <= maxCols - width; x++) {
              let fits = true;
              for (let dx = 0; dx < width; dx++) {
                if (gridLayout[rowY][x + dx] !== null) {
                  fits = false;
                  break;
                }
              }
              if (fits) return x;
            }
            return 0;
          };
          const cellsWithExplicitPosition = [];
          const cellsWithYOnly = [];
          const cellsWithXOnly = [];
          const cellsWithAutoFlow = [];
          cellArr.forEach((cell, idx) => {
            if (!cell || !cell.Content) return;
            const hasX = cell['@_X'] !== undefined;
            const hasY = cell['@_Y'] !== undefined;
            if (hasX && hasY) {
              cellsWithExplicitPosition.push({
                cell,
                idx
              });
            } else if (hasY && !hasX) {
              cellsWithYOnly.push({
                cell,
                idx
              });
            } else if (!hasY && hasX) {
              cellsWithXOnly.push({
                cell,
                idx
              });
            } else {
              cellsWithAutoFlow.push({
                cell,
                idx
              });
            }
          });
          // Process cells in order: explicit -> Y-only -> X-only -> auto-flow
          const allCellsToProcess = [
            ...cellsWithExplicitPosition,
            ...cellsWithYOnly,
            ...cellsWithXOnly,
            ...cellsWithAutoFlow
          ];
          allCellsToProcess.forEach(({ cell, idx }) => {
            var _content$Commands,
              _content$commands,
              _content$Style,
              _symbolLibraryRef,
              _symbolLibraryRef2,
              _predictionWords,
              _predictionWords2;
            // Extract span information first
            const colSpan = parseInt(String(cell['@_ColumnSpan'] || '1'), 10);
            const rowSpan = parseInt(String(cell['@_RowSpan'] || '1'), 10);
            // Determine position based on what attributes are present
            const hasX = cell['@_X'] !== undefined;
            const hasY = cell['@_Y'] !== undefined;
            let cellX;
            let cellY;
            if (hasX && hasY) {
              // Explicit position: both X and Y provided
              // Grid 3 XML coordinates are already 0-based, use them directly
              cellX = Math.max(0, parseInt(String(cell['@_X']), 10));
              cellY = Math.max(0, parseInt(String(cell['@_Y']), 10));
            } else if (hasY && !hasX) {
              // Y-only: auto-flow X in the specified row
              // Grid 3 XML coordinates are already 0-based, use them directly
              cellY = Math.max(0, parseInt(String(cell['@_Y']), 10));
              cellX = findNextAvailableXInRow(cellY, colSpan, gridLayout);
            } else if (!hasY && hasX) {
              // X-only: place at specified X in next available row
              // Grid 3 XML coordinates are already 0-based, use them directly
              cellX = Math.max(0, parseInt(String(cell['@_X']), 10));
              // Find first row where this X position is available
              cellY = 0;
              let found = false;
              for (let y = 0; y < maxRows; y++) {
                let fits = true;
                for (let dx = 0; dx < colSpan && cellX + dx < maxCols; dx++) {
                  if (gridLayout[y][cellX + dx] !== null) {
                    fits = false;
                    break;
                  }
                }
                if (fits) {
                  cellY = y;
                  found = true;
                  break;
                }
              }
              if (!found) {
                // No available row found, use auto-flow
                const pos = findNextAvailablePosition(
                  colSpan,
                  rowSpan,
                  gridLayout
                );
                cellX = pos.x;
                cellY = pos.y;
              }
            } else {
              // No position: auto-flow both X and Y
              const pos = findNextAvailablePosition(
                colSpan,
                rowSpan,
                gridLayout
              );
              cellX = pos.x;
              cellY = pos.y;
            }
            // Extract scan block number (1-8) for block scanning support
            const scanBlock = parseInt(String(cell['@_ScanBlock'] || '1'), 10);
            // Extract visibility from Grid 3's <Visibility> child element
            // Grid 3 stores visibility as a child element, not an attribute
            // Valid values: Visible, Hidden, Disabled, PointerAndTouchOnly, TouchOnly, PointerOnly
            const grid3Visibility = cell.Visibility || cell.visibility;
            // Map Grid 3 visibility values to AAC standard values
            // Grid 3 can have additional values like TouchOnly, PointerOnly that map to PointerAndTouchOnly
            let cellVisibility;
            if (grid3Visibility) {
              const vis = String(grid3Visibility);
              // Direct mapping for standard values
              if (
                vis === 'Visible' ||
                vis === 'Hidden' ||
                vis === 'Disabled' ||
                vis === 'PointerAndTouchOnly'
              ) {
                cellVisibility = vis;
              }
              // Map Grid 3 specific values to AAC standard
              else if (vis === 'TouchOnly' || vis === 'PointerOnly') {
                cellVisibility = 'PointerAndTouchOnly';
              }
              // Grid 3 may use 'Empty' for cells that exist but have no content
              else if (vis === 'Empty') {
                cellVisibility = 'Empty';
              }
              // Unknown visibility - default to Visible
              else {
                cellVisibility = undefined; // Let it default
              }
            }
            // Extract label from CaptionAndImage/Caption
            const content = cell.Content;
            const captionAndImage =
              content.CaptionAndImage || content.captionAndImage;
            let label =
              this.textOf(
                (captionAndImage === null || captionAndImage === void 0
                  ? void 0
                  : captionAndImage.Caption) ||
                  (captionAndImage === null || captionAndImage === void 0
                    ? void 0
                    : captionAndImage.caption)
              ) || '';
            // Check if cell has an image/symbol (needed to decide if we should keep it)
            const hasImageCandidate = !!(
              (captionAndImage !== null &&
                captionAndImage !== void 0 &&
                captionAndImage.Image) ||
              (captionAndImage !== null &&
                captionAndImage !== void 0 &&
                captionAndImage.image) ||
              (captionAndImage !== null &&
                captionAndImage !== void 0 &&
                captionAndImage.ImageName) ||
              (captionAndImage !== null &&
                captionAndImage !== void 0 &&
                captionAndImage.imageName) ||
              (captionAndImage !== null &&
                captionAndImage !== void 0 &&
                captionAndImage.Symbol) ||
              (captionAndImage !== null &&
                captionAndImage !== void 0 &&
                captionAndImage.symbol)
            );
            // If no caption, try other sources or create a placeholder
            if (!label) {
              // For cells without captions, check if they have images/symbols before skipping
              if (content.ContentType === 'AutoContent') {
                label = `AutoContent_${idx}`;
              } else if (
                hasImageCandidate ||
                content.ContentType === 'Workspace' ||
                content.ContentType === 'LiveCell'
              ) {
                // Keep cells with images/symbols even if no caption
                label = `Cell_${idx}`;
              } else {
                return; // Skip cells without labels AND without images/symbols
              }
            }
            let message = label; // Use caption as message
            // Detect plugin cell type (Workspace, LiveCell, AutoContent)
            const pluginMetadata = detectPluginCellType(content);
            // Friendly labels for workspace/prediction cells when captions are missing
            if (pluginMetadata.cellType === Grid3CellType.Workspace) {
              if (!label || label.startsWith('Cell_')) {
                label =
                  pluginMetadata.displayName ||
                  pluginMetadata.subType ||
                  pluginMetadata.pluginId ||
                  'Workspace';
              }
            }
            if (
              pluginMetadata.cellType === Grid3CellType.AutoContent &&
              pluginMetadata.autoContentType === 'Prediction'
            ) {
              predictionCellCounter += 1;
              // Always surface a friendly label for predictions even if a placeholder exists
              label = `Prediction ${predictionCellCounter}`;
            }
            // Handle WordList AutoContent cells - populate from page-level WordList
            let isMoreButton = false;
            if (
              pluginMetadata.cellType === Grid3CellType.AutoContent &&
              pluginMetadata.autoContentType === 'WordList' &&
              pageWordListItems.length > 0
            ) {
              // Track this cell for potential "more" button
              wordListAutoContentCells.push({
                cell,
                idx,
                x: cellX,
                y: cellY
              });
              // Check if we have more WordList items than available cells
              // The "more" button replaces the last WordList cell
              const cellsNeededForWordList = pageWordListItems.length;
              const availableWordListCells = wordListAutoContentCells.length;
              const isLastWordListCell =
                availableWordListCells === cellsNeededForWordList + 1; // +1 for "more" button
              if (isLastWordListCell) {
                // This cell becomes the "more" button
                label = 'more...';
                message = 'more...';
                isMoreButton = true;
              } else if (wordListCellIndex < pageWordListItems.length) {
                // Populate this cell with the next WordList item
                const wordListItem = pageWordListItems[wordListCellIndex];
                label = wordListItem.text;
                message = wordListItem.text;
                // Use the WordList item's image if available
                if (wordListItem.image && !label) {
                  label = wordListItem.image; // Fallback to image path if no text
                }
                wordListCellIndex++;
              } else {
                // No more WordList items - skip this cell
                return;
              }
            }
            // Parse all command types from Grid3 and create semantic actions
            let semanticAction;
            let _legacyAction = null;
            // infer action type implicitly from commands; no explicit enum needed
            let navigationTarget;
            let detectedCommands = []; // Store detected command metadata
            let buttonPos; // Part-of-speech from Action.InsertText
            const commands =
              ((_content$Commands = content.Commands) === null ||
              _content$Commands === void 0
                ? void 0
                : _content$Commands.Command) ||
              ((_content$commands = content.commands) === null ||
              _content$commands === void 0
                ? void 0
                : _content$commands.command);
            let predictionWords;
            // Resolve image for this cell using FileMap and coordinate heuristics
            const imageCandidate =
              (captionAndImage === null || captionAndImage === void 0
                ? void 0
                : captionAndImage.Image) ||
              (captionAndImage === null || captionAndImage === void 0
                ? void 0
                : captionAndImage.image) ||
              (captionAndImage === null || captionAndImage === void 0
                ? void 0
                : captionAndImage.ImageName) ||
              (captionAndImage === null || captionAndImage === void 0
                ? void 0
                : captionAndImage.imageName) ||
              (captionAndImage === null || captionAndImage === void 0
                ? void 0
                : captionAndImage.Symbol) ||
              (captionAndImage === null || captionAndImage === void 0
                ? void 0
                : captionAndImage.symbol);
            const declaredImageName = imageCandidate
              ? this.textOf(imageCandidate)
              : undefined;
            const gridEntryPath = entry.entryName.replace(/\\/g, '/');
            const baseDir = gridEntryPath.replace(/\/grid\.xml$/, '/');
            const dynamicFiles = fileMapIndex.get(gridEntryPath) || [];
            const resolvedImageEntry =
              resolveGrid3CellImage(
                null,
                {
                  baseDir,
                  imageName: declaredImageName,
                  x: cellX,
                  y: cellY,
                  dynamicFiles
                },
                entries
              ) || undefined;
            // Load binary image data from cache for conversion to other formats (e.g., Snap)
            const imageData = resolvedImageEntry
              ? imageDataCache.get(resolvedImageEntry)
              : undefined;
            // Check if image is a symbol library reference
            let symbolLibraryRef = null;
            if (
              declaredImageName &&
              isSymbolLibraryReference(declaredImageName)
            ) {
              symbolLibraryRef = parseSymbolReference(declaredImageName);
            }
            if (commands) {
              const commandArr = Array.isArray(commands)
                ? commands
                : [commands];
              detectedCommands = commandArr.map(cmd => detectCommand(cmd));
              // Scan all commands for vocabulary (predictions) before identifying primary action
              commandArr.forEach(cmd => {
                const id = cmd['@_ID'] || cmd.ID || cmd.id;
                if (id === 'Prediction.PredictThis') {
                  const params = cmd.Parameter || cmd.parameter;
                  const pArr = params
                    ? Array.isArray(params)
                      ? params
                      : [params]
                    : [];
                  let wlP;
                  for (const p of pArr) {
                    if (
                      p['@_Key'] === 'wordlist' ||
                      p.Key === 'wordlist' ||
                      p.key === 'wordlist'
                    ) {
                      wlP = p;
                      break;
                    }
                  }
                  if (wlP) {
                    const words = this._extractWordsFromWordList(wlP);
                    if (words.length > 0) {
                      predictionWords = words;
                    }
                  }
                }
              });
              for (const command of commandArr) {
                const commandId = command['@_ID'] || command.ID || command.id;
                const parameters = command.Parameter || command.parameter;
                const paramArr = parameters
                  ? Array.isArray(parameters)
                    ? parameters
                    : [parameters]
                  : [];
                // Helper to get raw parameter object
                const getRawParam = key => {
                  for (const param of paramArr) {
                    if (
                      param['@_Key'] === key ||
                      param.Key === key ||
                      param.key === key
                    ) {
                      return param;
                    }
                  }
                  return undefined;
                };
                // Helper to get parameter value
                const getParam = key => {
                  var _ref, _param$Text;
                  const param = getRawParam(key);
                  if (param === undefined) return undefined;
                  if (typeof param === 'string') return param;
                  if (
                    param.p ||
                    param.s ||
                    (param.r !== undefined && typeof param.r !== 'string')
                  ) {
                    const structuredValue = this.textOf(param);
                    if (structuredValue !== undefined) return structuredValue;
                  }
                  const simpleValue =
                    (_ref =
                      (_param$Text = param['#text']) !== null &&
                      _param$Text !== void 0
                        ? _param$Text
                        : param.text) !== null && _ref !== void 0
                      ? _ref
                      : param.value;
                  if (typeof simpleValue === 'string') return simpleValue;
                  if (typeof simpleValue === 'number')
                    return String(simpleValue);
                  const structuredValue = this.textOf(param);
                  if (structuredValue !== undefined) return structuredValue;
                  return undefined;
                };
                // Skip PredictThis in primary action loop as it was handled in pre-pass
                // unless we need a primary action and nothing else exists
                if (commandId === 'Prediction.PredictThis') {
                  const wlParam = getRawParam('wordlist');
                  const words = wlParam
                    ? this._extractWordsFromWordList(wlParam)
                    : [];
                  if (words.length > 0) {
                    predictionWords = words;
                  }
                  if (!semanticAction && words.length > 0) {
                    semanticAction = {
                      category: AACSemanticCategory.COMMUNICATION,
                      intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                      text: words.slice(0, 3).join(', '),
                      platformData: {
                        grid3: {
                          commandId,
                          parameters: {
                            wordlist: words
                          }
                        }
                      },
                      fallback: {
                        type: 'ACTION',
                        message: 'Predict words'
                      }
                    };
                  }
                  continue;
                }
                switch (commandId) {
                  case 'Jump.To': {
                    const gridTarget = getParam('grid');
                    if (gridTarget) {
                      // Resolve grid name to grid ID for navigation
                      const targetGridId =
                        gridNameToIdMap.get(gridTarget) || gridTarget;
                      // Always set navigationTarget even if another command already
                      // set semanticAction (e.g. Jump.SetBookmark + Jump.To).
                      navigationTarget = targetGridId;
                      // Only set semanticAction if not already set by a prior command
                      if (!semanticAction) {
                        semanticAction = {
                          category: AACSemanticCategory.NAVIGATION,
                          intent: AACSemanticIntent.NAVIGATE_TO,
                          targetId: targetGridId,
                          platformData: {
                            grid3: {
                              commandId,
                              parameters: {
                                grid: gridTarget
                              }
                            }
                          },
                          fallback: {
                            type: 'NAVIGATE',
                            targetPageId: targetGridId
                          }
                        };
                        _legacyAction = {
                          type: 'NAVIGATE',
                          targetPageId: targetGridId
                        };
                      }
                    }
                    break;
                  }
                  case 'Jump.Back':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.NAVIGATION,
                        intent: AACSemanticIntent.GO_BACK,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Go back'
                        }
                      };
                      _legacyAction = {
                        type: 'GO_BACK'
                      };
                    }
                    break;
                  case 'Jump.Home':
                  case 'Jump.SetHome':
                    if (!navigationTarget)
                      navigationTarget = tree.rootId || undefined;
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.NAVIGATION,
                        intent: AACSemanticIntent.GO_HOME,
                        targetId: tree.rootId || undefined,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Go home'
                        }
                      };
                      _legacyAction = {
                        type: 'GO_HOME'
                      };
                    }
                    break;
                  case 'Jump.ToKeyboard': {
                    var _tree$metadata;
                    // Prefer explicit keyboard page metadata when available.
                    // Some Gridsets resolve the keyboard page in metadata
                    // without preserving tree.keyboardGridName during parse.
                    const keyboardGridName = tree.keyboardGridName;
                    const keyboardPageId =
                      ((_tree$metadata = tree.metadata) === null ||
                      _tree$metadata === void 0
                        ? void 0
                        : _tree$metadata.defaultKeyboardPageId) ||
                      gridNameToIdMap.get(keyboardGridName);
                    if (keyboardPageId && !navigationTarget) {
                      navigationTarget = keyboardPageId;
                    }
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.NAVIGATION,
                        intent: AACSemanticIntent.GO_HOME,
                        // Close enough to 'navigation to keyboard'
                        targetId: keyboardPageId,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'NAVIGATE',
                          targetPageId: keyboardPageId
                        }
                      };
                    }
                    break;
                  }
                  case 'Action.InsertTextAndSpeak': {
                    if (!semanticAction) {
                      const insertText = getParam('text');
                      semanticAction = {
                        category: AACSemanticCategory.COMMUNICATION,
                        intent: AACSemanticIntent.SPEAK_IMMEDIATE,
                        text: insertText,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              text: insertText
                            }
                          }
                        },
                        fallback: {
                          type: 'SPEAK',
                          message: insertText
                        }
                      };
                    }
                    break;
                  }
                  case 'Prediction.PredictThis': {
                    const wlParam = getRawParam('wordlist');
                    const words = wlParam
                      ? this._extractWordsFromWordList(wlParam)
                      : [];
                    if (words.length > 0) {
                      predictionWords = words;
                      if (!semanticAction) {
                        semanticAction = {
                          category: AACSemanticCategory.COMMUNICATION,
                          intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                          text: words.slice(0, 3).join(', '),
                          // Provide first few as preview
                          platformData: {
                            grid3: {
                              commandId,
                              parameters: {
                                wordlist: words
                              }
                            }
                          },
                          fallback: {
                            type: 'ACTION',
                            message: 'Predict words'
                          }
                        };
                      }
                    }
                    // Continue to check other commands (e.g. Action.InsertText)
                    continue;
                  }
                  case 'Action.Speak': {
                    // speak
                    const speakUnit = getParam('unit');
                    const moveCaret = getParam('movecaret');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.COMMUNICATION,
                        intent: AACSemanticIntent.SPEAK_TEXT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              unit: speakUnit,
                              movecaret: moveCaret
                            }
                          }
                        },
                        fallback: {
                          type: 'SPEAK',
                          message: 'Speak text'
                        }
                      };
                      _legacyAction = {
                        type: 'SPEAK',
                        unit: speakUnit,
                        moveCaret: moveCaret
                          ? parseInt(String(moveCaret))
                          : undefined
                      };
                    }
                    break;
                  }
                  case 'Action.InsertText': {
                    const insertText = getParam('text');
                    const posParam = getParam('pos');
                    // Always extract POS even if semanticAction is already set
                    if (posParam) {
                      buttonPos = posParam;
                    }
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.COMMUNICATION,
                        intent: AACSemanticIntent.INSERT_TEXT,
                        text: insertText,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              text: insertText,
                              pos: posParam
                            }
                          }
                        },
                        fallback: {
                          type: 'SPEAK',
                          message: insertText
                        }
                      };
                      _legacyAction = {
                        type: 'INSERT_TEXT',
                        text: insertText
                      };
                    }
                    break;
                  }
                  case 'Action.DeleteWord':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.DELETE_WORD,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Delete word'
                        }
                      };
                      _legacyAction = {
                        type: 'DELETE_WORD'
                      };
                    }
                    break;
                  case 'Action.DeleteLetter':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.DELETE_CHARACTER,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Delete character'
                        }
                      };
                      _legacyAction = {
                        type: 'DELETE_CHARACTER'
                      };
                    }
                    break;
                  case 'Action.Clear':
                    // action
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.CLEAR_TEXT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Clear text'
                        }
                      };
                      _legacyAction = {
                        type: 'CLEAR_TEXT'
                      };
                    }
                    break;
                  case 'Action.Letter': {
                    // action
                    const letter = getParam('letter');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.INSERT_TEXT,
                        text: letter,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              letter
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: letter
                        }
                      };
                      _legacyAction = {
                        type: 'INSERT_LETTER',
                        letter
                      };
                    }
                    break;
                  }
                  case 'Settings.RestAll':
                    // action
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.CUSTOM,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              indicatorenabled: getParam('indicatorenabled'),
                              action: getParam('action')
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Settings action'
                        }
                      };
                      _legacyAction = {
                        type: 'SETTINGS',
                        indicatorEnabled: getParam('indicatorenabled') === '1',
                        settingsAction: getParam('action')
                      };
                    }
                    break;
                  case 'AutoContent.Activate':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.CUSTOM,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              autocontenttype: getParam('autocontenttype')
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Auto content'
                        }
                      };
                      _legacyAction = {
                        type: 'AUTO_CONTENT',
                        autoContentType: getParam('autocontenttype')
                      };
                    }
                    break;
                  // --- Navigation extras ---
                  case 'Jump.SetBookmark':
                  case 'Jump.Favorite':
                    if (!semanticAction) {
                      const params = {};
                      const fav = getParam('favorite');
                      if (fav) params.favorite = fav;
                      const act = getParam('action');
                      if (act) params.action = act;
                      const ind = getParam('indicatorenabled');
                      if (ind) params.indicatorenabled = ind;
                      semanticAction = {
                        category: AACSemanticCategory.NAVIGATION,
                        intent:
                          commandId === 'Jump.SetBookmark'
                            ? AACSemanticIntent.TOGGLE_STATE
                            : AACSemanticIntent.NAVIGATE_TO,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: params
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message:
                            commandId === 'Jump.SetBookmark'
                              ? 'Toggle bookmark'
                              : 'Jump to favorite'
                        }
                      };
                    }
                    break;
                  // --- Text input / keyboard ---
                  case 'Action.Space':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.INSERT_TEXT,
                        text: ' ',
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Space'
                        }
                      };
                    }
                    break;
                  case 'Action.Enter':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.INSERT_TEXT,
                        text: '\n',
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Enter'
                        }
                      };
                    }
                    break;
                  case 'Action.Number':
                  case 'Action.Punctuation': {
                    const ch = getParam('letter');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.INSERT_TEXT,
                        text: ch,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              letter: ch
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: ch
                        }
                      };
                    }
                    break;
                  }
                  case 'Action.Backspace':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.DELETE_CHARACTER,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Backspace'
                        }
                      };
                    }
                    break;
                  case 'Action.Copy':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.COPY_TEXT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Copy'
                        }
                      };
                    }
                    break;
                  case 'Action.Paste':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.PASTE_TEXT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Paste'
                        }
                      };
                    }
                    break;
                  case 'Action.SelectAll':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.SELECT_ALL,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Select all'
                        }
                      };
                    }
                    break;
                  case 'Action.NextLetter':
                  case 'Action.PreviousLetter':
                  case 'Action.NextWord':
                  case 'Action.PreviousWord':
                  case 'Action.DocumentStart':
                  case 'Action.DocumentEnd': {
                    const dirMap = {
                      'Action.NextLetter': 'next_letter',
                      'Action.PreviousLetter': 'previous_letter',
                      'Action.NextWord': 'next_word',
                      'Action.PreviousWord': 'previous_word',
                      'Action.DocumentStart': 'document_start',
                      'Action.DocumentEnd': 'document_end'
                    };
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.CURSOR_MOVE,
                        parameters: {
                          direction: dirMap[commandId]
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Cursor ${dirMap[commandId].replace(
                            '_',
                            ' '
                          )}`
                        }
                      };
                    }
                    break;
                  }
                  case 'Action.UndoWorkspaceEdit':
                  case 'Action.UndoClear':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.UNDO,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Undo'
                        }
                      };
                    }
                    break;
                  case 'Action.Print':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.PRINT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Print'
                        }
                      };
                    }
                    break;
                  case 'Action.SpeakNothing':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.COMMUNICATION,
                        intent: AACSemanticIntent.SPEAK_TEXT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'SPEAK',
                          message: 'Speak'
                        }
                      };
                    }
                    break;
                  // --- Speech ---
                  case 'Speech.Stop':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.COMMUNICATION,
                        intent: AACSemanticIntent.STOP_SPEECH,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Stop speech'
                        }
                      };
                    }
                    break;
                  case 'SpeechPlaySound': {
                    const soundFile = getParam('filedata');
                    const waitSound = getParam('wait');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.MEDIA,
                        intent: AACSemanticIntent.PLAY_SOUND,
                        parameters: {
                          wait: waitSound
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              filedata: soundFile,
                              wait: waitSound
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Play sound'
                        }
                      };
                    }
                    break;
                  }
                  case 'Speech.ChangePublicVoice':
                  case 'Speech.ChangePublicSpeed':
                  case 'Speech.ChangePublicPitch':
                  case 'Speech.ChangePublicVolume':
                    if (!semanticAction) {
                      const speechParams = {};
                      for (const p of paramArr) {
                        var _p$Text;
                        const k = p['@_Key'] || p.Key || p.key;
                        if (k)
                          speechParams[k] =
                            (_p$Text = p['#text']) !== null &&
                            _p$Text !== void 0
                              ? _p$Text
                              : p.text;
                      }
                      semanticAction = {
                        category: AACSemanticCategory.ACCESSIBILITY,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: speechParams
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Change ${commandId.split('.').pop()}`
                        }
                      };
                    }
                    break;
                  // --- Computer Control ---
                  case 'ComputerControl.Keyboard': {
                    const keystring = getParam('keystring');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.SEND_KEYS,
                        text: keystring,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              keystring
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Send keys: ${keystring}`
                        }
                      };
                    }
                    break;
                  }
                  case 'ComputerControl.SendKeys': {
                    const keys = getParam('keys');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.SEND_KEYS,
                        text: keys,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              keys
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Send keys: ${keys}`
                        }
                      };
                    }
                    break;
                  }
                  case 'ComputerControl.LeftClick':
                  case 'ComputerControl.RightClick':
                  case 'ComputerControl.DoubleClick':
                  case 'Mouse.LeftClick':
                  case 'Mouse.RightClick':
                  case 'Mouse.DoubleClick':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.MOUSE_CLICK,
                        parameters: {
                          clickType: commandId.includes('Right')
                            ? 'right'
                            : commandId.includes('Double')
                            ? 'double'
                            : 'left'
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.split('.').pop()
                        }
                      };
                    }
                    break;
                  case 'ComputerControl.MouseMove':
                  case 'Mouse.Move': {
                    const mx = getParam('x');
                    const my = getParam('y');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.MOUSE_CLICK,
                        parameters: {
                          action: 'move',
                          x: mx,
                          y: my
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              x: mx,
                              y: my
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Move mouse'
                        }
                      };
                    }
                    break;
                  }
                  case 'ComputerControl.WindowsKey':
                  case 'ComputerControl.MenuKey':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.SEND_KEYS,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.split('.').pop()
                        }
                      };
                    }
                    break;
                  case 'ComputerControl.Shift':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.TOGGLE_STATE,
                        parameters: {
                          target: 'shift',
                          action: getParam('action')
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              action: getParam('action')
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Toggle shift'
                        }
                      };
                    }
                    break;
                  case 'ComputerControl.DeviceMute':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.DEVICE_MUTE,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              indicatorenabled: getParam('indicatorenabled')
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Mute device'
                        }
                      };
                    }
                    break;
                  // --- Web Browser ---
                  case 'WebBrowser.Navigate':
                  case 'WebBrowser.NavigateUrl': {
                    const url = getParam('url');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_NAVIGATE,
                        text: url,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              url
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: url ? `Navigate to ${url}` : 'Navigate'
                        }
                      };
                    }
                    break;
                  }
                  case 'WebBrowser.Back':
                  case 'WebBrowser.Forward':
                  case 'WebBrowser.Refresh':
                  case 'WebBrowser.Reload':
                  case 'WebBrowser.Stop':
                  case 'WebBrowser.Home':
                  case 'WebAddress.Go':
                    if (!semanticAction) {
                      const webActionLabels = {
                        'WebBrowser.Back': 'Back',
                        'WebBrowser.Forward': 'Forward',
                        'WebBrowser.Refresh': 'Refresh',
                        'WebBrowser.Reload': 'Reload',
                        'WebBrowser.Stop': 'Stop loading',
                        'WebBrowser.Home': 'Home',
                        'WebAddress.Go': 'Go to address'
                      };
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_NAVIGATE,
                        parameters: {
                          webAction: commandId
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: webActionLabels[commandId] || commandId
                        }
                      };
                    }
                    break;
                  case 'WebBrowser.ScrollUp':
                  case 'WebBrowser.ScrollDown':
                  case 'WebBrowser.ScrollLeft':
                  case 'WebBrowser.ScrollRight': {
                    const scrollSize = getParam('size');
                    const scrollDir = commandId
                      .replace('WebBrowser.Scroll', '')
                      .toLowerCase();
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_SCROLL,
                        parameters: {
                          direction: scrollDir,
                          size: scrollSize
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              size: scrollSize
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Scroll ${scrollDir}`
                        }
                      };
                    }
                    break;
                  }
                  case 'WebBrowser.ZoomIn':
                  case 'WebBrowser.ZoomOut':
                  case 'WebBrowser.SetZoom': {
                    const zoomOption = getParam('option');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_SCROLL,
                        parameters: {
                          action: 'zoom',
                          option:
                            zoomOption || commandId.replace('WebBrowser.', '')
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: zoomOption
                              ? {
                                  option: zoomOption
                                }
                              : {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('WebBrowser.', '')
                        }
                      };
                    }
                    break;
                  }
                  case 'WebBrowser.SpatialNavigateUp':
                  case 'WebBrowser.SpatialNavigateDown':
                  case 'WebBrowser.SpatialNavigateLeft':
                  case 'WebBrowser.SpatialNavigateRight':
                  case 'WebBrowser.NextElement':
                  case 'WebBrowser.PreviousElement': {
                    const focusDir = commandId.includes('Spatial')
                      ? commandId
                          .replace('WebBrowser.SpatialNavigate', '')
                          .toLowerCase()
                      : commandId === 'WebBrowser.NextElement'
                      ? 'next'
                      : 'previous';
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_FOCUS_ELEMENT,
                        parameters: {
                          direction: focusDir
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Focus ${focusDir} element`
                        }
                      };
                    }
                    break;
                  }
                  case 'WebBrowser.ActivateElement':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_ACTIVATE_ELEMENT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Activate element'
                        }
                      };
                    }
                    break;
                  case 'WebBrowser.ReadingMode':
                  case 'WebBrowser.InsertMobileSite': {
                    const toggleAction = getParam('action');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.TOGGLE_STATE,
                        parameters: {
                          target: commandId.replace('WebBrowser.', ''),
                          action: toggleAction
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              action: toggleAction
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('WebBrowser.', '')
                        }
                      };
                    }
                    break;
                  }
                  case 'WebBrowser.ExecuteJavaScript': {
                    const jsCommandId = getParam('commandid');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_EXECUTE_SCRIPT,
                        text: jsCommandId,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              commandid: jsCommandId
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Execute: ${jsCommandId}`
                        }
                      };
                    }
                    break;
                  }
                  case 'WebBrowser.SpeakJavascriptFunction': {
                    const speakCmdId = getParam('commandid');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_EXECUTE_SCRIPT,
                        parameters: {
                          speak: true
                        },
                        text: speakCmdId,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              commandid: speakCmdId
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Read aloud: ${speakCmdId}`
                        }
                      };
                    }
                    break;
                  }
                  case 'WebBrowser.FavoriteAdd':
                  case 'WebBrowser.InsertFavourite':
                  case 'WebBrowser.DeleteFavourite':
                  case 'WebBrowser.MoreLinks': {
                    const favParams = {};
                    for (const p of paramArr) {
                      var _p$Text2;
                      const k = p['@_Key'] || p.Key || p.key;
                      if (k)
                        favParams[k] =
                          (_p$Text2 = p['#text']) !== null &&
                          _p$Text2 !== void 0
                            ? _p$Text2
                            : p.text;
                    }
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WEB_NAVIGATE,
                        parameters: {
                          webAction: commandId
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: favParams
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('WebBrowser.', '')
                        }
                      };
                    }
                    break;
                  }
                  // --- Media ---
                  case 'Media.PlayPause':
                  case 'Media.Next':
                  case 'Media.Previous':
                  case 'Media.VolumeUp':
                  case 'Media.VolumeDown':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.MEDIA,
                        intent: AACSemanticIntent.PLAY_VIDEO,
                        parameters: {
                          mediaAction: commandId.replace('Media.', '')
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Media.', '')
                        }
                      };
                    }
                    break;
                  case 'Media.Stop':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.MEDIA,
                        intent: AACSemanticIntent.STOP_MEDIA,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Stop'
                        }
                      };
                    }
                    break;
                  // --- MusicVideo ---
                  case 'MusicVideo.ListVideos':
                  case 'MusicVideo.MoreMusicVideos':
                  case 'MusicVideo.SetVideoFolder':
                  case 'MusicVideo.Stop':
                  case 'MusicVideo.StoreAsAttachmentCommandId': {
                    const mvParams = {};
                    for (const p of paramArr) {
                      var _p$Text3;
                      const k = p['@_Key'] || p.Key || p.key;
                      if (k)
                        mvParams[k] =
                          (_p$Text3 = p['#text']) !== null &&
                          _p$Text3 !== void 0
                            ? _p$Text3
                            : p.text;
                    }
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.MEDIA,
                        intent:
                          commandId === 'MusicVideo.Stop'
                            ? AACSemanticIntent.STOP_MEDIA
                            : AACSemanticIntent.PLAY_VIDEO,
                        parameters: mvParams,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: mvParams
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('MusicVideo.', '')
                        }
                      };
                    }
                    break;
                  }
                  // --- Photos ---
                  case 'Photos.Snapshot':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.MEDIA,
                        intent: AACSemanticIntent.TAKE_PHOTO,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Take photo'
                        }
                      };
                    }
                    break;
                  case 'Photos.ChangeCamera':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.MEDIA,
                        intent: AACSemanticIntent.TOGGLE_STATE,
                        parameters: {
                          target: 'camera'
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              indicatorenabled: getParam('indicatorenabled')
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Change camera'
                        }
                      };
                    }
                    break;
                  case 'Photos.MorePhotos':
                  case 'Photos.MyPictures':
                  case 'Photos.SnapshotsFolder':
                  case 'Photos.StoreAsAttachment':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.MEDIA,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Photos.', '')
                        }
                      };
                    }
                    break;
                  // --- Command Execution ---
                  case 'CommandExecution.Wait': {
                    const waitTime = getParam('waittime');
                    const cancellable = getParam('cancellable');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.WAIT,
                        parameters: {
                          waittime: waitTime,
                          cancellable
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              waittime: waitTime,
                              cancellable
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Wait ${waitTime}`
                        }
                      };
                    }
                    break;
                  }
                  case 'CommandExecution.AutoRepeat': {
                    const repeatCount = getParam('repeatcount');
                    const repeatGap = getParam('repeatgap');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.REPEAT_COMMANDS,
                        parameters: {
                          repeatcount: repeatCount,
                          repeatgap: repeatGap
                        },
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              repeatcount: repeatCount,
                              repeatgap: repeatGap
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Repeat ${repeatCount} times`
                        }
                      };
                    }
                    break;
                  }
                  // --- Settings ---
                  case 'Settings.GridExplorer':
                  case 'Settings.Open':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Settings.', '')
                        }
                      };
                    }
                    break;
                  case 'Settings.RequiredFeature': {
                    const feature = getParam('feature');
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.ACCESSIBILITY,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              feature
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: `Require ${feature}`
                        }
                      };
                    }
                    break;
                  }
                  case 'Scanning.Start':
                  case 'Scanning.Stop':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.ACCESSIBILITY,
                        intent:
                          commandId === 'Scanning.Start'
                            ? AACSemanticIntent.SCAN_NEXT
                            : AACSemanticIntent.SCAN_SELECT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Scanning.', '')
                        }
                      };
                    }
                    break;
                  // --- Auto Content extras ---
                  case 'Prediction.Clear':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.TEXT_EDITING,
                        intent: AACSemanticIntent.CLEAR_TEXT,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Clear predictions'
                        }
                      };
                    }
                    break;
                  case 'Prediction.AddToWordList':
                  case 'Prediction.DeleteWord':
                  case 'Prediction.MoreWords': {
                    const predParams = {};
                    for (const p of paramArr) {
                      var _p$Text4;
                      const k = p['@_Key'] || p.Key || p.key;
                      if (k)
                        predParams[k] =
                          (_p$Text4 = p['#text']) !== null &&
                          _p$Text4 !== void 0
                            ? _p$Text4
                            : p.text;
                    }
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.CUSTOM,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: predParams
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Prediction.', '')
                        }
                      };
                    }
                    break;
                  }
                  case 'Grammar.Change':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.CUSTOM,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              context: getParam('context')
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: 'Change grammar'
                        }
                      };
                    }
                    break;
                  // --- System ---
                  case 'System.LogOff':
                  case 'System.Lock':
                  case 'System.Sleep':
                  case 'System.Restart':
                  case 'System.ShutDown':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('System.', '')
                        }
                      };
                    }
                    break;
                  // --- Window ---
                  case 'Window.Minimize':
                  case 'Window.Maximize':
                  case 'Window.Close':
                  case 'Window.Switch':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Window.', '')
                        }
                      };
                    }
                    break;
                  // --- Email ---
                  case 'Email.SendTo':
                  case 'Email.AddRecipient':
                  case 'Email.SetSubject':
                  case 'Email.AttachFile': {
                    const emailParams = {};
                    for (const p of paramArr) {
                      var _p$Text5;
                      const k = p['@_Key'] || p.Key || p.key;
                      if (k)
                        emailParams[k] =
                          (_p$Text5 = p['#text']) !== null &&
                          _p$Text5 !== void 0
                            ? _p$Text5
                            : p.text;
                    }
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: emailParams
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Email.', '')
                        }
                      };
                    }
                    break;
                  }
                  // --- Phone ---
                  case 'Phone.Call':
                  case 'Phone.Answer':
                  case 'Phone.Hangup':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {}
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Phone.', '')
                        }
                      };
                    }
                    break;
                  // --- SMS ---
                  case 'Sms.SendTo':
                  case 'Sms.AddRecipient': {
                    const smsParams = {};
                    for (const p of paramArr) {
                      var _p$Text6;
                      const k = p['@_Key'] || p.Key || p.key;
                      if (k)
                        smsParams[k] =
                          (_p$Text6 = p['#text']) !== null &&
                          _p$Text6 !== void 0
                            ? _p$Text6
                            : p.text;
                    }
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: smsParams
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('Sms.', '')
                        }
                      };
                    }
                    break;
                  }
                  // --- Environment Control ---
                  case 'EnvControl.Send':
                  case 'EnvControl.Learn':
                    if (!semanticAction) {
                      semanticAction = {
                        category: AACSemanticCategory.SYSTEM_CONTROL,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: {
                              code: getParam('code')
                            }
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId.replace('EnvControl.', '')
                        }
                      };
                    }
                    break;
                  default:
                    if (commandId && !semanticAction) {
                      const allParams = Object.fromEntries(
                        paramArr.map(p => [p.Key || p.key, p['#text']])
                      );
                      semanticAction = {
                        category: AACSemanticCategory.CUSTOM,
                        intent: AACSemanticIntent.PLATFORM_SPECIFIC,
                        platformData: {
                          grid3: {
                            commandId,
                            parameters: allParams
                          }
                        },
                        fallback: {
                          type: 'ACTION',
                          message: commandId
                        }
                      };
                    }
                    break;
                }
                // Continue processing remaining commands so that navigation
                // targets (Jump.To) are discovered even when a non-navigation
                // command (e.g. Jump.SetBookmark, Action.InsertText) appears first.
              }
            }
            // Create default semantic action if none was created from commands
            if (!semanticAction) {
              semanticAction = {
                category: AACSemanticCategory.COMMUNICATION,
                intent: AACSemanticIntent.SPEAK_TEXT,
                text: String(message),
                fallback: {
                  type: 'SPEAK',
                  message: String(message)
                }
              };
            }
            // Get style information from cell attributes and Content.Style
            let cellStyleId = cell['@_StyleID'] || cell['@_styleid'];
            // Grid3 format: check Content.Style.BasedOnStyle
            if (
              !cellStyleId &&
              (_content$Style = content.Style) !== null &&
              _content$Style !== void 0 &&
              _content$Style.BasedOnStyle
            ) {
              cellStyleId = content.Style.BasedOnStyle;
            }
            const cellStyle = this.getStyleById(
              styles,
              cellStyleId ? String(cellStyleId) : undefined
            );
            // Also check for inline style overrides
            const inlineStyle = {};
            if (cell['@_BackColour'])
              inlineStyle.backgroundColor = cell['@_BackColour'];
            if (cell['@_FontColour'])
              inlineStyle.fontColor = cell['@_FontColour'];
            if (cell['@_BorderColour'])
              inlineStyle.borderColor = cell['@_BorderColour'];
            // Grid3 inline styles from Content.Style
            if (content.Style) {
              if (content.Style.BackColour)
                inlineStyle.backgroundColor = content.Style.BackColour;
              if (content.Style.FontColour)
                inlineStyle.fontColor = content.Style.FontColour;
              if (content.Style.BorderColour)
                inlineStyle.borderColor = content.Style.BorderColour;
              if (content.Style.FontName)
                inlineStyle.fontFamily = content.Style.FontName;
              if (content.Style.FontSize)
                inlineStyle.fontSize = parseInt(String(content.Style.FontSize));
            }
            // Extract grammar tags from commands (Smart Grammar)
            const grammar = {};
            if (buttonPos) grammar.pos = buttonPos;
            detectedCommands.forEach(cmd => {
              if (!grammar.pos && cmd.parameters.pos)
                grammar.pos = cmd.parameters.pos;
              if (cmd.parameters.person) grammar.person = cmd.parameters.person;
              if (cmd.parameters.number) grammar.number = cmd.parameters.number;
              if (cmd.parameters.feature)
                grammar.feature = cmd.parameters.feature;
            });
            const isSmartGrammarCell = Object.keys(grammar).length > 0;
            const effectivePos = buttonPos || grammar.pos || undefined;
            const button = new AACButton({
              id: `${gridId}_btn_${idx}`,
              label: String(label),
              message: String(message),
              targetPageId: navigationTarget
                ? String(navigationTarget)
                : undefined,
              semanticAction: semanticAction,
              semantic_id: cell.semantic_id || cell.SemanticId || undefined,
              // Extract semantic_id if present
              image: declaredImageName,
              resolvedImageEntry: resolvedImageEntry,
              x: cellX,
              y: cellY,
              columnSpan: colSpan,
              rowSpan: rowSpan,
              scanBlock: scanBlock,
              // Add scan block number for block scanning metrics
              contentType:
                pluginMetadata.cellType === Grid3CellType.Regular
                  ? 'Normal'
                  : pluginMetadata.cellType === Grid3CellType.Workspace
                  ? 'Workspace'
                  : pluginMetadata.cellType === Grid3CellType.LiveCell
                  ? 'LiveCell'
                  : 'AutoContent',
              contentSubType:
                pluginMetadata.subType ||
                pluginMetadata.liveCellType ||
                pluginMetadata.autoContentType,
              symbolLibrary:
                ((_symbolLibraryRef = symbolLibraryRef) === null ||
                _symbolLibraryRef === void 0
                  ? void 0
                  : _symbolLibraryRef.library) || undefined,
              symbolPath:
                ((_symbolLibraryRef2 = symbolLibraryRef) === null ||
                _symbolLibraryRef2 === void 0
                  ? void 0
                  : _symbolLibraryRef2.path) || undefined,
              visibility: cellVisibility,
              style: {
                ...cellStyle,
                ...inlineStyle // Inline styles override referenced styles
              },
              // Store predictions directly on button for easy access
              predictions:
                (_predictionWords = predictionWords) !== null &&
                _predictionWords !== void 0 &&
                _predictionWords.length
                  ? [...predictionWords]
                  : gridPredictionWords.length > 0
                  ? [...gridPredictionWords]
                  : undefined,
              pos: effectivePos,
              parameters: {
                pluginMetadata: pluginMetadata,
                // Store full plugin metadata for future use
                grid3Commands: detectedCommands,
                // Store detected command metadata
                symbolLibraryRef: symbolLibraryRef,
                // Store full symbol reference
                grammar: isSmartGrammarCell ? grammar : undefined,
                isSmartGrammarCell: isSmartGrammarCell,
                predictions:
                  (_predictionWords2 = predictionWords) !== null &&
                  _predictionWords2 !== void 0 &&
                  _predictionWords2.length
                    ? [...predictionWords]
                    : gridPredictionWords.length > 0
                    ? [...gridPredictionWords]
                    : undefined,
                predictionSlot:
                  pluginMetadata.cellType === Grid3CellType.AutoContent &&
                  pluginMetadata.autoContentType === 'Prediction'
                    ? predictionCellCounter
                    : undefined,
                // Store page name for Grid3 image lookup
                gridPageName: gridName,
                // Store WordList "more" button flag
                isMoreButton: isMoreButton || undefined,
                wordListItemIndex:
                  pluginMetadata.cellType === Grid3CellType.AutoContent &&
                  pluginMetadata.autoContentType === 'WordList' &&
                  !isMoreButton
                    ? wordListCellIndex - 1
                    : undefined,
                // Store binary image data for conversion to other formats
                ...(imageData
                  ? {
                      imageData,
                      image_id: resolvedImageEntry
                    }
                  : {})
              }
            });
            // Add button to page (load path: do not record as a user mutation)
            page._loadButton(button);
            // Place button in grid layout (handle colspan/rowspan)
            for (let r = cellY; r < cellY + rowSpan && r < maxRows; r++) {
              for (let c = cellX; c < cellX + colSpan && c < maxCols; c++) {
                if (gridLayout[r] && gridLayout[r][c] === null) {
                  gridLayout[r][c] = button;
                }
              }
            }
          });
          // Set the page's grid layout
          page.grid = gridLayout;
          // Generate clone_id for each button in the grid
          const semanticIds = [];
          const cloneIds = [];
          gridLayout.forEach((row, rowIndex) => {
            row.forEach((btn, colIndex) => {
              if (btn) {
                // Generate clone_id based on position and label
                btn.clone_id = generateCloneId(
                  maxRows,
                  maxCols,
                  rowIndex,
                  colIndex,
                  btn.label
                );
                cloneIds.push(btn.clone_id);
                // Track semantic_id if present
                if (btn.semantic_id) {
                  semanticIds.push(btn.semantic_id);
                }
              }
            });
          });
          // Track IDs on the page
          if (semanticIds.length > 0) {
            page.semantic_ids = semanticIds;
          }
          if (cloneIds.length > 0) {
            page.clone_ids = cloneIds;
          }
        }
        tree.addPage(page);
      }
    }
    // After all pages are loaded, set parentId for navigation targets
    for (const pageId in tree.pages) {
      const page = tree.pages[pageId];
      page.buttons.forEach(btn => {
        var _btn$semanticAction;
        if (
          ((_btn$semanticAction = btn.semanticAction) === null ||
          _btn$semanticAction === void 0
            ? void 0
            : _btn$semanticAction.intent) === AACSemanticIntent.NAVIGATE_TO &&
          btn.targetPageId
        ) {
          const targetPage = tree.getPage(btn.targetPageId);
          if (targetPage) {
            targetPage.parentId = page.id;
          }
        }
      });
    }
    // Read settings.xml to get the StartGrid (home page)
    try {
      const settingsEntry = entries.find(e =>
        e.entryName.endsWith('settings.xml')
      );
      if (settingsEntry) {
        var _settingsData$GridSet,
          _settingsData$gridSet,
          _settingsData$Gridset,
          _settingsData$GridSet2,
          _settingsData$gridSet2,
          _settingsData$Gridset2,
          _settingsData$GridSet3,
          _settingsData$gridSet3,
          _settingsData$Gridset3,
          _settingsData$GridSet4,
          _settingsData$gridSet4,
          _settingsData$Gridset4,
          _settingsData$GridSet5,
          _settingsData$gridSet5,
          _settingsData$Gridset5,
          _settingsData$GridSet6,
          _settingsData$gridSet6,
          _settingsData$Gridset6,
          _settingsData$GridSet7,
          _settingsData$gridSet7,
          _settingsData$Gridset7,
          _settingsData$GridSet8,
          _settingsData$gridSet8,
          _settingsData$Gridset8,
          _settingsData$GridSet9,
          _settingsData$gridSet9,
          _settingsData$Gridset9,
          _settingsData$GridSet0,
          _settingsData$gridSet0,
          _settingsData$Gridset0,
          _settingsData$GridSet1,
          _settingsData$gridSet1,
          _settingsData$Gridset1,
          _settingsData$GridSet10,
          _settingsData$gridSet10,
          _settingsData$Gridset10;
        const settingsXml = decodeText(await readEntryBuffer(settingsEntry));
        const settingsData = parser.parse(settingsXml);
        const gsName =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet === void 0
            ? void 0
            : _settingsData$GridSet.Name) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet === void 0
            ? void 0
            : _settingsData$gridSet.name) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset === void 0
            ? void 0
            : _settingsData$Gridset.Name);
        if (gsName) metadata.name = gsName;
        const gsDesc =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet2 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet2 === void 0
            ? void 0
            : _settingsData$GridSet2.Description) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet2 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet2 === void 0
            ? void 0
            : _settingsData$gridSet2.description) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset2 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset2 === void 0
            ? void 0
            : _settingsData$Gridset2.Description);
        if (gsDesc) metadata.description = gsDesc;
        const gsLang =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet3 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet3 === void 0
            ? void 0
            : _settingsData$GridSet3.PrimaryLanguage) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet3 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet3 === void 0
            ? void 0
            : _settingsData$gridSet3.primaryLanguage) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset3 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset3 === void 0
            ? void 0
            : _settingsData$Gridset3.PrimaryLanguage);
        if (gsLang && typeof gsLang === 'string') {
          metadata.locale = gsLang;
          metadata.languages = [gsLang];
        }
        const gsAuthor =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet4 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet4 === void 0
            ? void 0
            : _settingsData$GridSet4.Author) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet4 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet4 === void 0
            ? void 0
            : _settingsData$gridSet4.author) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset4 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset4 === void 0
            ? void 0
            : _settingsData$Gridset4.Author);
        if (gsAuthor) metadata.author = gsAuthor;
        const docUrl =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet5 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet5 === void 0
            ? void 0
            : _settingsData$GridSet5.DocumentationUrl) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet5 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet5 === void 0
            ? void 0
            : _settingsData$gridSet5.documentationUrl) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset5 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset5 === void 0
            ? void 0
            : _settingsData$Gridset5.DocumentationUrl);
        if (docUrl) {
          metadata.homepageUrl = docUrl;
          metadata.documentationUrl = docUrl;
        }
        const docSlug =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet6 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet6 === void 0
            ? void 0
            : _settingsData$GridSet6.DocumentationSlug) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet6 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet6 === void 0
            ? void 0
            : _settingsData$gridSet6.documentationSlug) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset6 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset6 === void 0
            ? void 0
            : _settingsData$Gridset6.DocumentationSlug);
        if (docSlug) metadata.documentationSlug = docSlug;
        const thumbnail =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet7 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet7 === void 0
            ? void 0
            : _settingsData$GridSet7.Thumbnail) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet7 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet7 === void 0
            ? void 0
            : _settingsData$gridSet7.thumbnail) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset7 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset7 === void 0
            ? void 0
            : _settingsData$Gridset7.Thumbnail);
        if (thumbnail) metadata.thumbnail = thumbnail;
        const thumbBg =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet8 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet8 === void 0
            ? void 0
            : _settingsData$GridSet8.ThumbnailBackground) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet8 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet8 === void 0
            ? void 0
            : _settingsData$gridSet8.thumbnailBackground) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset8 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset8 === void 0
            ? void 0
            : _settingsData$Gridset8.ThumbnailBackground);
        if (thumbBg) metadata.thumbnailBackground = thumbBg;
        const picSearchKeys =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet9 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet9 === void 0 ||
          (_settingsData$GridSet9 = _settingsData$GridSet9.PictureSearch) ===
            null ||
          _settingsData$GridSet9 === void 0 ||
          (_settingsData$GridSet9 =
            _settingsData$GridSet9.PictureSearchKeys) === null ||
          _settingsData$GridSet9 === void 0
            ? void 0
            : _settingsData$GridSet9.PictureSearchKey) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet9 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet9 === void 0 ||
          (_settingsData$gridSet9 = _settingsData$gridSet9.pictureSearch) ===
            null ||
          _settingsData$gridSet9 === void 0 ||
          (_settingsData$gridSet9 =
            _settingsData$gridSet9.pictureSearchKeys) === null ||
          _settingsData$gridSet9 === void 0
            ? void 0
            : _settingsData$gridSet9.pictureSearchKey) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset9 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset9 === void 0 ||
          (_settingsData$Gridset9 = _settingsData$Gridset9.PictureSearch) ===
            null ||
          _settingsData$Gridset9 === void 0 ||
          (_settingsData$Gridset9 =
            _settingsData$Gridset9.PictureSearchKeys) === null ||
          _settingsData$Gridset9 === void 0
            ? void 0
            : _settingsData$Gridset9.PictureSearchKey);
        if (picSearchKeys) {
          metadata.pictureSearchKeys = Array.isArray(picSearchKeys)
            ? picSearchKeys
            : [picSearchKeys];
        }
        const appearance =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet0 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet0 === void 0
            ? void 0
            : _settingsData$GridSet0.Appearance) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet0 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet0 === void 0
            ? void 0
            : _settingsData$gridSet0.appearance) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset0 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset0 === void 0
            ? void 0
            : _settingsData$Gridset0.Appearance);
        if (appearance) {
          metadata.appearance = {
            textAtTop:
              appearance.TextAtTop === '1' ||
              appearance.textAtTop === '1' ||
              appearance.TextAtTop === 1,
            computerControlCellSize: appearance.ComputerControlCellSize
              ? parseFloat(String(appearance.ComputerControlCellSize))
              : undefined
          };
        }
        const startGridName =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet1 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet1 === void 0
            ? void 0
            : _settingsData$GridSet1.StartGrid) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet1 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet1 === void 0
            ? void 0
            : _settingsData$gridSet1.startGrid) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset1 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset1 === void 0
            ? void 0
            : _settingsData$Gridset1.StartGrid);
        if (startGridName && typeof startGridName === 'string') {
          // Resolve the grid name to grid ID
          const homeGridId = gridNameToIdMap.get(startGridName);
          if (homeGridId) {
            metadata.defaultHomePageId = homeGridId;
            // Also set tree.rootId so BoardViewer knows which page to show first
            tree.rootId = homeGridId;
          }
        }
        const keyboardGridName =
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$GridSet10 = settingsData.GridSetSettings) === null ||
          _settingsData$GridSet10 === void 0
            ? void 0
            : _settingsData$GridSet10.KeyboardGrid) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$gridSet10 = settingsData.gridSetSettings) === null ||
          _settingsData$gridSet10 === void 0
            ? void 0
            : _settingsData$gridSet10.keyboardGrid) ||
          (settingsData === null ||
          settingsData === void 0 ||
          (_settingsData$Gridset10 = settingsData.GridsetSettings) === null ||
          _settingsData$Gridset10 === void 0
            ? void 0
            : _settingsData$Gridset10.KeyboardGrid);
        if (keyboardGridName && typeof keyboardGridName === 'string') {
          tree.keyboardGridName = keyboardGridName;
          metadata.defaultKeyboardPageId = gridNameToIdMap.get(
            keyboardGridName
          );
        }
      }
    } catch (_e) {
      // If settings.xml parsing fails, tree.rootId will default to first page
    }
    // Set metadata on tree
    tree.metadata = metadata;
    if (metadata.defaultKeyboardPageId) {
      Object.values(tree.pages).forEach(page => {
        page.buttons.forEach(button => {
          var _button$semanticActio;
          if (
            (button === null ||
            button === void 0 ||
            (_button$semanticActio = button.semanticAction) === null ||
            _button$semanticActio === void 0 ||
            (_button$semanticActio = _button$semanticActio.platformData) ===
              null ||
            _button$semanticActio === void 0 ||
            (_button$semanticActio = _button$semanticActio.grid3) === null ||
            _button$semanticActio === void 0
              ? void 0
              : _button$semanticActio.commandId) === 'Jump.ToKeyboard' &&
            !button.targetPageId
          ) {
            button.targetPageId = metadata.defaultKeyboardPageId;
            if (button.semanticAction) {
              var _button$semanticActio2;
              button.semanticAction.targetId = metadata.defaultKeyboardPageId;
              if (
                ((_button$semanticActio2 = button.semanticAction.fallback) ===
                  null || _button$semanticActio2 === void 0
                  ? void 0
                  : _button$semanticActio2.type) === 'NAVIGATE'
              ) {
                button.semanticAction.fallback.targetPageId =
                  metadata.defaultKeyboardPageId;
              }
            }
          }
        });
      });
    }
    return tree;
  }
  async processTexts(filePathOrBuffer, translations, outputPath) {
    const { readBinaryFromInput } = this.options.fileAdapter;
    // Load the tree, apply translations, and save to new file
    const tree = await this.loadIntoTree(filePathOrBuffer);
    // Apply translations to all text content
    Object.values(tree.pages).forEach(page => {
      // Translate page names
      if (page.name && translations.has(page.name)) {
        const tPage = translations.get(page.name);
        if (tPage) page.name = tPage;
      }
      // Translate button labels and messages, preserving symbol positions
      page.buttons.forEach(button => {
        // Translate label
        if (button.label && translations.has(button.label)) {
          const tLabel = translations.get(button.label);
          if (tLabel) button.label = tLabel;
        }
        // Translate message with symbol preservation
        if (button.message && translations.has(button.message)) {
          const originalMessage = button.message;
          const translatedText = translations.get(originalMessage);
          if (translatedText) {
            // Extract symbols from the button (from richText or image fields)
            const symbols = extractSymbolsFromButton(button);
            if (symbols && symbols.length > 0) {
              var _button$semanticActio3;
              // Use symbol-aware translation to preserve symbol positions
              const result = translateWithSymbols(
                originalMessage,
                translatedText,
                symbols
              );
              // Update the message
              button.message = result.text;
              // Update the rich text structure if it exists
              if (
                (_button$semanticActio3 = button.semanticAction) !== null &&
                _button$semanticActio3 !== void 0 &&
                _button$semanticActio3.richText
              ) {
                button.semanticAction.richText.text = result.text;
                button.semanticAction.richText.symbols = result.richTextSymbols;
              } else if (result.richTextSymbols.length > 0) {
                // Create rich text structure if it doesn't exist but we have symbols
                if (!button.semanticAction) {
                  button.semanticAction = {
                    category: AACSemanticCategory.COMMUNICATION,
                    intent: AACSemanticIntent.SPEAK_TEXT,
                    text: result.text
                  };
                }
                button.semanticAction.richText = {
                  text: result.text,
                  symbols: result.richTextSymbols
                };
              }
            } else {
              // No symbols to preserve, simple translation
              button.message = translatedText;
            }
          }
        }
      });
    });
    // Save the translated tree and return its content
    await this.saveFromTree(tree, outputPath);
    return await readBinaryFromInput(outputPath);
  }
  /**
   * Extract symbol information from a gridset for LLM-based translation.
   * Returns a structured format showing which buttons have symbols and their context.
   *
   * This method uses shared translation utilities that work across all AAC formats.
   *
   * @param filePathOrBuffer - Path to gridset file or buffer
   * @returns Promise resolving to symbol information for LLM processing
   */
  async extractSymbolsForLLM(filePathOrBuffer) {
    const tree = await this.loadIntoTree(filePathOrBuffer);
    // Collect all buttons from all pages
    const allButtons = [];
    Object.values(tree.pages).forEach(page => {
      page.buttons.forEach(button => {
        // Add page context to each button
        button.pageId = page.id;
        button.pageName = page.name || page.id;
        allButtons.push(button);
      });
    });
    // Use shared utility to extract buttons with translation context
    return extractAllButtonsForTranslation(allButtons, button => ({
      pageId: button.pageId,
      pageName: button.pageName
    }));
  }
  /**
   * Apply LLM translations with symbol information.
   * The LLM should provide translations with symbol attachments in the correct positions.
   *
   * This method uses shared translation utilities that work across all AAC formats.
   *
   * @param filePathOrBuffer - Path to gridset file or buffer
   * @param llmTranslations - Array of LLM translations with symbol info
   * @param outputPath - Where to save the translated gridset
   * @param options - Translation options (e.g., allowPartial for testing)
   * @returns Promise resolving to a buffer of the translated gridset
   */
  async processLLMTranslations(
    filePathOrBuffer,
    llmTranslations,
    outputPath,
    options
  ) {
    const { readBinaryFromInput } = this.options.fileAdapter;
    const tree = await this.loadIntoTree(filePathOrBuffer);
    // Validate translations using shared utility
    const buttonIds = Object.values(tree.pages).flatMap(page =>
      page.buttons.map(b => b.id)
    );
    validateTranslationResults(llmTranslations, buttonIds, options);
    // Create a map for quick lookup
    const translationMap = new Map(llmTranslations.map(t => [t.buttonId, t]));
    // Apply translations
    Object.values(tree.pages).forEach(page => {
      page.buttons.forEach(button => {
        const translation = translationMap.get(button.id);
        if (!translation) return;
        // Apply label translation
        if (translation.translatedLabel) {
          button.label = translation.translatedLabel;
        }
        // Apply message translation
        if (translation.translatedMessage) {
          button.message = translation.translatedMessage;
          // Update rich text if symbols provided
          if (translation.symbols && translation.symbols.length > 0) {
            if (!button.semanticAction) {
              button.semanticAction = {
                category: AACSemanticCategory.COMMUNICATION,
                intent: AACSemanticIntent.SPEAK_TEXT,
                text: translation.translatedMessage
              };
            }
            button.semanticAction.richText = {
              text: translation.translatedMessage,
              symbols: translation.symbols
            };
          }
        }
      });
    });
    // Save and return
    await this.saveFromTree(tree, outputPath);
    return await readBinaryFromInput(outputPath);
  }
  async saveFromTree(tree, outputPath) {
    var _tree$metadata2,
      _tree$metadata3,
      _tree$metadata4,
      _tree$metadata5,
      _tree$metadata6,
      _tree$metadata7,
      _tree$metadata8,
      _tree$metadata9,
      _tree$metadata0,
      _tree$metadata1;
    const files = [];
    const { writeBinaryToPath } = this.options.fileAdapter;
    const zip = await this.options.zipAdapter();
    if (Object.keys(tree.pages).length === 0) {
      // Create empty zip for empty tree
      const zipBuffer = await zip.writeFiles([]);
      await writeBinaryToPath(outputPath, zipBuffer);
      return;
    }
    // Collect all unique styles from pages and buttons
    const uniqueStyles = new Map();
    let styleIdCounter = 1;
    // Track images that need to be written to the ZIP
    // Maps button ID to image data for buttons with images
    const buttonImages = new Map();
    // Helper function to add style and return its ID
    const addStyle = style => {
      if (!style) return '';
      const normalizedStyle = {
        ...style
      };
      const styleKey = JSON.stringify(normalizedStyle);
      const existing = uniqueStyles.get(styleKey);
      if (existing) return existing.id;
      const styleId = `Style${styleIdCounter++}`;
      uniqueStyles.set(styleKey, {
        id: styleId,
        style: normalizedStyle
      });
      return styleId;
    };
    // Collect styles from all pages and buttons
    Object.values(tree.pages).forEach(page => {
      addStyle(page.style);
      page.buttons.forEach(button => {
        addStyle(button.style);
      });
    });
    // Get the home/start grid from tree.rootId, fallback to first page
    const pages = Object.values(tree.pages);
    let startGrid = '';
    if (tree.rootId) {
      const homePage = tree.getPage(tree.rootId);
      if (homePage) {
        startGrid = homePage.name || homePage.id;
      }
    }
    // Fallback to first page if no rootId or page not found
    if (!startGrid && pages.length > 0) {
      startGrid = pages[0].name || pages[0].id;
    }
    // Create Settings0/settings.xml with proper Grid3 structure
    const settingsData = {
      '?xml': {
        '@_version': '1.0',
        '@_encoding': 'UTF-8'
      },
      GridSetSettings: {
        '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        Name:
          ((_tree$metadata2 = tree.metadata) === null ||
          _tree$metadata2 === void 0
            ? void 0
            : _tree$metadata2.name) || '',
        Description:
          ((_tree$metadata3 = tree.metadata) === null ||
          _tree$metadata3 === void 0
            ? void 0
            : _tree$metadata3.description) || '',
        Author:
          ((_tree$metadata4 = tree.metadata) === null ||
          _tree$metadata4 === void 0
            ? void 0
            : _tree$metadata4.author) || '',
        PrimaryLanguage:
          ((_tree$metadata5 = tree.metadata) === null ||
          _tree$metadata5 === void 0
            ? void 0
            : _tree$metadata5.locale) || 'en-US',
        StartGrid: startGrid,
        // Add other common Grid3 settings
        Thumbnail:
          ((_tree$metadata6 = tree.metadata) === null ||
          _tree$metadata6 === void 0
            ? void 0
            : _tree$metadata6.thumbnail) || '',
        ThumbnailBackground:
          ((_tree$metadata7 = tree.metadata) === null ||
          _tree$metadata7 === void 0
            ? void 0
            : _tree$metadata7.thumbnailBackground) || '',
        DocumentationUrl:
          ((_tree$metadata8 = tree.metadata) === null ||
          _tree$metadata8 === void 0
            ? void 0
            : _tree$metadata8.homepageUrl) ||
          ((_tree$metadata9 = tree.metadata) === null ||
          _tree$metadata9 === void 0
            ? void 0
            : _tree$metadata9.url) ||
          '',
        DocumentationSlug:
          ((_tree$metadata0 = tree.metadata) === null ||
          _tree$metadata0 === void 0
            ? void 0
            : _tree$metadata0.documentationSlug) || '',
        ScanEnabled: 'false',
        ScanTimeoutMs: '2000',
        HoverEnabled: 'false',
        HoverTimeoutMs: '1000',
        MouseclickEnabled: 'true',
        Language:
          ((_tree$metadata1 = tree.metadata) === null ||
          _tree$metadata1 === void 0
            ? void 0
            : _tree$metadata1.locale) || 'en-US'
      }
    };
    const settingsBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  ',
      suppressEmptyNode: true
    });
    const settingsXmlContent = settingsBuilder.build(settingsData);
    files.push({
      name: 'Settings0/settings.xml',
      data: settingsXmlContent
    });
    // Create Settings0/Styles/style.xml if there are styles
    // Ensure Workspace and Default styles exist when workspace cells are present
    const hasAnyWorkspace = Object.values(tree.pages).some(p =>
      p.buttons.some(
        b => b.contentType === 'Workspace' || b.contentType === 'LiveCell'
      )
    );
    if (hasAnyWorkspace) {
      if (!uniqueStyles.has('workspace-style')) {
        uniqueStyles.set('workspace-style', {
          id: 'Workspace',
          style: {
            backgroundColor: '#FFFFFF00',
            borderColor: '#FFFFFF00',
            fontColor: '#000000FF'
          }
        });
      }
      if (!uniqueStyles.has('default-style')) {
        uniqueStyles.set('default-style', {
          id: 'Default',
          style: {
            backgroundColor: '#D5DBDBFF',
            borderColor: '#FFFFFFFF',
            fontColor: '#000000FF',
            fontFamily: 'Arial',
            fontSize: 16
          }
        });
      }
    }
    if (uniqueStyles.size > 0) {
      const stylesArray = Array.from(uniqueStyles.values()).map(
        ({ id, style }) => {
          var _style$fontSize;
          const styleObj = {
            '@_Key': id,
            // When TileColour is present, BackColour is the surround (outer area)
            // For "None" surround, just use BackColour for the fill (no TileColour)
            BackColour: this.ensureAlphaChannel(style.backgroundColor),
            BorderColour: this.ensureAlphaChannel(style.borderColor),
            // Calculate font color based on background if not explicitly set
            FontColour: this.ensureAlphaChannel(
              style.fontColor ||
                this.getContrastFontColor(style.backgroundColor)
            ),
            FontName: style.fontFamily || 'Arial',
            FontSize:
              ((_style$fontSize = style.fontSize) === null ||
              _style$fontSize === void 0
                ? void 0
                : _style$fontSize.toString()) || '16'
          };
          // Don't add TileColour - just use BackColour as the fill color
          return styleObj;
        }
      );
      const styleData = {
        '?xml': {
          '@_version': '1.0',
          '@_encoding': 'UTF-8'
        },
        StyleData: {
          '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          Styles: {
            Style: stylesArray
          }
        }
      };
      const styleBuilder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        indentBy: '  '
      });
      const styleXmlContent = styleBuilder.build(styleData);
      files.push({
        name: 'Settings0/Styles/styles.xml',
        data: styleXmlContent
      });
    }
    // Collect grid file paths for FileMap.xml
    const gridFilePaths = [];
    // Create a grid for each page
    Object.values(tree.pages).forEach(page => {
      const hasComputerControl = page.buttons.some(
        b =>
          b.contentType === 'Workspace' &&
          b.contentSubType === 'ComputerControl'
      );
      const gridData = {
        Grid: {
          '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          ...(hasComputerControl
            ? {
                ComputerControl: '1'
              }
            : {}),
          GridGuid: page.id,
          // Calculate grid dimensions based on actual layout
          ColumnDefinitions: this.calculateColumnDefinitions(page),
          RowDefinitions: this.calculateRowDefinitions(page, false),
          // No automatic workspace row injection
          AutoContentCommands: '',
          Cells:
            page.buttons.length > 0
              ? {
                  Cell: [
                    // Regular button cells
                    ...this.filterPageButtons(page.buttons).map(
                      (button, btnIndex) => {
                        const buttonStyleId = button.style
                          ? addStyle(button.style)
                          : '';
                        // Force Workspace/LiveCell/AutoContent cells to use their standard style names
                        const effectiveStyleId =
                          button.contentType === 'Workspace'
                            ? 'Workspace'
                            : button.contentType === 'LiveCell'
                            ? 'Default'
                            : button.contentType === 'AutoContent'
                            ? 'Default'
                            : buttonStyleId; // Find button position in grid layout
                        const position = this.findButtonPosition(
                          page,
                          button,
                          btnIndex
                        );
                        // Use position directly from tree
                        const yOffset = 0;
                        // Build CaptionAndImage object
                        const captionAndImage = {
                          Caption: button.label || ''
                        };
                        // Add image reference if button has an image
                        // Grid3 uses coordinate-based naming: {x}-{y}-0-text-0.{ext}
                        if (button.image) {
                          // Try to determine file extension from image name or default to PNG
                          let imageExt = 'png';
                          const imageMatch = button.image.match(
                            /\.(png|jpg|jpeg|gif|svg)$/i
                          );
                          if (imageMatch) {
                            imageExt = imageMatch[1].toLowerCase();
                          }
                          // Extract image data from button parameters if available
                          // (AstericsGridProcessor stores it there during loadIntoTree)
                          // Also handle data URLs from OBZ conversion
                          let imageData = Buffer.alloc(0);
                          let hasImageData = false;
                          if (
                            button.parameters &&
                            button.parameters.imageData &&
                            Buffer.isBuffer(button.parameters.imageData)
                          ) {
                            imageData = button.parameters.imageData;
                            hasImageData = imageData.length > 0;
                          } else if (
                            button.image &&
                            typeof button.image === 'string' &&
                            button.image.startsWith('data:image')
                          ) {
                            // Convert data URL to Buffer (for OBZ → Grid3 conversion)
                            try {
                              const matches = button.image.match(
                                /^data:image\/(\w+);base64,(.+)$/
                              );
                              if (matches) {
                                const extension = matches[1]; // e.g., 'png', 'jpeg', 'gif'
                                const base64Data = matches[2];
                                imageData = Buffer.from(base64Data, 'base64');
                                imageExt = extension; // Override the detected extension
                                hasImageData = imageData.length > 0;
                              }
                            } catch (err) {
                              console.warn(
                                `[Grid3] Failed to convert data URL to Buffer for button ${
                                  button.id
                                }:`,
                                err
                              );
                            }
                          }
                          // Only add image reference if we have actual image data
                          if (hasImageData) {
                            // Grid3 dynamically constructs image filenames by prepending cell coordinates
                            // The XML should only contain the suffix: -0-text-0.{ext}
                            // Grid3 automatically adds the X-Y prefix based on the Cell's position
                            captionAndImage.Image = `-0-text-0.${imageExt}`;
                            // Store image data for later writing to ZIP
                            buttonImages.set(button.id, {
                              imageData: imageData,
                              ext: imageExt,
                              pageName: page.name || page.id,
                              x: position.x,
                              y: position.y + yOffset
                            });
                          }
                        }
                        const isPluginCell =
                          button.contentType === 'Workspace' ||
                          button.contentType === 'LiveCell' ||
                          button.contentType === 'AutoContent';
                        const cellContent = {
                          ContentType:
                            button.contentType === 'Normal'
                              ? undefined
                              : button.contentType,
                          ContentSubType: button.contentSubType
                        };
                        const commands = this.generateCommandsFromSemanticAction(
                          button,
                          tree
                        );
                        if (commands) {
                          cellContent.Commands = commands;
                        }
                        if (!isPluginCell) {
                          cellContent.CaptionAndImage = captionAndImage;
                        }
                        const cellData = {
                          '@_X': position.x + 1,
                          // Grid3 uses 1-based X coordinates
                          '@_Y': position.y + yOffset + 1,
                          // Grid3 uses 1-based Y coordinates with workspace offset
                          '@_ColumnSpan': position.columnSpan,
                          '@_RowSpan': position.rowSpan,
                          Content: cellContent
                        };
                        // Add style reference and inline color overrides if available
                        // Some Grid3 versions need inline colors in addition to style references
                        if (effectiveStyleId || button.style) {
                          var _button$style,
                            _button$style2,
                            _button$style3,
                            _button$style4,
                            _button$style5,
                            _button$style6;
                          const styleObj = {};
                          // Add style reference if we have one
                          if (effectiveStyleId) {
                            styleObj.BasedOnStyle = effectiveStyleId;
                          }
                          // Add inline color overrides for better Grid3 compatibility
                          if (
                            (_button$style = button.style) !== null &&
                            _button$style !== void 0 &&
                            _button$style.backgroundColor
                          ) {
                            // Use BackColour for fill (no TileColour means no surround, just the fill)
                            styleObj.BackColour = this.ensureAlphaChannel(
                              button.style.backgroundColor
                            );
                          }
                          if (
                            (_button$style2 = button.style) !== null &&
                            _button$style2 !== void 0 &&
                            _button$style2.borderColor
                          ) {
                            styleObj.BorderColour = this.ensureAlphaChannel(
                              button.style.borderColor
                            );
                          }
                          // Always add font color inline - either from button style or calculated from background
                          const fontColor =
                            ((_button$style3 = button.style) === null ||
                            _button$style3 === void 0
                              ? void 0
                              : _button$style3.fontColor) ||
                            this.getContrastFontColor(
                              (_button$style4 = button.style) === null ||
                                _button$style4 === void 0
                                ? void 0
                                : _button$style4.backgroundColor
                            );
                          styleObj.FontColour = this.ensureAlphaChannel(
                            fontColor
                          );
                          if (
                            (_button$style5 = button.style) !== null &&
                            _button$style5 !== void 0 &&
                            _button$style5.fontFamily
                          ) {
                            styleObj.FontName = button.style.fontFamily;
                          }
                          if (
                            (_button$style6 = button.style) !== null &&
                            _button$style6 !== void 0 &&
                            _button$style6.fontSize
                          ) {
                            styleObj.FontSize = button.style.fontSize;
                          }
                          cellData.Content.Style = styleObj;
                        }
                        return cellData;
                      }
                    )
                  ]
                }
              : {
                  Cell: []
                }
        }
      };
      // Convert to XML
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        indentBy: '  ',
        suppressEmptyNode: true,
        cdataPropName: '__cdata'
      });
      const xmlContent = builder.build(gridData);
      // Add to zip in Grids folder with proper Grid3 naming
      const gridPath = `Grids/${page.name || page.id}/grid.xml`;
      gridFilePaths.push(gridPath);
      files.push({
        name: gridPath,
        data: xmlContent
      });
    });
    // Write image files to ZIP
    buttonImages.forEach(imgData => {
      if (imgData.imageData && imgData.imageData.length > 0) {
        // Create image path in the grid's directory
        const imagePath = `Grids/${imgData.pageName}/${imgData.x}-${
          imgData.y
        }-0-text-0.${imgData.ext}`;
        files.push({
          name: imagePath,
          data: imgData.imageData
        });
      }
    });
    // Create FileMap.xml to map all grid files with their dynamic image files
    const fileMapData = {
      '?xml': {
        '@_version': '1.0',
        '@_encoding': 'UTF-8'
      },
      FileMap: {
        '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        Entries: {
          Entry: gridFilePaths.map(gridPath => {
            var _gridPath$match;
            // Find all image files for this grid
            const gridName =
              ((_gridPath$match = gridPath.match(
                /Grids\/([^/]+)\/grid\.xml$/
              )) === null || _gridPath$match === void 0
                ? void 0
                : _gridPath$match[1]) || '';
            const imageFiles = [];
            // Collect image filenames for buttons on this page
            // IMPORTANT: FileMap.xml requires full paths like "Grids/PageName/1-5-0-text-0.png"
            buttonImages.forEach(imgData => {
              if (
                imgData.pageName === gridName &&
                imgData.imageData.length > 0
              ) {
                const imagePath = `Grids/${gridName}/${imgData.x}-${
                  imgData.y
                }-0-text-0.${imgData.ext}`;
                imageFiles.push(imagePath);
              }
            });
            return {
              '@_StaticFile': gridPath,
              DynamicFiles:
                imageFiles.length > 0
                  ? {
                      File: imageFiles
                    }
                  : {}
            };
          })
        }
      }
    };
    const fileMapBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  '
    });
    const fileMapXmlContent = fileMapBuilder.build(fileMapData);
    files.push({
      name: 'FileMap.xml',
      data: fileMapXmlContent
    });
    // Write the zip file
    const zipBuffer = await zip.writeFiles(files);
    await writeBinaryToPath(outputPath, zipBuffer);
  }
  // Helper method to calculate column definitions based on page layout
  calculateColumnDefinitions(page) {
    return calcColumnDefs(page);
  }
  // Helper method to calculate row definitions based on page layout
  calculateRowDefinitions(page, addWorkspaceOffset = false) {
    return calcRowDefs(page, addWorkspaceOffset);
  }
  /**
   * Save a modified tree while preserving all original files (settings, images, assets)
   * This method only updates the grid.xml files for pages in the tree, keeping everything else intact.
   * It preserves the original grid structure and only updates button labels and messages.
   *
   * @param originalPath - Path to the original gridset file
   * @param tree - Modified AACTree with pages to save
   * @param outputPath - Path where the modified gridset should be saved
   */
  async saveModifiedTree(originalPath, tree, outputPath) {
    const { readBinaryFromInput, writeBinaryToPath } = this.options.fileAdapter;
    if (Object.keys(tree.pages).length === 0) {
      // Empty tree, just copy the original
      const originalBuffer = await readBinaryFromInput(originalPath);
      await writeBinaryToPath(outputPath, originalBuffer);
      return;
    }
    const originalZip = await this.options.zipAdapter(originalPath);
    const outputZip = await this.options.zipAdapter();
    // Check if any page has pending mutations
    const hasPendingMutations = Object.values(tree.pages).some(
      page => page.pendingMutations.length > 0
    );
    if (hasPendingMutations) {
      // NEW: Use mutation-based save path
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
      });
      const gridBuilder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        indentBy: '  ',
        suppressEmptyNode: true,
        suppressBooleanAttributes: false
      });
      GridsetSaveHandler.saveWithMutations(
        tree,
        originalZip,
        outputZip,
        parser,
        gridBuilder,
        page => this.createBasicGridXml(page)
      );
      // Copy files
      const outputFiles = [];
      for (const name of originalZip.listFiles()) {
        const data = await originalZip.readFile(name);
        outputFiles.push({
          name,
          data
        });
      }
      const outputBuffer = await outputZip.writeFiles(outputFiles);
      await writeBinaryToPath(outputPath, outputBuffer);
      return;
    }
    // LEGACY: Original position-based logic continues below...
    // Create a map of pages by name for easy lookup
    const pagesByName = new Map();
    for (const page of Object.values(tree.pages)) {
      pagesByName.set(page.name, page);
    }
    // Track which grid files we're modifying
    const modifiedGridFiles = new Set();
    // Generate updated grid.xml files for pages in the tree
    const newGridFiles = new Map();
    // Create XML parser and builder
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    const gridBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  ',
      suppressEmptyNode: true,
      // Preserve Grid 3 XML formatting requirements
      suppressBooleanAttributes: false
    });
    for (const page of Object.values(tree.pages)) {
      var _originalGrid$Grid$Ce;
      const gridPath = `Grids/${page.name}/grid.xml`;
      modifiedGridFiles.add(gridPath);
      // Try to get the original grid.xml file
      const originalEntries = originalZip.listFiles();
      if (!originalEntries.includes(gridPath)) {
        // If original doesn't exist, create a new basic grid
        const basicGrid = this.createBasicGridXml(page);
        newGridFiles.set(gridPath, basicGrid);
        continue;
      }
      // Parse the original grid XML
      const originalContent = (await originalZip.readFile(gridPath)).toString();
      const originalGrid = parser.parse(originalContent);
      if (!originalGrid.Grid) {
        // Invalid grid structure, create a basic one
        const basicGrid = this.createBasicGridXml(page);
        newGridFiles.set(gridPath, basicGrid);
        continue;
      }
      // Create a map of buttons by their position for easy lookup
      const buttonsByPosition = new Map();
      for (const button of page.buttons) {
        const pos = this.findButtonPosition(page, button, 0);
        const key = `${pos.x},${pos.y}`;
        buttonsByPosition.set(key, button);
      }
      // Update cells in the original grid
      const originalCells =
        (_originalGrid$Grid$Ce = originalGrid.Grid.Cells) === null ||
        _originalGrid$Grid$Ce === void 0
          ? void 0
          : _originalGrid$Grid$Ce.Cell;
      if (originalCells) {
        const cellArray = Array.isArray(originalCells)
          ? originalCells
          : [originalCells];
        for (const cell of cellArray) {
          if (!cell.Content) continue;
          // Get cell position
          const x = parseInt(
            String(cell['@_X'] || cell['@_Column'] || '0'),
            10
          );
          const y = parseInt(String(cell['@_Y'] || cell['@_Row'] || '0'), 10);
          const key = `${x},${y}`;
          // Check if there's a modified button for this position
          const modifiedButton = buttonsByPosition.get(key);
          if (modifiedButton) {
            // Check if this is an AutoContent/WordList cell
            const contentType =
              cell.Content.ContentType || cell.Content.contentType;
            const contentSubType =
              cell.Content.ContentSubType || cell.Content.contentsubtype;
            const isWordListCell =
              contentType === 'AutoContent' && contentSubType === 'WordList';
            const isPredictionCell =
              contentType === 'AutoContent' && contentSubType === 'Prediction';
            if (isWordListCell) {
              // For WordList cells, we need to add the word to the page's WordList
              // instead of modifying the cell directly. The cell will automatically
              // populate from the WordList.
              // Note: WordList updates are handled by collecting all new words
              // and adding them to the WordList.Items array later.
              continue; // Skip cell modification for WordList cells
            }
            if (isPredictionCell) {
              // Prediction cells are populated dynamically by Grid 3's prediction system.
              // They should remain as <CaptionAndImage xsi:nil="true" /> and not be modified.
              continue; // Skip cell modification for Prediction cells
            }
            // For regular cells, update the caption directly
            // CDATA wrapping for empty captions will be done in post-processing
            if (cell.Content.CaptionAndImage || cell.Content.captionAndImage) {
              const captionAndImage =
                cell.Content.CaptionAndImage || cell.Content.captionAndImage;
              // Check if the label is a placeholder (generated during extraction)
              const isPlaceholderLabel =
                !modifiedButton.label ||
                modifiedButton.label.startsWith('Cell_') ||
                modifiedButton.label.startsWith('AutoContent_') ||
                modifiedButton.label.startsWith('Prediction ');
              if (!isPlaceholderLabel) {
                // Only update caption with real content, not placeholders
                captionAndImage.Caption = modifiedButton.label;
                // Remove xsi:nil attribute when adding content
                if (
                  captionAndImage['@_xsi:nil'] ||
                  captionAndImage['xsi:nil']
                ) {
                  delete captionAndImage['@_xsi:nil'];
                  delete captionAndImage['xsi:nil'];
                }
              }
            }
            // Update the message if different from label
            // But skip placeholder labels
            const isPlaceholderMessage =
              !modifiedButton.message ||
              modifiedButton.message.startsWith('Cell_') ||
              modifiedButton.message.startsWith('AutoContent_') ||
              modifiedButton.message.startsWith('Prediction ');
            if (
              !isPlaceholderMessage &&
              modifiedButton.message &&
              modifiedButton.message !== modifiedButton.label
            ) {
              // For simple text content
              if (!cell.Content.Commands) {
                cell.Content['#text'] = modifiedButton.message;
              }
            }
            // Update image if present
            if (modifiedButton.image) {
              if (
                cell.Content.CaptionAndImage ||
                cell.Content.captionAndImage
              ) {
                const captionAndImage =
                  cell.Content.CaptionAndImage || cell.Content.captionAndImage;
                captionAndImage.Image = modifiedButton.image;
              }
            }
          }
        }
      }
      // DO NOT create new cells - the system should only modify existing content
      // Personalized vocabulary is added to WordList cells via the WordList.Items array
      // Creating new cells would corrupt the grid structure
      // Update the page's WordList with new words from modified buttons
      // Collect all modified buttons that should be added to the WordList
      const newWordListItems = [];
      for (const button of page.buttons) {
        var _originalGrid$Grid$Ce2, _originalGrid$Grid$Ce3;
        const pos = this.findButtonPosition(page, button, 0);
        // Check if this button corresponds to a WordList cell
        const cellArray = Array.isArray(
          (_originalGrid$Grid$Ce2 = originalGrid.Grid.Cells) === null ||
            _originalGrid$Grid$Ce2 === void 0
            ? void 0
            : _originalGrid$Grid$Ce2.Cell
        )
          ? originalGrid.Grid.Cells.Cell
          : (_originalGrid$Grid$Ce3 = originalGrid.Grid.Cells) !== null &&
            _originalGrid$Grid$Ce3 !== void 0 &&
            _originalGrid$Grid$Ce3.Cell
          ? [originalGrid.Grid.Cells.Cell]
          : [];
        const cell = cellArray.find(c => {
          const cellY = parseInt(String(c['@_Y'] || c['@_Row'] || '0'), 10);
          // Check Y position first
          if (cellY !== pos.y) {
            return false;
          }
          const cellX =
            c['@_X'] !== undefined ? parseInt(String(c['@_X']), 10) : undefined;
          // If cell has no X attribute (full-width cell), it matches any button at this Y
          if (cellX === undefined) {
            return true;
          }
          // Otherwise, check exact X match
          return cellX === pos.x;
        });
        if (cell) {
          var _cell$Content, _cell$Content2, _cell$Content3, _cell$Content4;
          const contentType =
            ((_cell$Content = cell.Content) === null || _cell$Content === void 0
              ? void 0
              : _cell$Content.ContentType) ||
            ((_cell$Content2 = cell.Content) === null ||
            _cell$Content2 === void 0
              ? void 0
              : _cell$Content2.contentType);
          const contentSubType =
            ((_cell$Content3 = cell.Content) === null ||
            _cell$Content3 === void 0
              ? void 0
              : _cell$Content3.ContentSubType) ||
            ((_cell$Content4 = cell.Content) === null ||
            _cell$Content4 === void 0
              ? void 0
              : _cell$Content4.contentsubtype);
          const isWordListCell =
            contentType === 'AutoContent' && contentSubType === 'WordList';
          // Note: Prediction cells are already skipped earlier, so they won't reach here
          if (isWordListCell) {
            // Add this button to the WordList with proper Grid 3 format
            // Format: <Text><p><s><r>label</r></s></p></Text>
            // Note: <p> wrapper is required by Grid 3's WordList format
            newWordListItems.push({
              Text: {
                p: {
                  s: {
                    r: button.label
                  }
                }
              },
              Image: '',
              // No image for user-added words
              PartOfSpeech: 'Unknown'
            });
          }
        }
      }
      // Add new items to the existing WordList
      if (newWordListItems.length > 0) {
        const existingWordList = originalGrid.Grid.WordList;
        if (existingWordList && existingWordList.Items) {
          const existingItems =
            existingWordList.Items.WordListItem ||
            existingWordList.Items.wordlistitem ||
            [];
          const itemsArray = Array.isArray(existingItems)
            ? existingItems
            : [existingItems];
          // Merge existing and new items
          const allItems = [...itemsArray, ...newWordListItems];
          // Update the WordList
          if (!originalGrid.Grid.WordList) {
            originalGrid.Grid.WordList = {};
          }
          if (!originalGrid.Grid.WordList.Items) {
            originalGrid.Grid.WordList.Items = {};
          }
          originalGrid.Grid.WordList.Items.WordListItem = allItems;
        }
      }
      // Build the updated grid XML and format for Grid 3 compatibility
      let builtXml = gridBuilder.build(originalGrid);
      builtXml = formatGrid3XmlComplete(builtXml);
      newGridFiles.set(gridPath, builtXml);
    }
    // Copy all files from original zip, replacing modified grid files
    const outputFiles = [];
    for (const entry of originalZip.listFiles()) {
      // Skip grid.xml files that we're modifying
      if (modifiedGridFiles.has(entry)) {
        const newContent = newGridFiles.get(entry);
        if (newContent) {
          outputFiles.push({
            name: entry,
            data: Buffer.from(newContent, 'utf8')
          });
        }
        continue;
      }
      // Copy all other files as-is
      const data = await originalZip.readFile(entry);
      outputFiles.push({
        name: entry,
        data
      });
    }
    // Write the output ZIP
    const outputBuffer = await outputZip.writeFiles(outputFiles);
    await writeBinaryToPath(outputPath, outputBuffer);
  }
  /**
   * Create a basic grid XML for a page when original doesn't exist
   */
  createBasicGridXml(page) {
    const gridData = {
      Grid: {
        '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        GridGuid: page.id,
        ColumnDefinitions: this.calculateColumnDefinitions(page),
        RowDefinitions: this.calculateRowDefinitions(page, false),
        AutoContentCommands: '',
        Cells:
          page.buttons.length > 0
            ? {
                Cell: this.filterPageButtons(page.buttons).map(
                  (button, btnIndex) => {
                    const position = this.findButtonPosition(
                      page,
                      button,
                      btnIndex
                    );
                    const cell = {
                      '@_X': position.x,
                      '@_Y': position.y,
                      Content: {
                        CaptionAndImage: {
                          Caption: button.label || ''
                        }
                      }
                    };
                    if (button.image) {
                      cell.Content.CaptionAndImage.Image = button.image;
                    }
                    if (position.columnSpan > 1) {
                      cell['@_ColumnSpan'] = position.columnSpan;
                    }
                    if (position.rowSpan > 1) {
                      cell['@_RowSpan'] = position.rowSpan;
                    }
                    return cell;
                  }
                )
              }
            : undefined
      }
    };
    const gridBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  ',
      suppressEmptyNode: true,
      // Preserve Grid 3 XML formatting requirements
      suppressBooleanAttributes: false
    });
    // Build the grid XML and format for Grid 3 compatibility
    let builtXml = gridBuilder.build(gridData);
    builtXml = formatGrid3XmlComplete(builtXml);
    return builtXml;
  }
  // Helper method to find button position with span information
  findButtonPosition(page, button, fallbackIndex) {
    return findButtonPos(page, button, fallbackIndex);
  }
  /**
   * Extract strings with metadata for aac-tools-platform compatibility
   * Uses the generic implementation from BaseProcessor
   */
  extractStringsWithMetadata(filePath) {
    return this.extractStringsWithMetadataGeneric(filePath);
  }
  /**
   * Generate translated download for aac-tools-platform compatibility
   * Uses the generic implementation from BaseProcessor
   */
  generateTranslatedDownload(filePath, translatedStrings, sourceStrings) {
    return this.generateTranslatedDownloadGeneric(
      filePath,
      translatedStrings,
      sourceStrings
    );
  }
  /**
   * Validate Gridset file format
   * @param filePath - Path to the file to validate
   * @returns Promise with validation result
   */
  async validate(filePath) {
    const validator = this.options.gridsetValidator;
    if (!validator || typeof validator.validateFile !== 'function') {
      throw new Error(
        'Gridset validation is optional in the browser compatibility build; provide options.gridsetValidator to enable it'
      );
    }
    return validator.validateFile(filePath, this.options.fileAdapter);
  }
}
export { GridsetProcessor };
