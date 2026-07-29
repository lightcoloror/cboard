import { CBOARD_EXT_PREFIX, CBOARD_EXT_PROPERTIES } from './Export.constants';

function toSnakeCase(str) {
  const value = str.replace(/([A-Z])/g, $1 => '_' + $1.toLowerCase());
  return value.startsWith('_') ? value.slice(1) : value;
}

export function getCboardOpenBoardExtensions(
  target = {},
  { includeFalsy = false } = {}
) {
  return CBOARD_EXT_PROPERTIES.reduce((extensions, key) => {
    const value = target[key];
    const shouldInclude = includeFalsy ? typeof value !== 'undefined' : !!value;

    if (shouldInclude) {
      extensions[`${CBOARD_EXT_PREFIX}${toSnakeCase(key)}`] = value;
    }

    return extensions;
  }, {});
}
