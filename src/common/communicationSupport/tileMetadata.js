import { LEGACY_COMMUNICATION_TILE_METADATA_KEYS } from './legacy';

export const COMMUNICATION_TILE_METADATA_KEYS = {
  synonyms: 'communicationSynonyms',
  relatedTerms: 'communicationRelatedTerms',
  excludeTokens: 'communicationExcludeTokens',
  category: 'communicationCategory'
};

export { LEGACY_COMMUNICATION_TILE_METADATA_KEYS } from './legacy';

function readFirstString(target, keys) {
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = target && target[key];
    if (typeof value === 'string' && value.length) {
      return value;
    }
  }

  return '';
}

function readFirstHintList(target, keys) {
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = target && target[key];

    if (Array.isArray(value)) {
      const normalized = value
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .join(',');

      if (normalized) {
        return normalized;
      }
    }

    if (typeof value === 'string' && value.length) {
      return value;
    }
  }

  return '';
}

export function getCommunicationTileMetadata(target = {}) {
  const dtoMetadata =
    target.communication && typeof target.communication === 'object'
      ? target.communication
      : {};

  return {
    synonyms:
      readFirstHintList(target, [
        COMMUNICATION_TILE_METADATA_KEYS.synonyms,
        LEGACY_COMMUNICATION_TILE_METADATA_KEYS.synonyms
      ]) || readFirstHintList(dtoMetadata, ['synonyms']),
    relatedTerms:
      readFirstHintList(target, [
        COMMUNICATION_TILE_METADATA_KEYS.relatedTerms,
        LEGACY_COMMUNICATION_TILE_METADATA_KEYS.relatedTerms
      ]) || readFirstHintList(dtoMetadata, ['relatedTerms']),
    excludeTokens:
      readFirstHintList(target, [
        COMMUNICATION_TILE_METADATA_KEYS.excludeTokens,
        LEGACY_COMMUNICATION_TILE_METADATA_KEYS.excludeTokens
      ]) || readFirstHintList(dtoMetadata, ['excludeTokens']),
    category:
      readFirstString(target, [
        COMMUNICATION_TILE_METADATA_KEYS.category,
        LEGACY_COMMUNICATION_TILE_METADATA_KEYS.category
      ]) || readFirstString(dtoMetadata, ['category'])
  };
}

export function setCommunicationTileMetadata(target = {}, metadata = {}) {
  const nextTarget = { ...target };

  if (Object.prototype.hasOwnProperty.call(metadata, 'synonyms')) {
    nextTarget[COMMUNICATION_TILE_METADATA_KEYS.synonyms] =
      metadata.synonyms || '';
    nextTarget[LEGACY_COMMUNICATION_TILE_METADATA_KEYS.synonyms] =
      metadata.synonyms || '';
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'relatedTerms')) {
    nextTarget[COMMUNICATION_TILE_METADATA_KEYS.relatedTerms] =
      metadata.relatedTerms || '';
    nextTarget[LEGACY_COMMUNICATION_TILE_METADATA_KEYS.relatedTerms] =
      metadata.relatedTerms || '';
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'excludeTokens')) {
    nextTarget[COMMUNICATION_TILE_METADATA_KEYS.excludeTokens] =
      metadata.excludeTokens || '';
    nextTarget[LEGACY_COMMUNICATION_TILE_METADATA_KEYS.excludeTokens] =
      metadata.excludeTokens || '';
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'category')) {
    nextTarget[COMMUNICATION_TILE_METADATA_KEYS.category] =
      metadata.category || '';
    nextTarget[LEGACY_COMMUNICATION_TILE_METADATA_KEYS.category] =
      metadata.category || '';
  }

  return nextTarget;
}
