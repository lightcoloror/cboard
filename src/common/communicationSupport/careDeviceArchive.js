import JSZip from 'jszip';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { toByteArray } from 'base64-js';

const validId = value =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const digest = value => bytesToHex(sha256(value));
const allowedKinds = [
  'board',
  'tile',
  'preference',
  'favorite',
  'personalFavorite'
];
function resource(value) {
  if (
    !value ||
    !allowedKinds.includes(value.kind) ||
    !validId(value.id) ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1
  )
    throw new Error('备份资源标识或版本无效');
  return {
    id: value.id,
    kind: value.kind,
    version: value.version,
    deleted: value.deleted === true,
    value: value.deleted ? null : value.value,
    seq: Number.isSafeInteger(value.seq) ? value.seq : 0,
    ...(value.source &&
    validId(value.source.owner) &&
    validId(value.source.id) &&
    Number.isSafeInteger(value.source.version)
      ? { source: value.source }
      : {})
  };
}
function originalUpdate(value) {
  if (
    !value ||
    !validId(value.operationId) ||
    !validId(value.sharedOperationId) ||
    !validId(value.sharedId) ||
    !Number.isSafeInteger(value.baseVersion) ||
    value.baseVersion < 0 ||
    !['put', 'delete'].includes(value.action)
  )
    throw new Error('备份原收藏待处理操作无效');
  return {
    operationId: value.operationId,
    sharedOperationId: value.sharedOperationId,
    sharedId: value.sharedId,
    action: value.action,
    baseVersion: value.baseVersion,
    ...(value.action === 'put' ? { value: value.value } : {}),
    ...(Number.isSafeInteger(value.sharedVersion) && value.sharedVersion > 0
      ? { sharedVersion: value.sharedVersion }
      : {}),
    ...(value.error
      ? { error: 'ORIGINAL_UPDATE_CONFLICT', current: value.current || null }
      : {})
  };
}
function operation(value) {
  if (
    !value ||
    !validId(value.operationId) ||
    !validId(value.resourceId) ||
    !allowedKinds.includes(value.kind) ||
    !['put', 'delete'].includes(value.action) ||
    !Number.isSafeInteger(value.baseVersion) ||
    value.baseVersion < 0
  )
    throw new Error('备份待同步操作无效');
  return {
    operationId: value.operationId,
    resourceId: value.resourceId,
    kind: value.kind,
    action: value.action,
    baseVersion: value.baseVersion,
    ...(value.action === 'put' ? { value: value.value } : {})
  };
}
export async function exportCareDeviceArchive(identity, snapshot) {
  if (
    !validId(identity.profileId) ||
    !validId(identity.familyId) ||
    snapshot.locked
  )
    throw new Error('无法导出当前档案');
  const zip = new JSZip();
  const assets = [];
  for (const entry of Object.values(snapshot.media || {})) {
    if (
      !validId(entry.mediaId) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(entry.type)
    )
      throw new Error('备份图片无效');
    const bytes = toByteArray(entry.data);
    if (digest(bytes) !== entry.sha256) throw new Error('本地图片校验失败');
    const path = `images/${entry.mediaId}`;
    zip.file(path, bytes);
    assets.push({
      mediaId: entry.mediaId,
      path,
      sha256: entry.sha256,
      type: entry.type,
      pending: entry.pending === true,
      visibility: entry.visibility === 'private' ? 'private' : 'family'
    });
  }
  const document = {
    format: 'tuyujia-care-device',
    version: 1,
    profileId: identity.profileId,
    familyId: identity.familyId,
    relationship: snapshot.relationship || null,
    resources: Object.values(snapshot.resources || {})
      .filter(r => !r.pending)
      .map(resource),
    queue: (snapshot.queue || []).map(operation),
    originalUpdates: (snapshot.originalUpdates || []).map(originalUpdate),
    conflicts: (snapshot.conflicts || []).map(c => ({
      operation: operation(c.operation),
      current: c.current ? resource(c.current) : null
    })),
    assets
  };
  const json = JSON.stringify(document);
  zip.file('care-device.json', json);
  zip.file(
    'care-device.sha256',
    digest(
      Uint8Array.from(unescape(encodeURIComponent(json)), c => c.charCodeAt(0))
    )
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
export async function readCareDeviceArchive(zip, identity, read) {
  const bytes = await read(zip.file('care-device.json'), 3 * 1024 * 1024);
  const checksum = await read(zip.file('care-device.sha256'), 128);
  const decode = data =>
    decodeURIComponent(
      escape(Array.from(data, b => String.fromCharCode(b)).join(''))
    );
  if (digest(bytes) !== decode(checksum)) throw new Error('备份内容校验失败');
  const doc = JSON.parse(decode(bytes));
  if (
    doc.format !== 'tuyujia-care-device' ||
    doc.version !== 1 ||
    !validId(doc.profileId) ||
    !validId(doc.familyId)
  )
    throw new Error('不支持此备份格式');
  if (
    identity &&
    (identity.profileId !== doc.profileId || identity.familyId !== doc.familyId)
  )
    throw new Error('此备份属于另一患者，不能覆盖当前档案');
  const resources = (doc.resources || []).map(resource),
    queue = (doc.queue || []).map(operation);
  const media = [];
  let total = bytes.length;
  for (const asset of doc.assets || []) {
    if (
      !validId(asset.mediaId) ||
      asset.path !== `images/${asset.mediaId}` ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(asset.type)
    )
      throw new Error('备份图片路径无效');
    const data = await read(zip.file(asset.path), 4 * 1024 * 1024);
    total += data.length;
    if (total > 20 * 1024 * 1024 || digest(data) !== asset.sha256)
      throw new Error('备份图片校验失败或超出容量');
    media.push({
      mediaId: asset.mediaId,
      type: asset.type,
      sha256: asset.sha256,
      bytes: data,
      pending: asset.pending === true,
      visibility: asset.visibility === 'private' ? 'private' : 'family'
    });
  }
  return {
    restore: true,
    profileId: doc.profileId,
    familyId: doc.familyId,
    resources,
    queue,
    originalUpdates: (doc.originalUpdates || []).map(originalUpdate),
    relationship:
      doc.relationship &&
      ['patient', 'relative', 'professional'].includes(doc.relationship.role)
        ? {
            role: doc.relationship.role,
            defaultMode:
              doc.relationship.defaultMode === 'receiver'
                ? 'receiver'
                : 'expression'
          }
        : null,
    conflicts: (doc.conflicts || []).map(c => ({
      operation: operation(c.operation),
      current: c.current ? resource(c.current) : null
    })),
    media,
    fingerprint: digest(bytes),
    boardCount: resources.filter(r => r.kind === 'board' && !r.deleted).length,
    tileCount: resources.filter(r => r.kind === 'tile' && !r.deleted).length,
    originalDataModified: false
  };
}
