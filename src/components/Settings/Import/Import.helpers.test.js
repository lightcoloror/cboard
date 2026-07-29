import JSZip from 'jszip';
import JSZipUtils from 'jszip-utils';
import API from '../../../api';
import {
  astericsGridImportAdapter,
  cboardImportAdapter,
  gridsetImportAdapter,
  isOpenBoardDocument,
  obfImportAdapter,
  obzImportAdapter,
  snapImportAdapter,
  touchChatImportAdapter,
  zipImportAdapter
} from './Import.helpers';
import {
  assertBoardDTO,
  createBoardDTO,
  getBoardDTOTilesInDisplayOrder
} from '../../../common/communicationSupport/dto';
import { createPictogramLibraryDTO } from '../../../common/communicationSupport/pictogramLibrary';

jest.mock('../../../api', () => ({
  convertCommunicationAacFile: jest.fn(),
  uploadFromDataURL: jest.fn()
}));
jest.mock('jszip-utils', () => ({
  getBinaryContent: jest.fn()
}));

function createObfFile(content) {
  const body = typeof content === 'string' ? content : JSON.stringify(content);
  return new File([body], 'communication-board.obf', {
    type: 'application/json'
  });
}

function createObzFile(content = 'archive') {
  return new File([content], 'communication-boards.obz', {
    type: 'application/zip'
  });
}

function createJsonFile(content) {
  return new File([JSON.stringify(content)], 'structured-library.json', {
    type: 'application/json'
  });
}

function createAstericsGridFile(content) {
  return new File([JSON.stringify(content)], 'family.grd', {
    type: 'application/json'
  });
}

async function createGridsetFile() {
  const zip = new JSZip();
  zip.file(
    'Grids/Home/grid.xml',
    `
      <Grid>
        <GridGuid>home-grid</GridGuid>
        <Name>主页</Name>
        <ColumnDefinitions>
          <ColumnDefinition />
          <ColumnDefinition />
        </ColumnDefinitions>
        <RowDefinitions><RowDefinition /></RowDefinitions>
        <AutoContentCommands />
        <Cells>
          <Cell X="0" Y="0">
            <Content>
              <Commands>
                <Command ID="Action.InsertText">
                  <Parameter Key="text"><r>我想喝水</r></Parameter>
                </Command>
              </Commands>
              <CaptionAndImage>
                <Caption>喝水</Caption>
                <Image>drink.png</Image>
              </CaptionAndImage>
              <Style>
                <BackColour>#112233FF</BackColour>
                <BorderColour>#445566FF</BorderColour>
              </Style>
            </Content>
          </Cell>
          <Cell X="1" Y="0">
            <Content>
              <Commands>
                <Command ID="Action.InsertText">
                  <Parameter Key="text"><r>需要帮助</r></Parameter>
                </Command>
              </Commands>
              <CaptionAndImage><Caption>帮助</Caption></CaptionAndImage>
            </Content>
          </Cell>
        </Cells>
      </Grid>
    `
  );
  zip.file(
    'Grids/Home/drink.png',
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  return new File(
    [await zip.generateAsync({ type: 'uint8array' })],
    'family.gridset',
    { type: 'application/zip' }
  );
}

describe('Open Board import compatibility', () => {
  beforeEach(() => {
    JSZipUtils.getBinaryContent.mockReset();
    API.uploadFromDataURL.mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:open-board-test')
    });
  });

  test('preserves communication metadata and fixed order through BoardDTO', async () => {
    const openBoard = {
      format: 'open-board-0.1',
      id: 'daily-needs',
      name: '日常需求',
      locale: 'zh-CN',
      buttons: [
        {
          id: 'water',
          label: '水',
          vocalization: '请给我水',
          image_id: 'water-image',
          sound_id: 'water-sound',
          background_color: '#d9f2ff',
          ext_cboard_communication_synonyms: '饮用水,白开水',
          ext_cboard_communication_related_terms: '杯子,饮料'
        },
        {
          id: 'want',
          label: '想'
        }
      ],
      images: [
        {
          id: 'water-image',
          url: 'https://cdn.example.test/water.svg'
        }
      ],
      sounds: [
        {
          id: 'water-sound',
          url: 'https://cdn.example.test/water.mp3',
          content_type: 'audio/mpeg'
        }
      ],
      grid: {
        rows: 1,
        columns: 2,
        order: [['want', 'water']]
      }
    };

    const [importedBoard] = await obfImportAdapter(
      createObfFile(openBoard),
      {},
      []
    );
    const boardDTO = createBoardDTO(importedBoard);
    const water = boardDTO.tiles.find(tile => tile.id === 'water');

    expect(importedBoard.locale).toBe('zh-CN');
    expect(assertBoardDTO(boardDTO)).toBe(boardDTO);
    expect(boardDTO).toEqual(
      expect.objectContaining({
        id: 'daily-needs',
        name: '日常需求'
      })
    );
    expect(
      getBoardDTOTilesInDisplayOrder(boardDTO).map(tile => tile.id)
    ).toEqual(['want', 'water']);
    expect(water).toEqual(
      expect.objectContaining({
        vocalization: '请给我水',
        image: 'https://cdn.example.test/water.svg',
        sound: 'https://cdn.example.test/water.mp3',
        backgroundColor: '#d9f2ff'
      })
    );
    expect(water.communication.synonyms).toEqual(['饮用水', '白开水']);
    expect(water.communication.relatedTerms).toEqual(['杯子', '饮料']);
  });

  test('imports a structured pictogram library through the existing review path', async () => {
    const library = createPictogramLibraryDTO([
      {
        id: 'daily-needs',
        name: '日常需求',
        columns: 1,
        tiles: [
          {
            id: 'water',
            label: '水',
            image: '/symbols/water.svg',
            communicationSynonyms: ['饮用水'],
            communicationCategory: 'drink'
          }
        ]
      }
    ]);
    const importedBoards = await cboardImportAdapter(
      createJsonFile(library),
      {},
      []
    );

    expect(importedBoards).toHaveLength(1);
    expect(importedBoards[0]).toEqual(
      expect.objectContaining({
        id: 'daily-needs',
        isFixed: true,
        grid: {
          rows: 1,
          columns: 1,
          order: [['water']]
        }
      })
    );
    expect(importedBoards[0].tiles[0]).toEqual(
      expect.objectContaining({
        label: '水',
        image: '/symbols/water.svg',
        communicationSynonyms: ['饮用水'],
        communicationCategory: 'drink'
      })
    );
    expect(importedBoards.importDiagnostics).toEqual(
      expect.objectContaining({
        structuredLibrary: true,
        boardCount: 1,
        boardItemCount: 1,
        conceptCount: 1,
        symbolAssetCount: 1
      })
    );
  });

  test('validates native CBoard JSON without dropping CBoard fields', async () => {
    const board = {
      id: 'daily-needs',
      name: '日常需求',
      description: '保留原生字段',
      tiles: [
        {
          id: 'water',
          label: '水',
          customProperty: 'preserved'
        }
      ]
    };

    const importedBoards = await cboardImportAdapter(
      createJsonFile([board]),
      {},
      []
    );

    expect(importedBoards).toHaveLength(1);
    expect(importedBoards[0]).toEqual(
      expect.objectContaining({
        id: 'daily-needs',
        name: '日常需求',
        description: '保留原生字段'
      })
    );
    expect(importedBoards[0].tiles[0]).toEqual(
      expect.objectContaining({
        id: 'water',
        label: '水',
        customProperty: 'preserved'
      })
    );
  });

  test('skips native CBoard boards with malformed or duplicate tiles', async () => {
    const importedBoards = await cboardImportAdapter(
      createJsonFile([
        {
          id: 'valid',
          name: '有效板面',
          tiles: [{ id: 'water', label: '水' }]
        },
        {
          id: 'null-tile',
          name: '空图卡',
          tiles: [null]
        },
        {
          id: 'duplicate-tiles',
          name: '重复图卡',
          tiles: [{ id: 'same', label: '甲' }, { id: 'same', label: '乙' }]
        },
        {
          id: 'missing-label',
          name: '缺少标签',
          tiles: [{ id: 'unknown' }]
        }
      ]),
      {},
      []
    );

    expect(importedBoards.map(board => board.id)).toEqual(['valid']);
    expect(importedBoards.importDiagnostics).toEqual(
      expect.objectContaining({
        skippedMalformedBoardCount: 3
      })
    );
  });

  test('repairs native CBoard fixed-grid references through BoardDTO', async () => {
    const importedBoards = await cboardImportAdapter(
      createJsonFile([
        {
          id: 'fixed-daily',
          name: '固定板面',
          isFixed: true,
          grid: {
            rows: 1,
            columns: 2,
            order: [['missing', 'water', 'water']]
          },
          tiles: [{ id: 'water', label: '水' }, { id: 'food', label: '饭' }]
        }
      ]),
      {},
      []
    );

    expect(importedBoards[0].grid).toEqual({
      rows: 1,
      columns: 2,
      order: [['water', 'food']]
    });
  });

  test('skips duplicate board ids inside one native CBoard export', async () => {
    const importedBoards = await cboardImportAdapter(
      createJsonFile([
        {
          id: 'daily',
          name: '日常一',
          tiles: [{ id: 'water', label: '水' }]
        },
        {
          id: 'daily',
          name: '日常二',
          tiles: [{ id: 'food', label: '饭' }]
        }
      ]),
      {},
      []
    );

    expect(importedBoards.map(board => board.name)).toEqual(['日常一']);
    expect(importedBoards.importDiagnostics.skippedMalformedBoardCount).toBe(1);
  });

  test('rejects malformed JSON instead of creating an empty board', async () => {
    await expect(
      obfImportAdapter(createObfFile('{"format":'), {}, [])
    ).rejects.toThrow('Invalid or unsupported Open Board document');
  });

  test('rejects objects that are not supported Open Board documents', async () => {
    const unsupported = {
      format: 'open-board-0.2',
      buttons: [],
      grid: {
        rows: 1,
        columns: 1,
        order: [[]]
      }
    };

    expect(isOpenBoardDocument(unsupported)).toBe(false);
    await expect(
      obfImportAdapter(createObfFile(unsupported), {}, [])
    ).rejects.toThrow('Invalid or unsupported Open Board document');
  });

  test('imports AsTeRICS Grid through the existing reviewable board pipeline', async () => {
    const imported = await astericsGridImportAdapter(
      createAstericsGridFile({
        metadata: { homeGridId: 'home' },
        grids: [
          {
            id: 'home',
            label: { en: 'Home', zh: '首页' },
            rowCount: 1,
            minColumnCount: 2,
            gridElements: [
              {
                id: 'water',
                x: 0,
                y: 0,
                label: { en: 'Water', zh: '喝水' },
                actions: [
                  {
                    modelName: 'GridActionSpeakCustom',
                    speakText: { en: 'Drink water', zh: '我要喝水' }
                  }
                ]
              },
              {
                id: 'more',
                x: 1,
                y: 0,
                label: { en: 'More', zh: '更多' },
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
      }),
      { locale: 'zh-CN' },
      [],
      { deferMediaUpload: true, includeConflicts: true }
    );

    expect(imported).toHaveLength(2);
    expect(imported[0]).toEqual(
      expect.objectContaining({
        name: '首页',
        grid: expect.objectContaining({ rows: 1, columns: 2 })
      })
    );
    expect(imported[0].tiles[0]).toEqual(
      expect.objectContaining({
        label: '喝水',
        vocalization: '我要喝水'
      })
    );
    expect(imported[0].tiles[1].loadBoard).toBe(imported[1].id);
    expect(imported[1].tiles[0].label).toBe('厕所');
  });

  test('imports Gridset through the existing reviewable board pipeline', async () => {
    const imported = await gridsetImportAdapter(
      await createGridsetFile(),
      { locale: 'zh-CN' },
      [],
      { deferMediaUpload: true, includeConflicts: true }
    );

    expect(imported).toHaveLength(1);
    expect(imported[0]).toEqual(
      expect.objectContaining({
        name: '主页',
        grid: expect.objectContaining({ rows: 1, columns: 2 })
      })
    );
    expect(imported[0].tiles[0]).toEqual(
      expect.objectContaining({
        label: '喝水',
        vocalization: '我想喝水',
        image: expect.stringMatching(/^data:image\/png;base64,/)
      })
    );
    expect(imported[0].tiles[1]).toEqual(
      expect.objectContaining({
        label: '帮助',
        vocalization: '需要帮助'
      })
    );
  });

  test.each([
    ['Snap', snapImportAdapter, 'snap', 'patient.sps'],
    ['TouchChat', touchChatImportAdapter, 'touchchat', 'patient.ce']
  ])(
    'imports %s through the server and existing review pipeline',
    async (label, adapter, format, fileName) => {
      API.convertCommunicationAacFile.mockResolvedValueOnce({
        format: 'picinterpreter-aac-conversion',
        contractVersion: 1,
        sourceFormat: format,
        warnings:
          format === 'touchchat' ? ['Custom images are unavailable'] : [],
        documents: [
          {
            path: 'boards/home.obf',
            board: {
              format: 'open-board-0.1',
              id: `${format}-home`,
              name: `${label} 首页`,
              buttons: [{ id: 'water', label: '喝水' }],
              images: [],
              sounds: [],
              grid: { rows: 1, columns: 1, order: [['water']] }
            }
          }
        ]
      });
      const file = new File(['aac'], fileName, {
        type: 'application/octet-stream'
      });

      const imported = await adapter(file, { locale: 'zh-CN' }, [], {
        deferMediaUpload: true,
        includeConflicts: true
      });

      expect(API.convertCommunicationAacFile).toHaveBeenCalledWith(
        file,
        format,
        'zh-CN'
      );
      expect(imported).toHaveLength(1);
      expect(imported[0]).toEqual(
        expect.objectContaining({ id: `${format}-home`, name: `${label} 首页` })
      );
      expect(imported.importDiagnostics).toEqual(
        expect.objectContaining({
          sourceFormat: format,
          aacWarnings:
            format === 'touchchat' ? ['Custom images are unavailable'] : []
        })
      );
    }
  );

  test('imports valid OBZ boards while skipping malformed board entries', async () => {
    const archive = new JSZip();
    archive.file('sounds/water.mp3', 'ID3');
    archive.file(
      'boards/daily-needs.obf',
      JSON.stringify({
        format: 'open-board-0.1',
        id: 'daily-needs',
        name: '日常需求',
        buttons: [
          {
            id: 'water',
            label: '水',
            sound_id: 'water-sound'
          }
        ],
        sounds: [
          {
            id: 'water-sound',
            path: 'sounds/water.mp3',
            content_type: 'audio/mpeg'
          }
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['water']]
        }
      })
    );
    archive.file('boards/malformed.obf', '{"format":');
    archive.file(
      'boards/unsupported.obf',
      JSON.stringify({
        format: 'open-board-0.2',
        buttons: []
      })
    );
    const archiveBytes = await archive.generateAsync({ type: 'uint8array' });
    JSZipUtils.getBinaryContent.mockImplementation((url, callback) =>
      callback(null, archiveBytes)
    );

    const importedBoards = await obzImportAdapter(createObzFile(), {}, []);

    expect(importedBoards).toHaveLength(1);
    expect(importedBoards.importDiagnostics).toEqual({
      skippedMalformedBoardCount: 2,
      skippedUnsupportedBoardCount: 0,
      conflictBoardCount: 0
    });
    expect(importedBoards[0]).toEqual(
      expect.objectContaining({
        id: 'daily-needs',
        name: '日常需求'
      })
    );
    expect(importedBoards[0].tiles[0].sound).toBe(
      'data:audio/mpeg;base64,SUQz'
    );
    expect(createBoardDTO(importedBoards[0]).layout.tileIds).toEqual(['water']);
  });

  test('keeps conflicting OBF media local while preparing a review', async () => {
    const openBoard = {
      format: 'open-board-0.1',
      id: 'daily-needs',
      name: '日常需求',
      buttons: [
        {
          id: 'water',
          label: '水',
          image_id: 'water-image'
        }
      ],
      images: [
        {
          id: 'water-image',
          data: 'data:image/png;base64,aW1hZ2U='
        }
      ]
    };

    const importedBoards = await obfImportAdapter(
      createObfFile(openBoard),
      {},
      [{ id: 'daily-needs', tiles: [] }],
      { includeConflicts: true, deferMediaUpload: true }
    );

    expect(importedBoards).toHaveLength(1);
    expect(importedBoards.importDiagnostics.conflictBoardCount).toBe(1);
    expect(importedBoards[0].tiles[0].image).toBe(
      'data:image/png;base64,aW1hZ2U='
    );
    expect(API.uploadFromDataURL).not.toHaveBeenCalled();
  });

  test('keeps generic ZIP compatibility by falling back to the OBZ importer', async () => {
    const archive = new JSZip();
    archive.file(
      'boards/daily-needs.obf',
      JSON.stringify({
        format: 'open-board-0.1',
        id: 'daily-needs',
        name: '日常需求',
        buttons: [{ id: 'water', label: '水' }],
        grid: {
          rows: 1,
          columns: 1,
          order: [['water']]
        }
      })
    );
    const archiveBytes = await archive.generateAsync({
      type: 'uint8array'
    });
    JSZipUtils.getBinaryContent.mockImplementation((url, callback) =>
      callback(null, archiveBytes)
    );

    const importedBoards = await zipImportAdapter(
      createObzFile(archiveBytes),
      {},
      []
    );

    expect(importedBoards).toHaveLength(1);
    expect(importedBoards[0]).toEqual(
      expect.objectContaining({
        id: 'daily-needs',
        name: '日常需求'
      })
    );
  });
});
