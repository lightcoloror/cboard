import {
  createBoardImportReview,
  createPictureLibraryImportReview
} from './Import.review';

describe('import review', () => {
  test('reports duplicate and malformed boards before applying new boards', () => {
    const boards = [
      { id: 'existing', name: 'Existing', tiles: [{ id: 'water' }] },
      {
        id: 'new-board',
        name: 'New board',
        tiles: [{ id: 'food' }, { id: 'drink' }]
      }
    ];
    Object.defineProperty(boards, 'importDiagnostics', {
      value: {
        skippedMalformedBoardCount: 1,
        skippedUnsupportedBoardCount: 1
      }
    });

    const review = createBoardImportReview({
      boards,
      existingBoards: [{ id: 'existing', name: 'Local', tiles: [] }],
      fileName: 'library.obz',
      format: 'OBZ'
    });

    expect(review).toEqual(
      expect.objectContaining({
        kind: 'boards',
        fileName: 'library.obz',
        format: 'OBZ',
        canApply: true,
        applicableBoards: [boards[1]],
        summary: {
          boardCount: 2,
          importableBoardCount: 1,
          tileCount: 3,
          conflictCount: 1,
          skippedCount: 2,
          customPictureCount: 0
        }
      })
    );
    expect(review.items[0].conflict).toBe(true);
  });

  test('summarizes full picture-library conflicts and final changes', () => {
    const existing = {
      id: 'daily',
      name: 'Daily',
      tiles: [{ id: 'water', label: 'Water' }]
    };
    const updated = {
      ...existing,
      tiles: [{ id: 'water', label: 'Drink water' }]
    };
    const added = {
      id: 'people',
      name: 'People',
      tiles: [{ id: 'mother', label: 'Mother' }]
    };
    const review = createPictureLibraryImportReview({
      restored: {
        archive: { boards: [updated, added] },
        boards: [updated, added],
        summary: {
          boardCount: 2,
          tileCount: 2,
          customPictureCount: 1,
          conflictStrategy: 'merge'
        }
      },
      existingBoards: [existing],
      fileName: 'picture-library.zip',
      format: 'ZIP'
    });

    expect(review.canApply).toBe(true);
    expect(review.summary).toEqual({
      boardCount: 2,
      importableBoardCount: 2,
      tileCount: 2,
      conflictCount: 1,
      skippedCount: 0,
      customPictureCount: 1,
      conflictStrategy: 'merge'
    });
  });

  test('allows a complete-device restore when boards are unchanged', () => {
    const board = {
      id: 'daily',
      name: 'Daily',
      tiles: [{ id: 'water', label: 'Water' }]
    };
    const deviceDataStats = {
      pictogramCount: 1,
      categoryCount: 1,
      expressionCount: 2,
      savedPhraseCount: 1,
      savedPhraseTombstoneCount: 1,
      correctionCount: 1,
      draftCount: 1
    };
    const review = createPictureLibraryImportReview({
      restored: {
        archive: { boards: [board] },
        boards: [board],
        summary: {
          boardCount: 1,
          tileCount: 1,
          customPictureCount: 0,
          conflictStrategy: 'merge',
          deviceDataStats
        }
      },
      existingBoards: [board],
      fileName: 'complete-device.zip',
      format: 'ZIP'
    });

    expect(review.canApply).toBe(true);
    expect(review.summary.deviceDataStats).toEqual(deviceDataStats);
  });
});
