import {
  astericsGridImportAdapter,
  cboardImportAdapter,
  gridsetImportAdapter,
  obzImportAdapter,
  obfImportAdapter,
  snapImportAdapter,
  touchChatImportAdapter,
  zipImportAdapter
} from './Import.helpers';
import {
  CBOARD_EXT_PROPERTIES as EXPORT_CBOARD_EXT_PROPERTIES,
  CBOARD_EXT_PREFIX as EXPORT_CBOARD_EXT_PREFIX
} from '../Export/Export.constants';

export const IMPORT_CONFIG_BY_EXTENSION = {
  grd: astericsGridImportAdapter,
  gridset: gridsetImportAdapter,
  json: cboardImportAdapter,
  sps: snapImportAdapter,
  spb: snapImportAdapter,
  ce: touchChatImportAdapter,
  zip: zipImportAdapter,
  obz: obzImportAdapter,
  obf: obfImportAdapter
};

export const IMPORT_PATHS = {
  boards: '.obf',
  images: 'images/',
  sounds: 'sounds/'
};

export const CBOARD_EXT_PREFIX = EXPORT_CBOARD_EXT_PREFIX;

export const CBOARD_EXT_PROPERTIES = EXPORT_CBOARD_EXT_PROPERTIES;

const importConstants = {
  IMPORT_CONFIG_BY_EXTENSION,
  IMPORT_PATHS,
  CBOARD_EXT_PREFIX,
  CBOARD_EXT_PROPERTIES
};

export default importConstants;
