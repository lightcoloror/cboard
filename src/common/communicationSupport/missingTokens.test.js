import {
  MISSING_TOKEN_STATUSES,
  applyMissingTokenResolutions,
  countCatalogAutoResolvedMissingTokens,
  countPendingMissingTokens,
  findSafeLocalMissingTokenResolutions,
  normalizeMissingTokenText,
  recordMissingTokenOccurrences,
  reviewMissingTokenRecord
} from './missingTokens';
import { buildDevicePrivateRuntimePictogram } from './runtimePictogram';

describe('missing token records', () => {
  test('normalizes and aggregates repeated unresolved tokens', () => {
    const records = recordMissingTokenOccurrences(
      [],
      ['  Head Dizzy ', '头晕', '头晕'],
      {
        rawText: '我 Head Dizzy，也头晕',
        identity: { patientId: 'patient-1', workspaceId: 'workspace-1' },
        now: () => 100,
        createId: prefix => `${prefix}-1`
      }
    );

    expect(normalizeMissingTokenText('  Head   Dizzy ')).toBe('head dizzy');
    expect(records).toEqual([
      expect.objectContaining({
        normalizedToken: 'head dizzy',
        status: MISSING_TOKEN_STATUSES.new,
        occurrenceCount: 1,
        rawTextSamples: ['我 Head Dizzy，也头晕'],
        patientId: 'patient-1',
        workspaceId: 'workspace-1'
      }),
      expect.objectContaining({
        normalizedToken: '头晕',
        occurrenceCount: 2
      })
    ]);
  });

  test('preserves caregiver state and keeps only five distinct raw samples', () => {
    let records = [
      {
        id: 'missing-1',
        normalizedToken: '头晕',
        status: 'ignored',
        occurrenceCount: 2,
        scenes: ['receiver'],
        rawTextSamples: ['样本 1'],
        reviewedByCaregiver: true,
        createdAt: 10,
        updatedAt: 10
      }
    ];

    for (let index = 2; index <= 7; index += 1) {
      records = recordMissingTokenOccurrences(records, ['头晕'], {
        rawText: `样本 ${index}`,
        now: () => 10 + index
      });
    }

    expect(records[0]).toEqual(
      expect.objectContaining({
        id: 'missing-1',
        status: 'ignored',
        occurrenceCount: 8,
        reviewedByCaregiver: true,
        createdAt: 10,
        updatedAt: 17,
        rawTextSamples: ['样本 7', '样本 6', '样本 5', '样本 4', '样本 3']
      })
    );
  });

  test('does nothing when there are no unresolved tokens', () => {
    const existing = [{ id: 'missing-1', normalizedToken: '头晕' }];
    expect(recordMissingTokenOccurrences(existing, [])).toEqual(existing);
  });

  test('counts the full pending queue while preserving catalog resolution evidence', () => {
    const pendingRecords = Array.from({ length: 25 }, (_, index) => ({
      id: `pending-${index}`,
      normalizedToken: `缺词-${index}`,
      status: index === 0 ? 'suggested' : 'new'
    }));
    const records = [
      ...pendingRecords,
      {
        id: 'catalog-resolved',
        normalizedToken: '叉子',
        status: 'resolved',
        source: 'catalog-auto'
      },
      {
        id: 'caregiver-resolved',
        normalizedToken: '头晕',
        status: 'resolved',
        source: 'caregiver'
      },
      {
        id: 'ignored',
        normalizedToken: '忽略词',
        status: 'ignored'
      }
    ];

    expect(countPendingMissingTokens(records)).toBe(25);
    expect(countPendingMissingTokens(records, new Set(['pending-0']))).toBe(24);
    expect(countCatalogAutoResolvedMissingTokens(records)).toBe(1);
  });

  test('finds only unique, image-backed exact or synonym local resolutions', () => {
    const records = [
      { id: 'fork-record', normalizedToken: '叉子', status: 'new' },
      { id: 'knife-record', normalizedToken: '刀', status: 'suggested' },
      { id: 'water-record', normalizedToken: '水', status: 'new' },
      { id: 'ignored-record', normalizedToken: '勺子', status: 'ignored' },
      { id: 'no-image-record', normalizedToken: '头晕', status: 'new' }
    ];
    const catalog = [
      {
        labels: ['叉子'],
        synonyms: ['餐叉'],
        tile: { id: 'fork', image: '/fork.png' }
      },
      {
        labels: ['餐刀'],
        synonyms: ['刀'],
        tile: { id: 'knife', image: '/knife.png' }
      },
      {
        labels: ['水'],
        synonyms: [],
        tile: { id: 'water-1', image: '/water-1.png' }
      },
      {
        labels: ['水'],
        synonyms: [],
        tile: { id: 'water-2', image: '/water-2.png' }
      },
      {
        labels: ['勺子'],
        synonyms: [],
        tile: { id: 'spoon', image: '/spoon.png' }
      },
      {
        labels: ['头晕'],
        synonyms: [],
        tile: { id: 'dizzy', image: '' }
      }
    ];

    expect(findSafeLocalMissingTokenResolutions(records, catalog)).toEqual([
      {
        recordId: 'fork-record',
        normalizedToken: '叉子',
        resolvedPictogramId: 'fork',
        source: 'catalog-auto',
        reviewedByCaregiver: false,
        matchType: 'exact'
      },
      {
        recordId: 'knife-record',
        normalizedToken: '刀',
        resolvedPictogramId: 'knife',
        source: 'catalog-auto',
        reviewedByCaregiver: false,
        matchType: 'synonym'
      }
    ]);
  });

  test('distinguishes automatic catalog resolution from caregiver review', () => {
    const resolved = reviewMissingTokenRecord(
      [
        {
          id: 'missing-1',
          normalizedToken: '叉子',
          status: 'new',
          updatedAt: 10
        }
      ],
      'missing-1',
      {
        status: 'resolved',
        resolvedPictogramId: 'fork',
        source: 'catalog-auto',
        reviewedByCaregiver: false
      },
      { now: () => 20 }
    );

    expect(resolved[0]).toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'fork',
        source: 'catalog-auto',
        reviewedByCaregiver: false,
        updatedAt: 20
      })
    );
  });

  test('supports caregiver ignore, restore, and resolve transitions', () => {
    const initial = [
      {
        id: 'missing-1',
        normalizedToken: '头晕',
        status: 'new',
        occurrenceCount: 2,
        createdAt: 10,
        updatedAt: 10
      }
    ];
    const ignored = reviewMissingTokenRecord(
      initial,
      'missing-1',
      { status: 'ignored' },
      { now: () => 20 }
    );
    const restored = reviewMissingTokenRecord(
      ignored,
      'missing-1',
      { status: 'new' },
      { now: () => 30 }
    );
    const resolved = reviewMissingTokenRecord(
      restored,
      'missing-1',
      { status: 'resolved', resolvedPictogramId: 'dizzy', source: 'caregiver' },
      { now: () => 40 }
    );

    expect(ignored[0]).toEqual(
      expect.objectContaining({ status: 'ignored', reviewedByCaregiver: true })
    );
    expect(restored[0]).toEqual(
      expect.objectContaining({ status: 'new', reviewedByCaregiver: false })
    );
    expect(resolved[0]).toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'dizzy',
        source: 'caregiver',
        reviewedByCaregiver: true,
        updatedAt: 40
      })
    );
  });

  test('requires an associated pictogram before resolving a token', () => {
    expect(() =>
      reviewMissingTokenRecord(
        [{ id: 'missing-1', normalizedToken: '头晕', status: 'new' }],
        'missing-1',
        { status: 'resolved' }
      )
    ).toThrow('requires a pictogram id');
  });

  test('applies a caregiver resolution only while its tile still exists', () => {
    const items = [{ id: 'review-1', token: '头晕', tile: null }];
    const records = [
      {
        normalizedToken: '头晕',
        status: 'resolved',
        resolvedPictogramId: 'dizzy'
      }
    ];
    const candidate = { id: 'home:dizzy', tile: { id: 'dizzy' } };

    expect(applyMissingTokenResolutions(items, records, [candidate])).toEqual([
      expect.objectContaining({
        tile: candidate,
        matchType: 'manual'
      })
    ]);
    expect(applyMissingTokenResolutions(items, records, [])).toEqual(items);
  });

  test('applies a device-private missing-token image as a manual local match', () => {
    const pictogram = buildDevicePrivateRuntimePictogram({
      recordId: 'missing-private',
      label: '家里的药盒',
      image: 'data:image/png;base64,private'
    });
    const items = [{ id: 'review-private', token: '家里的药盒', tile: null }];
    const records = [
      {
        id: 'missing-private',
        normalizedToken: '家里的药盒',
        status: 'resolved',
        resolvedPictogramId: pictogram.id,
        resolvedPictogram: pictogram,
        source: 'device-private'
      }
    ];

    expect(applyMissingTokenResolutions(items, records, [])).toEqual([
      expect.objectContaining({
        matchType: 'manual',
        tile: expect.objectContaining({
          boardId: 'device-private-pictograms',
          tile: expect.objectContaining({
            image: 'data:image/png;base64,private'
          })
        })
      })
    ]);
  });
});
