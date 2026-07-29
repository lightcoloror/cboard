import { AstericsGridProcessor } from './vendor/aacProcessors/compat/processors/astericsGridProcessor';

export const ASTERICS_GRID_FILE_EXTENSION = 'grd';
export const ASTERICS_GRID_MAX_TEXT_LENGTH = 20 * 1024 * 1024;

const MAX_GRIDS = 100;
const MAX_ELEMENTS = 5000;
const MAX_GRID_DIMENSION = 100;
const MAX_INLINE_IMAGE_LENGTH = 4 * 1024 * 1024;

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeText(value, maxLength = 500) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, maxLength);
}

function localeCandidates(locale) {
  const normalized = normalizeText(locale, 40);
  const base = normalized.split(/[-_]/)[0];
  return Array.from(
    new Set(
      [normalized, normalized.replace('-', '_'), base, 'en', 'de', 'es'].filter(
        Boolean
      )
    )
  );
}

function localizedText(value, locale) {
  if (typeof value === 'string') return normalizeText(value, 500);
  if (!isRecord(value)) return '';

  const candidates = localeCandidates(locale);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = normalizeText(value[candidates[index]], 500);
    if (candidate) return candidate;
  }

  const fallback = Object.values(value).find(
    entry => typeof entry === 'string' && normalizeText(entry, 500)
  );
  return normalizeText(fallback, 500);
}

function localizedMap(value, locale) {
  const selected = localizedText(value, locale);
  if (!selected) return value;
  return {
    ...(isRecord(value) ? value : {}),
    en: selected
  };
}

function safePathPart(value, fallback) {
  const normalized = normalizeText(value, 120)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function positiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0
    ? Math.min(number, MAX_GRID_DIMENSION)
    : fallback;
}

function sourceGridDimensions(grid) {
  const elements = Array.isArray(grid.gridElements) ? grid.gridElements : [];
  const occupiedRows = elements.reduce(
    (maximum, element) =>
      Math.max(
        maximum,
        Number(element.y || 0) + positiveInteger(element.height)
      ),
    1
  );
  const occupiedColumns = elements.reduce(
    (maximum, element) =>
      Math.max(
        maximum,
        Number(element.x || 0) + positiveInteger(element.width)
      ),
    1
  );
  return {
    rows: Math.min(
      MAX_GRID_DIMENSION,
      Math.max(positiveInteger(grid.rowCount), occupiedRows)
    ),
    columns: Math.min(
      MAX_GRID_DIMENSION,
      Math.max(positiveInteger(grid.minColumnCount), occupiedColumns)
    )
  };
}

function prepareAction(action, locale) {
  if (!isRecord(action)) return action;
  return {
    ...action,
    ...(typeof action.speakText !== 'undefined'
      ? { speakText: localizedMap(action.speakText, locale) }
      : {})
  };
}

function prepareElement(element, locale) {
  const image = isRecord(element.image)
    ? { ...element.image, data: null }
    : element.image;
  return {
    ...element,
    label: localizedMap(element.label, locale),
    actions: Array.isArray(element.actions)
      ? element.actions.map(action => prepareAction(action, locale))
      : [],
    image
  };
}

function prepareGrid(grid, locale) {
  return {
    ...grid,
    label: localizedMap(grid.label, locale),
    gridElements: grid.gridElements.map(element =>
      prepareElement(element, locale)
    )
  };
}

function normalizeSourceImage(image, buttonId) {
  if (!isRecord(image)) return null;
  const data = normalizeText(image.data, MAX_INLINE_IMAGE_LENGTH);
  const safeData = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(
    data
  )
    ? data
    : '';
  const url = normalizeText(image.url, 2000);
  const safeUrl = /^https:\/\//i.test(url) ? url : '';
  if (!safeData && !safeUrl) return null;

  return {
    id:
      normalizeText(image.id, 160) ||
      `asterics-image-${safePathPart(buttonId, 'button')}`,
    ...(safeData ? { data: safeData } : {}),
    ...(safeUrl ? { url: safeUrl } : {}),
    author: normalizeText(image.author, 300),
    license:
      normalizeText(image.license, 300) || normalizeText(image.author, 300),
    source_url: normalizeText(image.authorURL || image.authorUrl, 2000)
  };
}

function sourceVocalization(element, locale) {
  if (!isRecord(element)) return '';
  const actions = Array.isArray(element.actions) ? element.actions : [];
  const customSpeak = actions.find(
    action => isRecord(action) && action.modelName === 'GridActionSpeakCustom'
  );
  return customSpeak
    ? localizedText(customSpeak.speakText, locale)
    : localizedText(element.label, locale);
}

function createMemoryFileAdapter() {
  return {
    readBinaryFromInput: async input => input,
    readTextFromInput: async input => input.text
  };
}

function createOpenBoardFromPage({
  page,
  sourceGrid,
  dimensions,
  locale,
  pathByPageId
}) {
  const sourceElements = new Map(
    sourceGrid.gridElements.map(element => [String(element.id), element])
  );
  const images = [];
  const buttons = page.buttons.map(button => {
    const sourceElement = sourceElements.get(String(button.id));
    const image = normalizeSourceImage(
      sourceElement && sourceElement.image,
      button.id
    );
    const targetPageId = String(button.targetPageId || '');
    const result = {
      id: button.id,
      label: button.label,
      vocalization:
        sourceVocalization(sourceElement, locale) ||
        button.message ||
        button.label,
      background_color: button.style && button.style.backgroundColor,
      border_color: button.style && button.style.borderColor,
      hidden: button.visibility === 'Hidden'
    };
    if (image) {
      result.image_id = image.id;
      images.push(image);
    }
    if (targetPageId && pathByPageId.has(targetPageId)) {
      result.load_board = {
        path: pathByPageId.get(targetPageId)
      };
    }
    return result;
  });

  return {
    format: 'open-board-0.1',
    id: page.id,
    locale: normalizeText(locale, 40) || 'en',
    name:
      localizedText(sourceGrid.label, locale) || page.name || 'AsTeRICS Grid',
    grid: {
      rows: dimensions.rows,
      columns: dimensions.columns,
      order: page.grid
        .slice(0, dimensions.rows)
        .map(row =>
          row
            .slice(0, dimensions.columns)
            .map(cell => (cell && cell.id ? cell.id : null))
        )
    },
    buttons,
    images,
    sounds: []
  };
}

function normalizeInputText(value) {
  const text = String(
    value === undefined || value === null ? '' : value
  ).replace(/^\uFEFF/, '');
  if (!text || text.length > ASTERICS_GRID_MAX_TEXT_LENGTH) {
    throw new TypeError('Invalid or oversized AsTeRICS Grid document');
  }
  return text;
}

export async function convertAstericsGridToOpenBoardDocuments({
  text,
  fileName = 'imported.grd',
  locale = 'zh-CN'
} = {}) {
  const normalizedText = normalizeInputText(text);
  let source;
  try {
    source = JSON.parse(normalizedText);
  } catch (error) {
    throw new TypeError('Invalid AsTeRICS Grid JSON');
  }

  if (!isRecord(source) || !Array.isArray(source.grids)) {
    throw new TypeError('AsTeRICS Grid document has no grids');
  }
  if (!source.grids.length || source.grids.length > MAX_GRIDS) {
    throw new TypeError('AsTeRICS Grid document has an invalid grid count');
  }

  let elementCount = 0;
  source.grids.forEach(grid => {
    if (!isRecord(grid) || !Array.isArray(grid.gridElements)) {
      throw new TypeError('AsTeRICS Grid contains a malformed grid');
    }
    elementCount += grid.gridElements.length;
  });
  if (elementCount > MAX_ELEMENTS) {
    throw new TypeError('AsTeRICS Grid contains too many elements');
  }

  const prepared = {
    ...source,
    grids: source.grids.map(grid => prepareGrid(grid, locale))
  };
  const fileAdapter = createMemoryFileAdapter();
  const processorInput = {
    text: JSON.stringify(prepared),
    byteLength: normalizedText.length
  };
  const tree = await new AstericsGridProcessor({
    preserveAllButtons: true,
    fileAdapter
  }).loadIntoTree(processorInput);
  const pages = Object.values(tree.pages);
  if (!pages.length) {
    throw new TypeError('AsTeRICS Grid document produced no boards');
  }

  const sourceGridById = new Map(
    source.grids.map(grid => [String(grid.id), grid])
  );
  const baseName = safePathPart(
    String(fileName).replace(/\.grd(?:\.json)?$/i, ''),
    'asterics'
  );
  const pathByPageId = new Map(
    pages.map((page, index) => [
      String(page.id),
      `boards/${baseName}-${index + 1}-${safePathPart(page.id, 'board')}.obf`
    ])
  );
  return pages.map(page => {
    const sourceGrid = sourceGridById.get(String(page.id));
    if (!sourceGrid) {
      throw new TypeError('AsTeRICS Grid page has no source grid');
    }
    const board = createOpenBoardFromPage({
      page,
      sourceGrid,
      dimensions: sourceGridDimensions(sourceGrid),
      locale,
      pathByPageId
    });

    return {
      path: pathByPageId.get(String(page.id)),
      board
    };
  });
}
