import JSZip from 'jszip';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { toByteArray } from 'base64-js';
import { exportCareDeviceArchive } from './careDeviceArchive';
import { previewCareArchive } from './careArchiveImport';

const identity = { profileId: 'patient', familyId: 'family' };
const item = {
  kind: 'tile',
  id: 'water',
  version: 1,
  value: { label: '水', mediaId: 'image' }
};
const op = {
  operationId: 'operation',
  resourceId: 'water',
  kind: 'tile',
  action: 'put',
  baseVersion: 1,
  value: item.value
};
const image = {
  mediaId: 'image',
  type: 'image/png',
  data:
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
};
image.sha256 = bytesToHex(sha256(toByteArray(image.data)));

test.each([
  { resources: { 'tile:water': item } },
  { queue: [op] },
  { conflicts: [{ operation: op, current: item }] },
  {
    originalUpdates: [
      {
        operationId: 'original',
        sharedOperationId: 'shared-operation',
        sharedId: 'shared',
        baseVersion: 0,
        action: 'put',
        value: item.value
      }
    ]
  }
])(
  'rejects export when referenced media is not available locally: %j',
  async snapshot => {
    await expect(exportCareDeviceArchive(identity, snapshot)).rejects.toThrow(
      '缺少引用的图片'
    );
  }
);

test('complete media survives export/import, but an omitted media entry is rejected even with a valid manifest checksum', async () => {
  const bytes = await exportCareDeviceArchive(identity, {
    resources: { 'tile:water': item },
    media: { image }
  });
  const preview = await previewCareArchive(bytes, identity);
  expect(preview.resources[0].id).toBe('water');
  expect(preview.media[0].data).toBe(image.data);
  const zip = await JSZip.loadAsync(bytes);
  const doc = JSON.parse(await zip.file('care-device.json').async('string'));
  doc.assets = [];
  const changed = JSON.stringify(doc);
  zip.file('care-device.json', changed);
  zip.file(
    'care-device.sha256',
    bytesToHex(sha256(new TextEncoder().encode(changed)))
  );
  await expect(
    previewCareArchive(
      await zip.generateAsync({ type: 'uint8array' }),
      identity
    )
  ).rejects.toThrow('缺少引用的图片');
});
