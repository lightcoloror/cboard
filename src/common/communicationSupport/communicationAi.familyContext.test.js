import { applyCommunicationAiResegmentation } from './communicationAi';

const boards = [
  {
    id: 'core',
    name: '核心',
    tiles: [
      {
        id: 'help',
        label: '帮帮我',
        image: '/help.png',
        communicationSynonyms: '帮我,帮助,求助',
        communicationCategory: 'emergency'
      },
      { id: 'water', label: '水', image: '/water.png' }
    ]
  },
  {
    id: 'people',
    name: 'people',
    tiles: [
      { id: 'daughter', label: '女儿', image: '/daughter.png' },
      { id: 'father', label: '爸爸', image: '/father.png' },
      { id: 'custom-person', label: '小岚', image: '/person.png' }
    ]
  }
];

function apply(tokens, missingTokenRecords) {
  return applyCommunicationAiResegmentation({
    text: tokens.join(''),
    response: { tokens },
    boards,
    currentReviewItems: [],
    missingTokenRecords
  });
}

test.each([
  ['请', '帮我', '的', '女儿', '找一下', '眼镜'],
  ['请帮我', '爸爸', '拿', '水'],
  ['帮帮我', '小岚', '拿', '水']
])(
  'AI segmentation does not turn family help into help-me: %j',
  (...tokens) => {
    const result = apply(tokens);
    expect(result.applied).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.reviewItems.map(item => item.token).join('')).toBe(
      tokens.join('')
    );
    const help = result.reviewItems.find(item => /帮.*我/.test(item.token));
    expect(help.tile).toBeNull();
    expect(help.matchType).toBe('none');
  }
);

test('old resolved-image memory cannot restore a help-me image in a family request', () => {
  const tokens = ['帮我', '的', '女儿'];
  const result = apply(tokens, [
    {
      normalizedToken: '帮我',
      status: 'resolved',
      resolvedPictogramId: 'help',
      reviewedByCaregiver: true
    }
  ]);
  expect(result.reviewItems[0].tile).toBeNull();
  expect(result.reviewItems.map(item => item.token).join('')).toBe(
    tokens.join('')
  );
});

test.each([['帮我'], ['帮我', '拿', '水'], ['帮我', '，', '爸爸']])(
  'standalone help-me remains available: %j',
  (...tokens) => {
    const result = apply(tokens);
    expect(result.reviewItems[0].tile.id).toBe('help');
    expect(result.requiresConfirmation).toBe(true);
  }
);
