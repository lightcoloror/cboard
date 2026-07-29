import {
  COMMUNICATION_TILE_METADATA_KEYS,
  LEGACY_COMMUNICATION_TILE_METADATA_KEYS,
  getCommunicationTileMetadata,
  setCommunicationTileMetadata
} from './tileMetadata';

describe('communication tile metadata adapter', () => {
  test('prefers neutral metadata keys when available', () => {
    const result = getCommunicationTileMetadata({
      [COMMUNICATION_TILE_METADATA_KEYS.synonyms]: '喝水,饮水',
      [LEGACY_COMMUNICATION_TILE_METADATA_KEYS.synonyms]: '旧值'
    });

    expect(result.synonyms).toBe('喝水,饮水');
  });

  test('falls back to legacy metadata keys', () => {
    const result = getCommunicationTileMetadata({
      [LEGACY_COMMUNICATION_TILE_METADATA_KEYS.excludeTokens]: '鞋,袜子'
    });

    expect(result.excludeTokens).toBe('鞋,袜子');
  });

  test('reads versioned TileDTO communication metadata', () => {
    const result = getCommunicationTileMetadata({
      communication: {
        synonyms: ['想', '希望'],
        relatedTerms: ['选择', '愿望'],
        excludeTokens: ['不想'],
        category: 'actions'
      }
    });

    expect(result).toEqual({
      synonyms: '想,希望',
      relatedTerms: '选择,愿望',
      excludeTokens: '不想',
      category: 'actions'
    });
  });

  test('writes both neutral and legacy metadata keys', () => {
    const result = setCommunicationTileMetadata(
      {},
      {
        synonyms: '休息一下',
        relatedTerms: '床,睡觉',
        excludeTokens: '开心果',
        category: 'medical'
      }
    );

    expect(result[COMMUNICATION_TILE_METADATA_KEYS.synonyms]).toBe('休息一下');
    expect(result[LEGACY_COMMUNICATION_TILE_METADATA_KEYS.synonyms]).toBe(
      '休息一下'
    );
    expect(result[COMMUNICATION_TILE_METADATA_KEYS.relatedTerms]).toBe(
      '床,睡觉'
    );
    expect(result[LEGACY_COMMUNICATION_TILE_METADATA_KEYS.relatedTerms]).toBe(
      '床,睡觉'
    );
    expect(result[COMMUNICATION_TILE_METADATA_KEYS.category]).toBe('medical');
    expect(result[LEGACY_COMMUNICATION_TILE_METADATA_KEYS.category]).toBe(
      'medical'
    );
  });
});
