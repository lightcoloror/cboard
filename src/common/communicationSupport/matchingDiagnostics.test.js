import { analyzeCommunicationMatching } from './matchingDiagnostics';

const boards = [
  {
    id: 'core',
    name: '核心词',
    tiles: [
      {
        id: 'water',
        label: '水',
        image: '/water.svg',
        communication: {
          synonyms: ['饮水'],
          excludeTokens: [],
          category: 'food'
        }
      },
      {
        id: 'drink',
        label: '喝',
        image: '/drink.svg',
        communication: {
          synonyms: [],
          excludeTokens: [],
          category: 'actions'
        }
      }
    ]
  }
];

describe('communication matching diagnostics', () => {
  test('returns a stable read-only summary of matched and missing tokens', () => {
    const ticks = [100, 112];
    const result = analyzeCommunicationMatching('喝水水杯', boards, {
      preSegmented: ['喝', '水', '水杯'],
      now: () => ticks.shift()
    });

    expect(result).toEqual(
      expect.objectContaining({
        inputText: '喝水水杯',
        matchedCount: 2,
        totalCount: 3,
        matchRate: 2 / 3,
        unmatchedTokens: ['水杯'],
        elapsedMs: 12
      })
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        token: '喝',
        matched: true,
        matchType: 'exact',
        pictogramId: 'drink',
        label: '喝'
      }),
      expect.objectContaining({
        token: '水',
        matched: true,
        pictogramId: 'water'
      }),
      expect.objectContaining({
        token: '水杯',
        matched: false,
        matchType: 'none',
        pictogramId: null
      })
    ]);
  });

  test('keeps empty input safe and bounds diagnostic text', () => {
    expect(
      analyzeCommunicationMatching('', boards, {
        now: () => 10
      })
    ).toEqual(
      expect.objectContaining({
        inputText: '',
        items: [],
        totalCount: 0,
        matchRate: 0,
        unmatchedTokens: []
      })
    );

    const result = analyzeCommunicationMatching('水'.repeat(140), boards, {
      preSegmented: ['水'],
      now: () => 10
    });
    expect(Array.from(result.inputText)).toHaveLength(120);
  });

  test('uses the same workspace correction memory as the receiver flow', () => {
    const result = analyzeCommunicationMatching('水', boards, {
      preSegmented: ['水'],
      correctionMemory: {
        contractVersion: 1,
        scope: 'workspace-local',
        workspaceId: 'workspace-1',
        generatedAt: 10,
        rules: [
          {
            token: '水',
            preferredPictogramId: 'drink',
            blockedPictogramIds: [],
            tombstones: [],
            frequencyCount: 1,
            recencyWeight: 1,
            score: 1,
            lastCorrectedAt: 10
          }
        ]
      },
      now: () => 10
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({ pictogramId: 'drink', label: '喝' })
    );
  });
});
