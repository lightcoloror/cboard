import {
  applyMissingTokenResolutions,
  reviewMissingTokenRecord
} from './missingTokens';
import { buildReceiverHistoryEntry } from './receiverPipeline';
import { normalizeCommunicationMissingTokens } from './storage';

const onlinePictogram = {
  id: 'runtime_arasaac_123',
  image: 'wxfile://saved/apple.png',
  label: '苹果',
  source: {
    provider: 'arasaac',
    originalId: '123',
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    author: 'Sergio Palao',
    authorUrl: 'https://arasaac.org/',
    sourceUrl: 'https://arasaac.org/pictograms/123'
  }
};
const alternativeOnlinePictogram = {
  ...onlinePictogram,
  id: 'runtime_arasaac_456',
  image: 'wxfile://saved/apple-alternative.png',
  source: {
    ...onlinePictogram.source,
    originalId: '456',
    sourceUrl: 'https://arasaac.org/pictograms/456'
  }
};

describe('online missing-token resolution', () => {
  test('persists a licensed suggestion and reuses it after caregiver confirmation', () => {
    const initial = [
      {
        id: 'missing-apple',
        normalizedToken: '苹果',
        status: 'new',
        occurrenceCount: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ];
    const suggested = reviewMissingTokenRecord(
      initial,
      'missing-apple',
      {
        status: 'suggested',
        suggestedPictogram: onlinePictogram,
        source: 'online:arasaac'
      },
      { now: () => 2 }
    );
    const resolved = reviewMissingTokenRecord(
      suggested,
      'missing-apple',
      {
        status: 'resolved',
        resolvedPictogramId: onlinePictogram.id,
        source: 'online:arasaac'
      },
      { now: () => 3 }
    );
    const restored = normalizeCommunicationMissingTokens(resolved);
    const reviewItems = applyMissingTokenResolutions(
      [{ id: 'review-apple', token: '苹果', tile: null, matchType: 'none' }],
      restored,
      []
    );

    expect(suggested[0]).toEqual(
      expect.objectContaining({
        status: 'suggested',
        suggestedPictogramId: onlinePictogram.id,
        suggestedPictogram: expect.objectContaining({
          image: 'wxfile://saved/apple.png'
        })
      })
    );
    expect(restored[0].resolvedPictogram).toEqual(
      expect.objectContaining({
        id: onlinePictogram.id,
        source: expect.objectContaining({ provider: 'arasaac' })
      })
    );
    expect(reviewItems[0]).toEqual(
      expect.objectContaining({
        matchType: 'online',
        tile: expect.objectContaining({
          displayLabel: '苹果',
          tile: expect.objectContaining({
            image: 'wxfile://saved/apple.png'
          })
        })
      })
    );

    expect(buildReceiverHistoryEntry('苹果', reviewItems)).toEqual(
      expect.objectContaining({
        pictogramSequence: [
          expect.objectContaining({
            pictogramId: onlinePictogram.id,
            source: 'arasaac',
            matchType: 'online',
            attribution: expect.objectContaining({
              provider: 'arasaac',
              license: 'CC BY-NC-SA 4.0'
            })
          })
        ]
      })
    );
  });

  test('rejects an online suggestion without traceable source metadata', () => {
    expect(() =>
      reviewMissingTokenRecord(
        [{ id: 'missing-apple', normalizedToken: '苹果', status: 'new' }],
        'missing-apple',
        {
          status: 'suggested',
          suggestedPictogram: {
            id: 'unsafe',
            label: '苹果',
            image: '/unsafe.png'
          }
        }
      )
    ).toThrow('requires a pictogram id');
  });

  test('keeps a bounded candidate list and resolves the caregiver-selected image', () => {
    const initial = [
      {
        id: 'missing-apple',
        normalizedToken: '苹果',
        status: 'new'
      }
    ];
    const suggested = reviewMissingTokenRecord(initial, 'missing-apple', {
      status: 'suggested',
      suggestedPictograms: [
        onlinePictogram,
        alternativeOnlinePictogram,
        onlinePictogram,
        {
          ...alternativeOnlinePictogram,
          id: 'runtime_arasaac_789'
        },
        {
          ...alternativeOnlinePictogram,
          id: 'runtime_arasaac_999'
        },
        {
          ...alternativeOnlinePictogram,
          id: 'runtime_arasaac_overflow'
        }
      ],
      source: 'online:arasaac'
    });
    const restoredSuggestion = normalizeCommunicationMissingTokens(
      suggested
    )[0];

    expect(restoredSuggestion.suggestedPictograms).toHaveLength(4);
    expect(restoredSuggestion.suggestedPictogram).toEqual(
      expect.objectContaining({ id: onlinePictogram.id })
    );

    const resolved = reviewMissingTokenRecord(
      [restoredSuggestion],
      'missing-apple',
      {
        status: 'resolved',
        resolvedPictogramId: alternativeOnlinePictogram.id,
        source: 'online:arasaac'
      }
    )[0];

    expect(resolved.resolvedPictogram).toEqual(
      expect.objectContaining({
        id: alternativeOnlinePictogram.id,
        image: 'wxfile://saved/apple-alternative.png'
      })
    );
    expect(resolved.suggestedPictograms).toEqual([]);
  });
});
