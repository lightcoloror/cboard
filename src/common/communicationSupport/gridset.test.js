import JSZip from 'jszip';

import { createJsZipArchiveAdapter } from './adapters/jsZipArchive';
import {
  convertGridsetToOpenBoardDocuments,
  GRIDSET_FILE_EXTENSION
} from './gridset';

const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
);

function gridXml({
  id,
  name,
  caption,
  message,
  image,
  background = '#112233FF',
  border = '#445566FF'
}) {
  return `
    <Grid>
      <GridGuid>${id}</GridGuid>
      <Name>${name}</Name>
      <ColumnDefinitions><ColumnDefinition /><ColumnDefinition /></ColumnDefinitions>
      <RowDefinitions><RowDefinition /></RowDefinitions>
      <AutoContentCommands />
      <Cells>
        <Cell X="0" Y="0">
          <Content>
            <Commands>
              <Command ID="Action.InsertText">
                <Parameter Key="text"><r>${message}</r></Parameter>
              </Command>
            </Commands>
            <CaptionAndImage>
              <Caption>${caption}</Caption>
              ${image ? `<Image>${image}</Image>` : ''}
            </CaptionAndImage>
            <Style>
              <BackColour>${background}</BackColour>
              <BorderColour>${border}</BorderColour>
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
  `;
}

async function createGridsetFixture() {
  const zip = new JSZip();
  zip.file(
    'Grids/Home/grid.xml',
    gridXml({
      id: 'home-grid',
      name: '主页',
      caption: '喝水',
      message: '我想喝水',
      image: 'drink.png'
    })
  );
  zip.file('Grids/Home/drink.png', ONE_PIXEL_PNG);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('Gridset import adapter', () => {
  test('converts a real Gridset ZIP through the vendored processor', async () => {
    const documents = await convertGridsetToOpenBoardDocuments({
      data: await createGridsetFixture(),
      fileName: 'care.gridset',
      locale: 'zh-CN',
      zipAdapter: createJsZipArchiveAdapter
    });

    expect(GRIDSET_FILE_EXTENSION).toBe('gridset');
    expect(documents).toHaveLength(1);
    expect(documents[0].path).toBe('boards/care-1-home-grid.obf');
    expect(documents[0].board).toMatchObject({
      format: 'open-board-0.1',
      id: 'home-grid',
      locale: 'zh-CN',
      name: '主页',
      grid: {
        rows: 1,
        columns: 2
      }
    });
    expect(documents[0].board.grid.order).toEqual([
      ['home-grid_btn_0', 'home-grid_btn_1']
    ]);
    expect(documents[0].board.buttons[0]).toMatchObject({
      id: 'home-grid_btn_0',
      label: '喝水',
      vocalization: '我想喝水',
      background_color: '#112233',
      border_color: '#445566',
      image_id: 'gridset-image-1'
    });
    expect(documents[0].board.images[0].url).toMatch(
      /^data:image\/png;base64,/
    );
  });

  test('rejects encrypted and malformed inputs before importing', async () => {
    await expect(
      convertGridsetToOpenBoardDocuments({
        data: new Uint8Array([1]),
        fileName: 'private.gridsetx',
        zipAdapter: createJsZipArchiveAdapter
      })
    ).rejects.toThrow('Encrypted Gridset files are not supported');
    await expect(
      convertGridsetToOpenBoardDocuments({
        data: new Uint8Array(),
        fileName: 'empty.gridset',
        zipAdapter: createJsZipArchiveAdapter
      })
    ).rejects.toThrow('Gridset archive has an invalid size');

    await expect(
      convertGridsetToOpenBoardDocuments({
        data: await createGridsetFixture(),
        fileName: 'missing-adapter.gridset'
      })
    ).rejects.toThrow('Gridset import requires a ZIP adapter');
  });
});
