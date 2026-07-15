import {
  EXPRESSION_PIPELINE_CONTRACT_VERSION,
  buildExpressionHistoryEntry,
  buildExpressionLoopState,
  buildExpressionLoopStateFromSavedPhrase,
  buildExpressionOutputSignature,
  buildExpressionSavedPhraseEntry,
  createExpressionPipelineInput,
  getSelectedExpressionSentence,
  runExpressionPipeline,
  selectExpressionCandidate
} from './expressionPipeline';

function createOutput() {
  return [
    { id: 'want', label: '想', image: '/want.png' },
    { id: 'water', label: '水', image: '/water.png' }
  ];
}

describe('expressionPipeline', () => {
  test('builds candidates from an immutable output snapshot', () => {
    const output = createOutput();
    const state = buildExpressionLoopState(output, 3);

    output[0].label = '已改变';

    expect(state.outputSnapshot.map(item => item.label)).toEqual(['想', '水']);
    expect(state.candidateSentences).toEqual([
      '想水。',
      '我想水。',
      '请想水。'
    ]);
    expect(state.outputSignature).toBe(
      buildExpressionOutputSignature([
        { id: 'want', label: '想' },
        { id: 'water', label: '水' }
      ])
    );
    expect(state.contractVersion).toBe(EXPRESSION_PIPELINE_CONTRACT_VERSION);
  });

  test('does not create a placeholder candidate for an empty output', () => {
    expect(buildExpressionLoopState([])).toEqual({
      contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
      outputSignature: '[]',
      outputSnapshot: [],
      candidateSentences: [],
      selectedIndex: 0
    });
  });

  test('uses the selected candidate for saved phrases and confirmed history', () => {
    const state = selectExpressionCandidate(
      buildExpressionLoopState(createOutput()),
      2
    );

    expect(getSelectedExpressionSentence(state)).toBe('请想水。');
    expect(buildExpressionSavedPhraseEntry(state)).toEqual({
      contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
      sentence: '请想水。',
      output: [
        { id: 'want', label: '想', image: '/want.png' },
        { id: 'water', label: '水', image: '/water.png' }
      ]
    });
    expect(buildExpressionHistoryEntry(state)).toEqual({
      contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
      direction: 'express',
      sentence: '请想水。',
      labels: ['想', '水'],
      output: [
        { id: 'want', label: '想', image: '/want.png' },
        { id: 'water', label: '水', image: '/water.png' }
      ],
      candidateSentences: state.candidateSentences
    });
  });

  test('keeps a saved custom sentence as the selected candidate', () => {
    const state = buildExpressionLoopStateFromSavedPhrase({
      contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
      sentence: '请帮我喝一点水。',
      output: createOutput()
    });

    expect(state.candidateSentences[0]).toBe('请帮我喝一点水。');
    expect(state.candidateSentences).toContain('想水。');
    expect(getSelectedExpressionSentence(state)).toBe('请帮我喝一点水。');
  });

  test('normalizes an invalid candidate count while restoring a saved phrase', () => {
    const state = buildExpressionLoopStateFromSavedPhrase(
      {
        sentence: '请帮我喝一点水。',
        output: createOutput()
      },
      0
    );

    expect(state.candidateSentences[0]).toBe('请帮我喝一点水。');
    expect(state.candidateSentences).toHaveLength(4);
  });

  test('falls back to the first candidate for an invalid selection', () => {
    const state = selectExpressionCandidate(
      buildExpressionLoopState(createOutput()),
      99
    );

    expect(state.selectedIndex).toBe(0);
    expect(getSelectedExpressionSentence(state)).toBe('想水。');
  });

  test('exposes a versioned input contract for cross-platform callers', () => {
    const input = createExpressionPipelineInput(createOutput(), 3);
    const state = runExpressionPipeline(input);

    expect(input).toEqual(
      expect.objectContaining({
        contractVersion: EXPRESSION_PIPELINE_CONTRACT_VERSION,
        candidateCount: 3
      })
    );
    expect(state.candidateSentences).toHaveLength(3);
    expect(() =>
      runExpressionPipeline({ contractVersion: 2, output: createOutput() })
    ).toThrow('Unsupported expression pipeline version');
  });
});
