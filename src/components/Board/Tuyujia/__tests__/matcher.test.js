import {
  buildTileCatalog,
  createOutputFromMatches,
  matchTextToTiles
} from '../matcher';

const boards = [
  {
    id: 'home',
    name: '首页',
    tiles: [
      {
        id: 'want',
        label: '想',
        image: '/want.png'
      },
      {
        id: 'water',
        label: '水',
        image: '/water.png'
      },
      {
        id: 'toilet',
        label: '厕所',
        image: '/toilet.png'
      },
      {
        id: 'pain',
        label: '痛',
        image: '/pain.png'
      },
      {
        id: 'happy',
        label: '开心',
        image: '/happy.png'
      },
      {
        id: 'folder',
        label: '医疗',
        loadBoard: 'medical'
      }
    ]
  },
  {
    id: 'medical',
    name: '医疗',
    tiles: [
      {
        id: 'rest',
        label: '休息',
        image: '/rest.png',
        communicationSynonyms: '歇歇,休息一下'
      }
    ]
  }
];

const intl = {
  messages: {
    'cboard.symbol.water': '水',
    'cboard.board.quickChat': '快速表达'
  },
  formatMessage: ({ id }) => {
    return intl.messages[id] || id;
  }
};

describe('tuyujia matcher', () => {
  test('buildTileCatalog excludes folder tiles', () => {
    const catalog = buildTileCatalog(boards);
    expect(catalog.map(item => item.id)).not.toContain('folder');
  });

  test('buildTileCatalog resolves cboard default labelKey and boardNameKey', () => {
    const catalog = buildTileCatalog(
      [
        {
          id: 'quick-chat',
          nameKey: 'cboard.board.quickChat',
          tiles: [
            {
              id: 'water-keyed',
              labelKey: 'cboard.symbol.water',
              image: '/water.png'
            }
          ]
        }
      ],
      intl
    );

    expect(catalog[0].labels).toContain('水');
    expect(catalog[0].boardName).toBe('快速表达');
  });

  test('matches lexicon synonym to board tile label', () => {
    const result = matchTextToTiles('我要喝水', boards, { intl });
    const matchedLabels = result.matches
      .filter(item => item.tile)
      .map(item => item.tile.tile.label);

    expect(matchedLabels).toContain('想');
    expect(matchedLabels).toContain('水');
    expect(
      result.matches.some(
        item =>
          item.tile &&
          item.tile.tile.label === '想' &&
          item.matchType === 'lexicon-synonym'
      )
    ).toBe(true);
  });

  test('supports safe partial matching for longer symptom tokens', () => {
    const result = matchTextToTiles('我肚子疼', boards, { intl });
    const painMatch = result.matches.find(
      item => item.tile && item.tile.tile.label === '痛'
    );
    expect(painMatch).toBeTruthy();
  });

  test('does not partial match negated tokens', () => {
    const result = matchTextToTiles('我不开心', boards, { intl });
    expect(
      result.matches.some(item => item.tile && item.tile.tile.label === '开心')
    ).toBe(false);
  });

  test('createOutputFromMatches maps cboard output payload', () => {
    const result = matchTextToTiles('我要喝水', boards, { intl });
    const output = createOutputFromMatches(result.matches);
    expect(output[0]).toEqual(
      expect.objectContaining({
        id: 'want',
        label: '想'
      })
    );
    expect(output[1]).toEqual(
      expect.objectContaining({
        id: 'water',
        label: '水'
      })
    );
  });
});
