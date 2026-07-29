import {
  DEFAULT_COMMUNICATION_PREFERENCES,
  normalizeCommunicationPreferences,
  projectVisibleCommunicationBoards,
  toggleCommunicationBoardVisibility,
  updateCommunicationPreferences
} from './communicationPreferences';

describe('communication preferences', () => {
  test('normalizes display, speech and onboarding values', () => {
    expect(
      normalizeCommunicationPreferences({
        highContrast: 1,
        fontSize: 'extra-large',
        gridColumns: 4,
        speechRate: 9,
        speechVoice: '  verse  ',
        candidateAutoplayDelaySeconds: 30,
        onlinePictogramSearchEnabled: false,
        pictogramSortMode: 'popularity',
        hiddenBoardIds: ['home', 'home', ''],
        onboardingComplete: true
      })
    ).toEqual({
      highContrast: true,
      fontSize: 'extra-large',
      gridColumns: 4,
      speechRate: 2,
      speechVoice: 'verse',
      candidateAutoplayDelaySeconds: 30,
      onlinePictogramSearchEnabled: false,
      pictogramSortMode: 'popularity',
      hiddenBoardIds: ['home'],
      onboardingComplete: true
    });
  });

  test('falls back safely and updates one preference without losing the rest', () => {
    expect(normalizeCommunicationPreferences({ fontSize: 'huge' })).toEqual(
      DEFAULT_COMMUNICATION_PREFERENCES
    );
    expect(
      updateCommunicationPreferences(
        { highContrast: true, gridColumns: 2 },
        {
          speechRate: 0.8,
          speechVoice: 'v'.repeat(100),
          candidateAutoplayDelaySeconds: 7
        }
      )
    ).toEqual(
      expect.objectContaining({
        highContrast: true,
        gridColumns: 2,
        speechRate: 0.8,
        speechVoice: 'v'.repeat(80),
        candidateAutoplayDelaySeconds: 15,
        onlinePictogramSearchEnabled: true,
        pictogramSortMode: 'manual'
      })
    );
  });

  test('accepts only the caregiver autoplay choices including off', () => {
    expect(
      normalizeCommunicationPreferences({
        candidateAutoplayDelaySeconds: 0
      }).candidateAutoplayDelaySeconds
    ).toBe(0);
    expect(
      normalizeCommunicationPreferences({
        candidateAutoplayDelaySeconds: '5'
      }).candidateAutoplayDelaySeconds
    ).toBe(5);
  });

  test('accepts only fixed manual or popularity pictogram ordering', () => {
    expect(
      normalizeCommunicationPreferences({
        pictogramSortMode: 'popularity'
      }).pictogramSortMode
    ).toBe('popularity');
    expect(
      normalizeCommunicationPreferences({
        pictogramSortMode: 'recent'
      }).pictogramSortMode
    ).toBe('manual');
  });

  test('drops non-string speech voice values for safe legacy migration', () => {
    expect(
      normalizeCommunicationPreferences({ speechVoice: { id: 'verse' } })
        .speechVoice
    ).toBe('');
  });

  test('toggles a hidden board id deterministically', () => {
    const hidden = toggleCommunicationBoardVisibility({}, 'food');
    const visible = toggleCommunicationBoardVisibility(hidden, 'food');
    expect(hidden.hiddenBoardIds).toEqual(['food']);
    expect(visible.hiddenBoardIds).toEqual([]);
  });

  test('projects hidden boards and every navigation tile targeting them', () => {
    const boards = [
      {
        id: 'home',
        layout: {
          columns: 3,
          rows: 1,
          tileIds: ['yes', 'quick-link', 'food-link']
        },
        tiles: [
          { id: 'yes', label: '是' },
          { id: 'quick-link', label: '快速交流', loadBoardId: 'quick' },
          { id: 'food-link', label: '食物', loadBoard: { id: 'food' } }
        ]
      },
      { id: 'quick', tiles: [{ id: 'hello', label: '你好' }] },
      { id: 'food', tiles: [{ id: 'rice', label: '米饭' }] }
    ];

    const projected = projectVisibleCommunicationBoards(boards, ['quick']);

    expect(projected).toEqual([
      {
        ...boards[0],
        layout: {
          ...boards[0].layout,
          tileIds: ['yes', 'food-link']
        },
        tiles: [boards[0].tiles[0], boards[0].tiles[2]]
      },
      boards[2]
    ]);
    expect(boards[0].tiles).toHaveLength(3);
    expect(boards[0].layout.tileIds).toHaveLength(3);
    expect(projected[1]).toBe(boards[2]);
  });

  test('preserves references when no board or navigation target is hidden', () => {
    const boards = [{ id: 'home', tiles: [{ id: 'yes', label: '是' }] }];
    expect(projectVisibleCommunicationBoards(boards, ['unknown'])).toBe(boards);
    expect(projectVisibleCommunicationBoards(boards, [])).toBe(boards);
  });

  test('returns an empty projection when every board is hidden', () => {
    const boards = [{ id: 'home', tiles: [] }];
    expect(projectVisibleCommunicationBoards(boards, ['home'])).toEqual([]);
  });
});
