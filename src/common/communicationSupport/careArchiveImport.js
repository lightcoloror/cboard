import JSZip from 'jszip';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { fromByteArray } from 'base64-js';
import {
  normalizePictureLibraryArchiveManifest,
  restorePictureLibraryArchive
} from './pictureLibraryArchive';
import { applyPersonalImagePreferencesToBoards } from './personalImagePreferences';
import { readCareDeviceArchive } from './careDeviceArchive';
import {
  isEncryptedPrivateArchive,
  decryptPrivateArchive
} from './privateArchiveEncryption';

// Build an explicit, immutable import preview from the existing ZIP format.
// No HTTP fetch, source mutation, password collection or automatic upload.
export async function previewCareArchive(bytes, identity, passphrase) {
  if (bytes.byteLength > 20 * 1024 * 1024)
    throw new Error('备份文件超过20 MiB，请拆分图库后导入');
  if (isEncryptedPrivateArchive(bytes))
    bytes = await decryptPrivateArchive({ data: bytes, passphrase });
  const zip = await JSZip.loadAsync(bytes);
  const read = (entry, limit) =>
    new Promise((resolve, reject) => {
      if (!entry) {
        reject(new Error('备份缺少必要文件'));
        return;
      }
      let size = 0;
      const chunks = [];
      const stream = entry.internalStream('uint8array');
      stream.on('data', chunk => {
        size += chunk.length;
        if (size > limit) {
          stream.pause();
          reject(new Error('备份解压内容超出限制'));
        } else chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        const result = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(result);
      });
      stream.resume();
    });
  if (zip.file('care-device.json')) {
    const preview = await readCareDeviceArchive(zip, identity, read);
    return {
      ...preview,
      media: preview.media.map(({ bytes, ...asset }) => ({
        ...asset,
        data: fromByteArray(bytes)
      }))
    };
  }
  const manifestBytes = await read(zip.file('library.json'), 2 * 1024 * 1024);
  const manifest = normalizePictureLibraryArchiveManifest(
    JSON.parse(
      decodeURIComponent(
        escape(Array.from(manifestBytes, b => String.fromCharCode(b)).join(''))
      )
    )
  );
  const fingerprint = bytesToHex(sha256(bytes));
  const mappedId = value =>
    'import-' + bytesToHex(sha256(fingerprint + ':' + value)).slice(0, 40);
  const media = [],
    locations = {};
  let total = 0;
  for (const asset of manifest.assets) {
    if (!asset.path.startsWith('images/'))
      throw new Error(
        '此次迁移只接收图片图库；含录音或视频的备份请先拆分，原文件不会修改'
      );
    const data = await read(zip.file(asset.path), 4 * 1024 * 1024);
    total += data.byteLength;
    if (total > 20 * 1024 * 1024)
      throw new Error('图库图片合计超过20 MiB，请拆分后导入');
    const type =
      data[0] === 137
        ? 'image/png'
        : data[0] === 255
        ? 'image/jpeg'
        : String.fromCharCode(...data.slice(0, 4)) === 'RIFF'
        ? 'image/webp'
        : '';
    if (!type) throw new Error('图片格式不受支持，请先转换为PNG、JPEG或WebP');
    const digest = bytesToHex(sha256(data));
    if (asset.sha256 && asset.sha256 !== digest)
      throw new Error('备份图片校验失败，未导入');
    const mediaId = mappedId(asset.path);
    locations[asset.path] = mediaId;
    media.push({ mediaId, data: fromByteArray(data), type, sha256: digest });
  }
  const restored = restorePictureLibraryArchive({
    manifest,
    assetLocations: locations,
    identity: { patientId: identity.profileId, workspaceId: identity.familyId }
  });
  const resources = [],
    mapping = [];
  const mediaIds = new Set(media.map(m => m.mediaId));
  const boards = applyPersonalImagePreferencesToBoards(
    restored.boards,
    restored.personalImagePreferences,
    { patientId: identity.profileId, workspaceId: identity.familyId }
  );
  for (const board of boards) {
    const tileIds = [];
    for (const tile of board.tiles) {
      if (tile.image && !mediaIds.has(tile.image))
        throw new Error('备份包含未打包的图片，请使用完整图库备份');
      const id = mappedId(`${board.id}:${tile.id}`);
      tileIds.push(id);
      resources.push({
        kind: 'tile',
        resourceId: id,
        value: {
          label: tile.label || tile.vocalization || '图卡',
          ...(tile.image ? { mediaId: tile.image } : {}),
          pictogramAttribution: tile.pictogramAttribution || null
        }
      });
      mapping.push({
        sourceBoard: board.id,
        sourceTile: tile.id,
        targetTile: id
      });
    }
    resources.push({
      kind: 'board',
      resourceId: mappedId(board.id),
      value: { name: board.name, tileIds }
    });
  }
  if (!resources.length)
    throw new Error('备份中没有完整图板，请选择完整图库导出');
  return {
    fingerprint,
    media,
    resources,
    mapping,
    boardCount: restored.boards.length,
    tileCount: mapping.length,
    originalDataModified: false
  };
}
