import JSZip from 'jszip';
import { getCboardOpenBoardExtensions } from './openBoardExtensions';
import { boardToOBF, openboardExportManyAdapter } from './Export.helpers';

jest.mock('pdfmake/build/pdfmake', () => ({ vfs: {} }));
jest.mock('../../../vfs_fonts', () => ({ pdfMake: { vfs: {} } }));
jest.mock('../../../store', () => ({ getStore: jest.fn() }));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

describe('Open Board communication metadata export', () => {
  test('exports neutral matching and curation fields as CBoard extensions', () => {
    const result = getCboardOpenBoardExtensions({
      communicationSynonyms: '大夫',
      communicationRelatedTerms: '医院,护士',
      communicationExcludeTokens: '博士',
      communicationCategory: 'medical'
    });

    expect(result).toEqual({
      ext_cboard_communication_synonyms: '大夫',
      ext_cboard_communication_related_terms: '医院,护士',
      ext_cboard_communication_exclude_tokens: '博士',
      ext_cboard_communication_category: 'medical'
    });
  });

  test('exports personalized tile recordings through standard OBF sound fields', async () => {
    const board = {
      id: 'daily-needs',
      name: '日常需求',
      isFixed: true,
      grid: {
        rows: 1,
        columns: 1,
        order: [['water']]
      },
      tiles: [
        {
          id: 'water',
          label: '喝水',
          sound: 'data:audio/mpeg;base64,SUQz'
        }
      ]
    };
    const intl = {
      locale: 'zh-CN',
      formatMessage: ({ id }) => id
    };

    const embedded = await boardToOBF({ [board.id]: board }, board, intl, {
      embed: true
    });
    const archived = await boardToOBF({ [board.id]: board }, board, intl, {
      embed: false
    });
    const embeddedSound = embedded.obf.sounds[0];
    const archivedSound = archived.obf.sounds[0];
    const archivedBinary = Object.values(archived.sounds)[0];

    expect(embedded.obf.buttons[0].sound_id).toBe(embeddedSound.id);
    expect(embeddedSound).toEqual(
      expect.objectContaining({
        data: 'data:audio/mpeg;base64,SUQz',
        content_type: 'audio/mpeg'
      })
    );
    expect(embeddedSound.path).toBeUndefined();
    expect(archived.obf.buttons[0].sound_id).toBe(archivedSound.id);
    expect(archivedSound.path).toMatch(/^sounds\/sound_.+\.mp3$/);
    expect(archivedBinary.path).toBe(archivedSound.path);
    expect(archivedBinary.ab.byteLength).toBe(3);
  });

  test('packages recording bytes and manifest sound paths in an OBZ archive', async () => {
    const board = {
      id: 'daily-needs',
      name: '日常需求',
      tiles: [
        {
          id: 'water',
          label: '喝水',
          sound: 'data:audio/mpeg;base64,SUQz'
        }
      ]
    };
    const content = await openboardExportManyAdapter([board], {
      locale: 'zh-CN',
      formatMessage: ({ id }) => id
    });
    const archive = await JSZip.loadAsync(content);
    const manifest = JSON.parse(
      await archive.file('manifest.json').async('text')
    );
    const boardDocument = JSON.parse(
      await archive.file('boards/daily-needs.obf').async('text')
    );
    const sound = boardDocument.sounds[0];

    expect(boardDocument.buttons[0].sound_id).toBe(sound.id);
    expect(manifest.paths.sounds[sound.id]).toBe(sound.path);
    expect(await archive.file(sound.path).async('text')).toBe('ID3');
  });
});
