import { createCareBuiltinImages } from './careBuiltinImages';
import {
  encodeCareMedia,
  decodeCareMedia,
  careMediaIds
} from './careMediaValues';
import { queueCareBoards, projectCareBoards } from './careProjection';
import { createBoardDTO } from './dto';
import { exportCareDeviceArchive } from './careDeviceArchive';
import { previewCareArchive } from './careArchiveImport';

const boards = image => [
  createBoardDTO({
    id: 'root',
    name: '日常',
    tiles: [{ id: 'water', label: '喝水', image }]
  })
];
const web = createCareBuiltinImages(boards('/symbols/water.svg'));
const mini = createCareBuiltinImages(
  boards('/assets/cboard-default/water.png')
);
const reference = web.reference('/symbols/water.svg');
const privateAsset = {
  mediaId: 'private',
  type: 'image/png',
  data: 'private-bytes',
  sha256: 'hash'
};
const read = async source =>
  web.reference(source)
    ? { builtinImage: web.reference(source) }
    : privateAsset;

test('favorite public symbols resolve on another client without uploading media or accepting a URL', async () => {
  const engine = { view: () => ({ media: {} }), addMedia: jest.fn() };
  const encoded = await encodeCareMedia(
    { sentence: '喝水', output: [{ image: '/symbols/water.svg' }] },
    engine,
    read
  );
  expect(encoded.output[0]).toEqual({ builtinImage: reference });
  expect(engine.addMedia).not.toHaveBeenCalled();
  expect(careMediaIds(encoded)).toEqual([]);
  const decoded = decodeCareMedia(encoded, {}, asset =>
    mini.resolve(asset.builtinImage)
  );
  expect(decoded.output[0].image).toBe('/assets/cboard-default/water.png');
  expect(
    mini.resolve({ ...reference, tileId: 'https://untrusted.invalid/a.png' })
  ).toBe('');
  expect(mini.resolve({ ...reference, catalog: 'unknown' })).toBe('');
  expect(web.reference('https://untrusted.invalid/a.png')).toBeNull();
});

test('replacing a decoded builtin image with private media and back removes the stale reference', async () => {
  const media = { private: privateAsset };
  const engine = { view: () => ({ media }), addMedia: jest.fn() };
  for (const value of [
    { builtinImage: reference, image: 'data:image/png;base64,private' },
    { image: 'data:image/png;base64,private', builtinImage: reference }
  ]) {
    expect(await encodeCareMedia(value, engine, read)).toEqual({
      mediaId: 'private'
    });
  }
  expect(
    await encodeCareMedia(
      { image: '/symbols/water.svg', mediaId: 'private' },
      engine,
      read
    )
  ).toEqual({ builtinImage: reference });
});

test('an explicitly edited board keeps public references without creating a media upload', async () => {
  const snapshot = { resources: {}, media: {}, locked: false };
  const engine = {
    view: () => snapshot,
    addMedia: jest.fn(),
    edit: jest.fn(async (kind, id, value) => {
      snapshot.resources[`${kind}:${id}`] = { kind, id, value };
    })
  };
  await queueCareBoards(engine, boards('/symbols/water.svg'), read);
  expect(engine.addMedia).not.toHaveBeenCalled();
  expect(snapshot.resources['tile:water'].value.builtinImage).toEqual(
    reference
  );
  expect(
    projectCareBoards(snapshot, asset => mini.resolve(asset.builtinImage))[0]
      .tiles[0].image
  ).toBe('/assets/cboard-default/water.png');
  snapshot.resources['board:root'].deleted = true;
  expect(projectCareBoards(snapshot)).toEqual([]);
});

test('same-patient device archive preserves public references without private media assets', async () => {
  const identity = { familyId: 'family', profileId: 'patient' };
  const value = { sentence: '喝水', output: [{ builtinImage: reference }] };
  const bytes = await exportCareDeviceArchive(identity, {
    resources: {
      'favorite:saved': { kind: 'favorite', id: 'saved', version: 1, value }
    },
    media: {}
  });
  const restored = await previewCareArchive(bytes, identity);
  expect(restored.resources[0].value).toEqual(value);
  expect(restored.media).toEqual([]);
  expect(
    decodeCareMedia(restored.resources[0].value, {}, asset =>
      mini.resolve(asset.builtinImage)
    ).output[0].image
  ).toBe('/assets/cboard-default/water.png');
});
