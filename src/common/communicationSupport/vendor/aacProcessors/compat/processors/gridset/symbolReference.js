/**
 * Parse a Grid 3 symbol reference without loading filesystem or ZIP adapters.
 */
export function parseSymbolReference(reference) {
  const trimmed = reference.trim();
  const match = trimmed.match(/^\[([^\]]+)\](.+)$/);
  if (!match) {
    return {
      library: '',
      path: trimmed,
      fullReference: trimmed,
      isValid: false
    };
  }
  const [, library, symbolPath] = match;
  return {
    library: library.toLowerCase(),
    path: symbolPath.replace(/^\\+/, '').trim(),
    fullReference: trimmed,
    isValid: true
  };
}

export function isSymbolReference(reference) {
  return reference.trim().startsWith('[');
}
