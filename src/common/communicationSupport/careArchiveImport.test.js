import JSZip from 'jszip';
import {
  createPictureLibraryArchivePlan,
  PICTURE_LIBRARY_ARCHIVE_SCOPES
} from './pictureLibraryArchive';
import { previewCareArchive } from './careArchiveImport';
import { createCareSync } from './careSync';

it('previews an existing library ZIP and queues a non-destructive, repeatable patient import', async () => {
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const plan = createPictureLibraryArchivePlan({
    scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
    boards: [
      {
        id: 'old-board',
        name: '饮食',
        tiles: [
          { id: 'water', label: '喝水', image: `data:image/png;base64,${png}` }
        ]
      }
    ]
  });
  const original = JSON.stringify(plan.manifest);
  const zip = new JSZip();
  zip.file('library.json', original);
  for (const asset of plan.manifest.assets)
    zip.file(asset.path, png, { base64: true });
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const preview = await previewCareArchive(bytes, {
    profileId: 'patient',
    familyId: 'family'
  });
  expect(preview.tileCount).toBe(1);
  expect(preview.media).toHaveLength(1);
  expect(preview.resources[0].value.mediaId).toBe(preview.media[0].mediaId);
  expect(preview.mapping[0].sourceTile).toBe('water');
  expect(JSON.stringify(plan.manifest)).toBe(original);
  let stored = null,
    id = 0;
  const engine = createCareSync({
    accountId: 'owner',
    familyId: 'family',
    profileId: 'patient',
    storage: {
      get: async () => stored,
      set: async (_, v) => {
        stored = v;
      }
    },
    newId: () => `id${++id}`,
    currentAccount: () => 'owner',
    request: async () => ({
      familyId: 'family',
      cursor: 0,
      resources: [],
      permissions: ['read', 'library.edit']
    })
  });
  await engine.init();
  await engine.sync();
  await engine.importPreview(preview);
  await engine.importPreview(preview);
  expect(engine.view().queue).toHaveLength(2);
  expect(Object.keys(JSON.parse(stored).migrations)).toEqual([
    preview.fingerprint
  ]);
});

it('rejects an incomplete archive before it can enqueue a partial migration', async () => {
  const zip = new JSZip();
  zip.file('other.txt', 'synthetic');
  await expect(
    previewCareArchive(await zip.generateAsync({ type: 'uint8array' }), {})
  ).rejects.toThrow('缺少');
});
