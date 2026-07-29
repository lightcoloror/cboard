import { GridsetProcessor } from './vendor/aacProcessors/compat/processors/gridsetProcessor';

export const GRIDSET_FILE_EXTENSION = 'gridset';

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;
const MAX_PAGES = 100;
const MAX_BUTTONS = 5000;
const MAX_GRID_DIMENSION = 100;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function normalizeBinaryInput(data) {
  let bytes;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else {
    throw new TypeError('Gridset import requires binary data');
  }
  if (!bytes.byteLength || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new TypeError('Gridset archive has an invalid size');
  }
  return bytes;
}

function safePathPart(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  const match = color.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
  return match ? `#${match[1]}` : color || undefined;
}

function bytesToBase64(bytes) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const combined = (first << 16) | (second << 8) | third;
    result += BASE64_ALPHABET[(combined >> 18) & 63];
    result += BASE64_ALPHABET[(combined >> 12) & 63];
    result +=
      index + 1 < bytes.length ? BASE64_ALPHABET[(combined >> 6) & 63] : '=';
    result += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : '=';
  }
  return result;
}

function detectImageMime(bytes) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return '';
}

function isSafeArchivePath(value) {
  const path = String(value || '');
  return Boolean(
    path &&
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes('\0') &&
      path.split('/').every(part => part && part !== '.' && part !== '..')
  );
}

function createBoundedReadOnlyZipAdapter(zipAdapter) {
  if (typeof zipAdapter !== 'function') {
    throw new TypeError('Gridset import requires a ZIP adapter');
  }
  return async input => {
    const archive = await zipAdapter(input);
    if (
      !archive ||
      typeof archive.listFiles !== 'function' ||
      typeof archive.readFile !== 'function'
    ) {
      throw new TypeError('Gridset ZIP adapter is invalid');
    }
    const listedFiles = archive.listFiles();
    if (!Array.isArray(listedFiles)) {
      throw new TypeError('Gridset ZIP adapter returned an invalid file list');
    }
    const fileNames = listedFiles.map(name => String(name || ''));
    if (
      !fileNames.length ||
      fileNames.length > MAX_ZIP_ENTRIES ||
      new Set(fileNames).size !== fileNames.length ||
      fileNames.some(name => !isSafeArchivePath(name))
    ) {
      throw new TypeError('Gridset archive has an invalid entry list');
    }

    const cache = new Map();
    let extractedBytes = 0;
    return {
      listFiles: () => fileNames.slice(),
      readFile: async name => {
        if (!fileNames.includes(name)) {
          throw new TypeError(`Gridset entry not found: ${name}`);
        }
        if (cache.has(name)) return cache.get(name);
        const raw = await archive.readFile(name);
        const bytes =
          raw instanceof Uint8Array
            ? raw
            : raw instanceof ArrayBuffer
            ? new Uint8Array(raw)
            : ArrayBuffer.isView(raw)
            ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            : null;
        if (!bytes || bytes.byteLength > MAX_ENTRY_BYTES) {
          throw new TypeError('Gridset archive contains an oversized entry');
        }
        extractedBytes += bytes.byteLength;
        if (extractedBytes > MAX_TOTAL_EXTRACTED_BYTES) {
          throw new TypeError('Gridset archive expands beyond the safe limit');
        }
        cache.set(name, bytes);
        return bytes;
      },
      writeFiles: () => {
        throw new TypeError('Gridset import adapter is read-only');
      }
    };
  };
}

function imageFromButton(button, imageBySource, images) {
  const source = String(
    button.resolvedImageEntry ||
      (button.parameters && button.parameters.image_id) ||
      button.image ||
      ''
  );
  const raw =
    button.parameters && button.parameters.imageData
      ? button.parameters.imageData
      : null;
  if (!source || !raw) return null;
  const bytes =
    raw instanceof Uint8Array
      ? raw
      : ArrayBuffer.isView(raw)
      ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      : raw instanceof ArrayBuffer
      ? new Uint8Array(raw)
      : null;
  if (!bytes || !bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
    return null;
  }
  if (imageBySource.has(source)) return imageBySource.get(source);
  const mimeType = detectImageMime(bytes);
  if (!mimeType) return null;
  const image = {
    id: `gridset-image-${images.length + 1}`,
    url: `data:${mimeType};base64,${bytesToBase64(bytes)}`
  };
  imageBySource.set(source, image);
  images.push(image);
  return image;
}

function pageDimensions(page) {
  let rows = Array.isArray(page.grid) ? page.grid.length : 0;
  let columns = rows
    ? page.grid.reduce(
        (maximum, row) =>
          Math.max(maximum, Array.isArray(row) ? row.length : 0),
        0
      )
    : 0;
  page.buttons.forEach(button => {
    const x = Number(button.x);
    const y = Number(button.y);
    if (Number.isInteger(x) && x >= 0) {
      columns = Math.max(
        columns,
        x + Math.max(Number(button.columnSpan) || 1, 1)
      );
    }
    if (Number.isInteger(y) && y >= 0) {
      rows = Math.max(rows, y + Math.max(Number(button.rowSpan) || 1, 1));
    }
  });
  if (
    !rows ||
    !columns ||
    rows > MAX_GRID_DIMENSION ||
    columns > MAX_GRID_DIMENSION
  ) {
    throw new TypeError('Gridset page has invalid grid dimensions');
  }
  return { rows, columns };
}

function createGridOrder(page, dimensions) {
  const order = Array.from({ length: dimensions.rows }, () =>
    Array.from({ length: dimensions.columns }, () => null)
  );
  if (Array.isArray(page.grid)) {
    page.grid.slice(0, dimensions.rows).forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      row.slice(0, dimensions.columns).forEach((cell, columnIndex) => {
        if (cell && cell.id) order[rowIndex][columnIndex] = String(cell.id);
      });
    });
  }
  page.buttons.forEach(button => {
    const x = Number(button.x);
    const y = Number(button.y);
    if (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < dimensions.columns &&
      y < dimensions.rows &&
      !order[y][x]
    ) {
      order[y][x] = String(button.id);
    }
  });
  return order;
}

function buttonVocalization(button) {
  const commands =
    button.parameters && Array.isArray(button.parameters.grid3Commands)
      ? button.parameters.grid3Commands
      : [];
  const insertText = commands.find(
    command =>
      command &&
      (command.id === 'Action.InsertText' ||
        command.id === 'Action.InsertTextAndSpeak') &&
      command.parameters &&
      typeof command.parameters.text === 'string' &&
      command.parameters.text.trim()
  );
  if (insertText) return insertText.parameters.text.trim();
  if (
    button.semanticAction &&
    typeof button.semanticAction.text === 'string' &&
    button.semanticAction.text.trim()
  ) {
    return button.semanticAction.text.trim();
  }
  return String(button.message || button.label || '');
}

function createOpenBoard(page, locale, pathByPageId) {
  const dimensions = pageDimensions(page);
  const images = [];
  const imageBySource = new Map();
  const buttons = page.buttons.map(button => {
    const image = imageFromButton(button, imageBySource, images);
    const targetPageId = String(button.targetPageId || '');
    const result = {
      id: String(button.id),
      label: String(button.label || ''),
      vocalization: buttonVocalization(button),
      background_color: normalizeColor(
        button.style && button.style.backgroundColor
      ),
      border_color: normalizeColor(button.style && button.style.borderColor),
      hidden: button.visibility === 'Hidden' || button.visibility === 'hidden'
    };
    if (image) result.image_id = image.id;
    if (targetPageId && pathByPageId.has(targetPageId)) {
      result.load_board = { path: pathByPageId.get(targetPageId) };
    }
    return result;
  });

  return {
    format: 'open-board-0.1',
    id: String(page.id),
    locale: String(page.locale || locale || 'en'),
    name: String(page.name || 'Gridset Board'),
    grid: {
      rows: dimensions.rows,
      columns: dimensions.columns,
      order: createGridOrder(page, dimensions)
    },
    buttons,
    images,
    sounds: []
  };
}

export async function convertGridsetToOpenBoardDocuments({
  data,
  fileName = 'imported.gridset',
  locale = 'zh-CN',
  zipAdapter
} = {}) {
  if (/\.gridsetx$/i.test(String(fileName || ''))) {
    throw new TypeError('Encrypted Gridset files are not supported');
  }
  const bytes = normalizeBinaryInput(data);
  const tree = await new GridsetProcessor({
    preserveAllButtons: true,
    zipAdapter: createBoundedReadOnlyZipAdapter(zipAdapter)
  }).loadIntoTree(bytes);
  const pages = Object.values(tree.pages || {});
  if (!pages.length || pages.length > MAX_PAGES) {
    throw new TypeError('Gridset document has an invalid page count');
  }
  const buttonCount = pages.reduce(
    (total, page) =>
      total + (Array.isArray(page.buttons) ? page.buttons.length : 0),
    0
  );
  if (buttonCount > MAX_BUTTONS) {
    throw new TypeError('Gridset document contains too many buttons');
  }

  const orderedPages = tree.rootId
    ? pages
        .filter(page => String(page.id) === String(tree.rootId))
        .concat(pages.filter(page => String(page.id) !== String(tree.rootId)))
    : pages;
  const baseName = safePathPart(
    String(fileName).replace(/\.gridset$/i, ''),
    'gridset'
  );
  const pathByPageId = new Map(
    orderedPages.map((page, index) => [
      String(page.id),
      `boards/${baseName}-${index + 1}-${safePathPart(page.id, 'board')}.obf`
    ])
  );

  return orderedPages.map(page => ({
    path: pathByPageId.get(String(page.id)),
    board: createOpenBoard(page, locale, pathByPageId)
  }));
}
