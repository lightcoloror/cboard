import { convertAstericsGridToOpenBoardDocuments } from './astericsGrid';

function createFixture() {
  return {
    metadata: {
      homeGridId: 'home'
    },
    grids: [
      {
        id: 'home',
        label: { en: 'Home', zh: '首页' },
        rowCount: 2,
        minColumnCount: 2,
        gridElements: [
          {
            id: 'water',
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            label: { en: 'Water', zh: '喝水' },
            image: {
              data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
              author: '家庭提供'
            },
            actions: [
              {
                modelName: 'GridActionSpeakCustom',
                speakText: { en: 'Drink water', zh: '我要喝水' }
              }
            ]
          },
          {
            id: 'needs',
            x: 1,
            y: 0,
            width: 1,
            height: 1,
            label: { en: 'Needs', zh: '需要' },
            image: {
              url: 'https://example.org/needs.png',
              author: 'Example',
              license: 'CC BY 4.0'
            },
            actions: [
              {
                modelName: 'GridActionNavigate',
                toGridId: 'details'
              }
            ]
          }
        ]
      },
      {
        id: 'details',
        label: { en: 'Details', zh: '更多需要' },
        rowCount: 1,
        minColumnCount: 1,
        gridElements: [
          {
            id: 'toilet',
            x: 0,
            y: 0,
            label: { en: 'Toilet', zh: '厕所' },
            actions: [{ modelName: 'GridActionSpeak' }]
          }
        ]
      }
    ]
  };
}

describe('AsTeRICS Grid import compatibility', () => {
  test('reuses AACTools processors and emits reviewable Open Board documents', async () => {
    const documents = await convertAstericsGridToOpenBoardDocuments({
      text: `\uFEFF${JSON.stringify(createFixture())}`,
      fileName: 'family.grd',
      locale: 'zh-CN'
    });

    expect(documents).toHaveLength(2);
    expect(documents[0].board).toEqual(
      expect.objectContaining({
        format: 'open-board-0.1',
        id: 'home',
        name: '首页',
        locale: 'zh-CN',
        grid: expect.objectContaining({
          rows: 2,
          columns: 2
        })
      })
    );
    expect(documents[0].board.buttons[0]).toEqual(
      expect.objectContaining({
        id: 'water',
        label: '喝水',
        vocalization: '我要喝水',
        image_id: 'asterics-image-water'
      })
    );
    expect(documents[0].board.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'asterics-image-water',
          data: expect.stringContaining('data:image/png;base64,')
        }),
        expect.objectContaining({
          id: 'asterics-image-needs',
          url: 'https://example.org/needs.png',
          license: 'CC BY 4.0'
        })
      ])
    );
    expect(documents[0].board.buttons[1].load_board).toEqual({
      path: documents[1].path
    });
    expect(documents[1].board.buttons[0].label).toBe('厕所');
  });

  test('rejects malformed and empty grid documents', async () => {
    await expect(
      convertAstericsGridToOpenBoardDocuments({ text: '{"grids":[]}' })
    ).rejects.toThrow('invalid grid count');
    await expect(
      convertAstericsGridToOpenBoardDocuments({ text: '{"grids":' })
    ).rejects.toThrow('Invalid AsTeRICS Grid JSON');
  });
});
