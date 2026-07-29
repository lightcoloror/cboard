/**
 * Grid 3 Symbol Library Resolution
 *
 * Grid 3 uses symbol libraries stored as .pix files in the installation directory.
 * Symbol references in Grid files use the format: [library]/path/to/symbol.png
 *
 * Examples:
 * - [widgit]/food/apple.png
 * - [tawasl]/above bw.png
 * - [ssnaps]963.jpg
 * - [grid3x]/folder/document.png
 *
 * This module provides symbol resolution and metadata extraction.
 */
import { defaultFileAdapter } from '../../utils/io';
import { getZipAdapter } from '../../utils/zip';
import { isSymbolReference, parseSymbolReference } from './symbolReference';

export { isSymbolReference, parseSymbolReference };
/**
 * Default Grid 3 installation paths by platform
 */
const DEFAULT_GRID3_PATHS = {
  win32: 'C:\\Program Files (x86)\\Smartbox\\Grid 3',
  darwin: '/Applications/Grid 3.app/Contents/Resources',
  linux: '/opt/smartbox/grid3'
};
/**
 * Path to Symbols directory within Grid 3 installation
 * Contains .symbols ZIP archives with actual images
 */
const SYMBOLS_SUBDIR = 'Resources\\Symbols';
/**
 * Path to symbol search indexes within Grid 3 installation
 * Contains .pix index files for searching
 */
const SYMBOLSEARCH_SUBDIR = 'Locale';
/**
 * Known symbol libraries in Grid 3
 */
export const SYMBOL_LIBRARIES = {
  WIDGIT: 'widgit',
  TAWASL: 'tawasl',
  SSNAPS: 'ssnaps',
  GRID3X: 'grid3x',
  GRID2X: 'grid2x',
  BLISSX: 'blissx',
  EYEGAZ: 'eyegaz',
  INTERL: 'interl',
  METACM: 'metacm',
  MJPCS: 'mjpcs#',
  PCSHC: 'pcshc#',
  PCSTL: 'pcstl#',
  SESENS: 'sesens',
  SSTIX: 'sstix#',
  SYMOJI: 'symoji'
};
/**
 * Default locale to use
 */
export const DEFAULT_LOCALE = 'en-GB';
/**
 * Get the default Grid 3 installation path for the current platform
 * @returns Default Grid 3 path or empty string if not found
 */
export async function getDefaultGrid3Path(fileAdapter) {
  const { pathExists } =
    fileAdapter !== null && fileAdapter !== void 0
      ? fileAdapter
      : defaultFileAdapter;
  const platform =
    typeof process !== 'undefined' && process.platform
      ? process.platform
      : 'unknown';
  const defaultPath = DEFAULT_GRID3_PATHS[platform] || '';
  try {
    if (defaultPath && (await pathExists(defaultPath))) {
      return defaultPath;
    }
    // Try to find Grid 3 in common locations
    const commonPaths = [
      'C:\\Program Files (x86)\\Smartbox\\Grid 3',
      'C:\\Program Files\\Smartbox\\Grid 3',
      'C:\\Program Files\\Smartbox\\Grid 3',
      '/Applications/Grid 3.app',
      '/opt/smartbox/grid3'
    ];
    for (const testPath of commonPaths) {
      if (await pathExists(testPath)) {
        return testPath;
      }
    }
  } catch {
    return '';
  }
  return '';
}
/**
 * Get the Symbol Libraries directory path
 * Contains .symbols ZIP archives with actual image files
 * @param grid3Path - Grid 3 installation path
 * @returns Path to Symbol Libraries directory (e.g., "C:\...\Grid 3\Resources\Symbols")
 */
export function getSymbolLibrariesDir(
  grid3Path,
  fileAdapter = defaultFileAdapter
) {
  const { join } = fileAdapter;
  return join(grid3Path, SYMBOLS_SUBDIR);
}
/**
 * Get the symbol search indexes directory path for a given locale
 * Contains .pix index files for searching symbols
 * @param grid3Path - Grid 3 installation path
 * @param locale - Locale code (e.g., 'en-GB')
 * @returns Path to symbol search indexes directory (e.g., "C:\...\Grid 3\Locale\en-GB\symbolsearch")
 */
export function getSymbolSearchIndexesDir(
  grid3Path,
  locale = DEFAULT_LOCALE,
  fileAdapter = defaultFileAdapter
) {
  const { join } = fileAdapter;
  return join(grid3Path, SYMBOLSEARCH_SUBDIR, locale, 'symbolsearch');
}
/**
 * Get all available symbol libraries in the Grid 3 installation
 * @param options - Resolution options
 * @returns Array of symbol library information
 */
export async function getAvailableSymbolLibraries(options = {}, fileAdapter) {
  const { pathExists, getFileSize, listDir, join, basename } =
    fileAdapter !== null && fileAdapter !== void 0
      ? fileAdapter
      : defaultFileAdapter;
  const grid3Path =
    options.grid3Path || options.symbolDir || (await getDefaultGrid3Path());
  if (!grid3Path) {
    return [];
  }
  const symbolsDir = getSymbolLibrariesDir(grid3Path, fileAdapter);
  if (!(await pathExists(symbolsDir))) {
    return [];
  }
  const libraries = [];
  const files = await listDir(symbolsDir);
  for (const file of files) {
    if (file.endsWith('.symbols')) {
      const fullPath = join(symbolsDir, file);
      const size = await getFileSize(fullPath);
      const libraryName = basename(file, '.symbols');
      libraries.push({
        name: libraryName,
        pixFile: fullPath,
        // Reuse this field for the .symbols file path
        exists: true,
        size,
        locale: 'global' // .symbols files are not locale-specific
      });
    }
  }
  return libraries.sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * Check if a symbol library exists
 * @param libraryName - Name of the library (e.g., 'widgit', 'tawasl')
 * @param options - Resolution options
 * @returns Symbol library info or undefined if not found
 */
export async function getSymbolLibraryInfo(
  libraryName,
  options = {},
  fileAdapter
) {
  const { pathExists, getFileSize, join } =
    fileAdapter !== null && fileAdapter !== void 0
      ? fileAdapter
      : defaultFileAdapter;
  const grid3Path =
    options.grid3Path || options.symbolDir || (await getDefaultGrid3Path());
  if (!grid3Path) {
    return undefined;
  }
  const symbolsDir = getSymbolLibrariesDir(grid3Path, fileAdapter);
  const normalizedLibName = libraryName.toLowerCase();
  // Try different case variations
  const variations = [
    normalizedLibName + '.symbols',
    normalizedLibName.toUpperCase() + '.symbols',
    libraryName + '.symbols'
  ];
  for (const file of variations) {
    const fullPath = join(symbolsDir, file);
    if (await pathExists(fullPath)) {
      const size = await getFileSize(fullPath);
      return {
        name: libraryName,
        pixFile: fullPath,
        exists: true,
        size,
        locale: 'global'
      };
    }
  }
  return undefined;
}
/**
 * Resolve a symbol reference to extract the actual image data
 * @param reference - Symbol reference like "[tawasl]/above bw.png"
 * @param options - Resolution options
 * @returns Resolution result with image data if found
 */
export async function resolveSymbolReference(
  reference,
  options = {},
  fileAdapter = defaultFileAdapter,
  zipAdapter
) {
  const parsed = parseSymbolReference(reference);
  if (!parsed.isValid) {
    return {
      reference: parsed,
      found: false,
      error: 'Invalid symbol reference format'
    };
  }
  const grid3Path = options.grid3Path || (await getDefaultGrid3Path());
  if (!grid3Path) {
    return {
      reference: parsed,
      found: false,
      error: 'Grid 3 installation not found. Please specify grid3Path.'
    };
  }
  const libraryInfo = await getSymbolLibraryInfo(parsed.library, {
    grid3Path
  });
  if (!libraryInfo || !libraryInfo.exists) {
    return {
      reference: parsed,
      found: false,
      error: `Symbol library '${parsed.library}' not found at ${(libraryInfo ===
        null || libraryInfo === void 0
        ? void 0
        : libraryInfo.pixFile) || 'unknown'}`
    };
  }
  try {
    // .symbols files are ZIP archives
    const zipFile = libraryInfo.pixFile;
    const zip = zipAdapter
      ? await zipAdapter(zipFile)
      : await getZipAdapter(zipFile, fileAdapter);
    // The path in the symbol reference becomes the path within the symbols/ folder
    // e.g., [tawasl]/above bw.png becomes symbols/above bw.png
    const symbolPath = `symbols/${parsed.path}`;
    const entry = await zip.readFile(symbolPath);
    if (!entry) {
      // Try without the symbols/ prefix (in case reference already includes it)
      const altPath = parsed.path.startsWith('symbols/')
        ? parsed.path
        : `symbols/${parsed.path}`;
      const altEntry = await zip.readFile(altPath);
      if (!altEntry) {
        return {
          reference: parsed,
          found: false,
          error: `Symbol '${parsed.path}' not found in library '${
            parsed.library
          }'`,
          path: libraryInfo.pixFile,
          libraryInfo
        };
      }
      // Found with alternate path
      const data = Buffer.from(altEntry);
      return {
        reference: parsed,
        found: true,
        path: libraryInfo.pixFile,
        data,
        libraryInfo
      };
    }
    // Found the symbol!
    const data = Buffer.from(entry);
    return {
      reference: parsed,
      found: true,
      path: libraryInfo.pixFile,
      data,
      libraryInfo
    };
  } catch (error) {
    return {
      reference: parsed,
      found: false,
      error: `Failed to extract symbol: ${error.message}`,
      path: libraryInfo.pixFile,
      libraryInfo
    };
  }
}
/**
 * Get all symbol references from a gridset
 * This scans button images for symbol references
 * @param tree - AAC tree from loaded gridset
 * @returns Array of unique symbol references
 */
export function extractSymbolReferences(tree) {
  const references = new Set();
  for (const pageId in tree.pages) {
    const page = tree.pages[pageId];
    if (page.buttons) {
      for (const button of page.buttons) {
        if (button.image && isSymbolReference(String(button.image))) {
          references.add(String(button.image));
        }
        // Check for symbol library metadata
        if (button.symbolLibrary) {
          const ref = `[${button.symbolLibrary}]${button.symbolPath || ''}`;
          references.add(ref);
        }
      }
    }
  }
  return Array.from(references).sort();
}
/**
 * Create a symbol reference from library and path
 * @param library - Library name
 * @param symbolPath - Path within the library
 * @returns Formatted symbol reference
 */
export function createSymbolReference(library, symbolPath) {
  const normalizedLib = library.toLowerCase().replace(/\[|\]/g, '');
  const normalizedPath = symbolPath.replace(/^\\+/, '');
  return `[${normalizedLib}]${normalizedPath}`;
}
/**
 * Get the library name from a symbol reference
 * @param reference - Symbol reference
 * @returns Library name or empty string
 */
export function getSymbolLibraryName(reference) {
  const parsed = parseSymbolReference(reference);
  return parsed.library;
}
/**
 * Get the symbol path from a symbol reference
 * @param reference - Symbol reference
 * @returns Symbol path or empty string
 */
export function getSymbolPath(reference) {
  const parsed = parseSymbolReference(reference);
  return parsed.path;
}
/**
 * Check if a symbol library is one of the known Grid 3 libraries
 * @param libraryName - Library name to check
 * @returns True if it's a known library
 */
export function isKnownSymbolLibrary(libraryName) {
  const normalized = libraryName.toLowerCase().replace(/\[|\]/g, '');
  return Object.values(SYMBOL_LIBRARIES).includes(normalized);
}
/**
 * Get display name for a symbol library
 * @param libraryName - Library name
 * @returns Human-readable display name
 */
export function getSymbolLibraryDisplayName(libraryName) {
  const normalized = libraryName.toLowerCase().replace(/\[|\]/g, '');
  const displayNames = {
    widgit: 'Widgit Symbols',
    tawasl: 'Tawasol (Arabic)',
    ssnaps: 'Smartbox Symbol Snapshots',
    grid3x: 'Grid 3 Extended',
    grid2x: 'Grid 2 Extended',
    blissx: 'Blissymbols',
    eyegaz: 'Eye Gaze Symbols',
    interl: 'International Symbols',
    metacm: 'MetaComm',
    mjpcs: 'Mayer-Johnson PCS',
    pcshc: 'PCS High Contrast',
    pcstl: 'PCS Thin Line',
    sesens: 'Sensory Software',
    sstix: 'Smartbox TIX',
    symoji: 'Symbol Emoji'
  };
  return (
    displayNames[normalized] ||
    normalized.charAt(0).toUpperCase() + normalized.slice(1)
  );
}
export function analyzeSymbolUsage(tree) {
  const references = extractSymbolReferences(tree);
  const byLibrary = {};
  const libraries = new Set();
  for (const ref of references) {
    const lib = getSymbolLibraryName(ref);
    byLibrary[lib] = (byLibrary[lib] || 0) + 1;
    if (lib) {
      libraries.add(lib);
    }
  }
  return {
    totalSymbols: references.length,
    byLibrary,
    uniqueReferences: references,
    librariesUsed: Array.from(libraries).sort()
  };
}
/**
 * Convert symbol reference to filename for embedded images
 * Grid 3 sometimes embeds symbols with special naming
 * @param reference - Symbol reference
 * @param cellX - Cell X coordinate
 * @param cellY - Cell Y coordinate
 * @returns Generated filename
 */
export function symbolReferenceToFilename(reference, cellX, cellY) {
  const parsed = parseSymbolReference(reference);
  const dotIndex = parsed.path.lastIndexOf('.');
  const ext = dotIndex >= 0 ? parsed.path.slice(dotIndex) : '.png';
  // Grid 3 format: {x}-{y}-0-text-0.{ext}
  return `${cellX}-${cellY}-0-text-0${ext}`;
}
// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================
/**
 * @deprecated Use getSymbolLibrariesDir() instead - more descriptive name
 * Get the Symbols directory path (where .symbols ZIP archives are)
 */
export function getSymbolsDir(grid3Path) {
  return getSymbolLibrariesDir(grid3Path);
}
/**
 * @deprecated Use getSymbolSearchIndexesDir() instead - more descriptive name
 * Get the symbol search directory for a given locale (where .pix index files are)
 */
export function getSymbolSearchDir(grid3Path, locale = DEFAULT_LOCALE) {
  return getSymbolSearchIndexesDir(grid3Path, locale);
}
