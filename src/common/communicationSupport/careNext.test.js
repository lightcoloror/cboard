import JSZip from 'jszip';
import { createCareSync } from './careSync';
import { exportCareDeviceArchive } from './careDeviceArchive';
import { previewCareArchive } from './careArchiveImport';
import { createScopedCommunicationStorage } from './scopedCommunicationStorage';
import {
  normalizeCommunicationHistory,
  buildCommunicationSupportCloudSettings,
  mergeCommunicationSupportSettings
} from './storage';
import { buildConfirmedReceiverSyncPayload } from './receiverSync';
import { encryptPrivateArchive } from './privateArchiveEncryption';
import { normalizeCommunicationSavedPhrases } from './storage';

function client(request, disk = {}) {
  let serial = 0;
  return createCareSync({
    accountId: 'account',
    familyId: 'family',
    profileId: 'patient',
    currentAccount: () => 'account',
    newId: () => `op-${++serial}`,
    request,
    storage: {
      get: async k => disk[k],
      set: async (k, v) => {
        disk[k] = v;
      }
    }
  });
}
const tile = {
  kind: 'tile',
  id: 'water',
  version: 1,
  seq: 1,
  deleted: false,
  value: { label: '喝水' }
};
const board = {
  kind: 'board',
  id: 'daily',
  version: 1,
  seq: 1,
  deleted: false,
  value: { name: '日常', tileIds: ['water'] }
};
const snapshot = {
  familyId: 'family',
  cursor: 1,
  resources: [tile, board],
  permissions: ['read', 'library.edit']
};

it('retains denied favorite edits across restart without blocking or retrying unrelated edits', async () => {
  const disk = {};
  const shared = {
    kind: 'favorite',
    id: 'shared',
    version: 1,
    seq: 1,
    value: { sentence: '共享原文' }
  };
  const writes = [];
  const request = async (path, method, body) => {
    if (method === 'GET') return { ...snapshot, resources: [shared, tile] };
    writes.push(body);
    if (body.kind === 'favorite')
      throw Object.assign(new Error('forbidden'), {
        status: 403,
        data: { code: 'FAVORITE_ADMIN_REQUIRED' }
      });
    return { resource: { ...tile, version: 2, value: body.value } };
  };
  const first = client(request, disk);
  await first.init();
  await first.sync();
  await first.edit('favorite', 'shared', { sentence: '保留待处理修改' });
  await first.edit('tile', 'water', { label: '合法图库编辑' });
  await first.sync();
  expect(writes).toHaveLength(2);
  expect(first.view().queue).toHaveLength(0);
  expect(first.view().conflicts).toEqual([
    expect.objectContaining({
      reason: 'FAVORITE_ADMIN_REQUIRED',
      current: shared,
      operation: expect.objectContaining({
        value: { sentence: '保留待处理修改' }
      })
    })
  ]);
  const restarted = client(request, disk);
  await restarted.init();
  await restarted.sync();
  expect(writes).toHaveLength(2);
  expect(restarted.view().conflicts).toHaveLength(1);
  expect(restarted.view().locked).toBe(false);
});

it('still stops all writes and locks the profile when access is revoked during upload', async () => {
  const writes = [];
  const request = async (path, method, body) => {
    if (method === 'GET') return snapshot;
    writes.push(body);
    throw Object.assign(new Error('revoked'), {
      status: 403,
      data: { code: 'PROFILE_ACCESS_DENIED' }
    });
  };
  const engine = client(request);
  await engine.init();
  await engine.sync();
  await engine.edit('favorite', 'new', { sentence: '待同步' });
  await engine.edit('tile', 'water', { label: '不应提交' });
  await expect(engine.sync()).rejects.toMatchObject({ status: 403 });
  expect(writes).toHaveLength(1);
  expect(engine.view().locked).toBe(true);
});

it('retains the optional original-update intent across a crash and reports its partial failure separately', async () => {
  const disk = {};
  let failOriginal = true;
  const shared = {
    kind: 'favorite',
    id: 'shared',
    version: 1,
    seq: 1,
    value: { sentence: '旧内容' },
    source: { owner: 'member', id: 'original', version: 1 }
  };
  const request = async (path, method, body) => {
    if (method === 'GET')
      return { ...snapshot, owner: true, resources: [shared] };
    if (path.endsWith('/favorite-original')) {
      if (failOriginal)
        throw Object.assign(new Error('original changed'), {
          status: 409,
          data: { current: { version: 2, value: { sentence: '成员修改' } } }
        });
      return { resource: { id: 'original', version: 3 } };
    }
    return { resource: { ...shared, version: 2, value: body.value } };
  };
  const before = client(request, disk);
  await before.init();
  await before.sync();
  await before.edit('favorite', 'shared', { sentence: '家庭修改' }, 'put', {
    updateOriginal: true
  });
  const after = client(request, disk);
  await after.init();
  await after.sync();
  expect(after.view().queue).toHaveLength(0);
  expect(after.view().originalUpdates[0].error).toBe(
    'ORIGINAL_UPDATE_CONFLICT'
  );
  failOriginal = false;
  await after.resolveOriginal(
    after.view().originalUpdates[0].operationId,
    'local'
  );
  await after.sync();
  expect(after.view().originalUpdates).toHaveLength(0);
});

it('restores a password-encrypted archive on a blank offline device and keeps favorites beyond history retention', async () => {
  const original = client(async () => snapshot);
  await original.init();
  await original.sync();
  const bytes = await exportCareDeviceArchive(
    { profileId: 'patient', familyId: 'family' },
    original.archive()
  );
  const encrypted = await encryptPrivateArchive({
    data: bytes,
    passphrase: 'synthetic-password-2026',
    randomBytes: length => new Uint8Array(length).fill(7)
  });
  const preview = await previewCareArchive(
    encrypted,
    null,
    'synthetic-password-2026'
  );
  const offline = client(async () => {
    throw Object.assign(new Error('offline'), { status: 401 });
  });
  await offline.init();
  await offline.importPreview(preview);
  await expect(offline.sync()).rejects.toThrow('offline');
  expect(offline.view().resources['tile:water'].value.label).toBe('喝水');
  expect(offline.view().permissions).toEqual([]);
  expect(
    normalizeCommunicationSavedPhrases(
      Array.from({ length: 151 }, (_, i) => ({
        id: `saved-${i}`,
        sentence: `收藏${i}`,
        createdAt: i + 1
      }))
    )
  ).toHaveLength(151);
});

it('keeps the latest fifty completed records and sends no history through either old upload route', () => {
  const history = Array.from({ length: 51 }, (_, i) => ({
    id: `h${i}`,
    sentence: `合成表达${i}`,
    direction: 'express',
    createdAt: i + 1
  }));
  const favorite = { id: 'favorite', sentence: '长期收藏', createdAt: 1 };
  expect(
    normalizeCommunicationHistory([
      ...history,
      { id: 'draft', sentence: '草稿', recordStatus: 'draft', createdAt: 999 }
    ])
  ).toHaveLength(50);
  const payload = buildCommunicationSupportCloudSettings([favorite], history);
  expect(payload.history).toEqual([]);
  expect(payload.savedPhrases[0].sentence).toBe('长期收藏');
  expect(buildConfirmedReceiverSyncPayload(history)).toEqual([]);
  expect(
    mergeCommunicationSupportSettings({ history: [] }, { history }).history
  ).toEqual([]);
});

it('never reads another account or the guest fallback after an account switch', () => {
  const disk = { history: 'guest' };
  let accountId = 'A';
  const scoped = createScopedCommunicationStorage(
    {
      getItem: k => disk[k],
      setItem: (k, v) => {
        disk[k] = v;
      },
      removeItem: k => {
        delete disk[k];
      }
    },
    () => ({ accountId, familyId: 'family', profileId: 'patient' })
  );
  expect(scoped.getItem('history')).toBeUndefined();
  scoped.setItem('history', 'A-only');
  accountId = 'B';
  expect(scoped.getItem('history')).toBeUndefined();
  scoped.setItem('history', 'B-only');
  accountId = 'A';
  expect(scoped.getItem('history')).toBe('A-only');
  expect(disk.history).toBe('guest');
});

it('retains offline edits in the download grace period and distinguishes login, expiry and revocation', async () => {
  let response = snapshot,
    error = null;
  const calls = [];
  const engine = client(async (_, method) => {
    calls.push(method);
    if (error) throw error;
    return response;
  });
  await engine.init();
  await engine.sync();
  await engine.edit('tile', 'water', { label: '本地修改' });
  response = {
    ...snapshot,
    entitlements: { syncWrite: false, download: true }
  };
  calls.length = 0;
  await engine.sync();
  expect(calls).toEqual(['GET']);
  expect(engine.view().queue).toHaveLength(1);
  for (const e of [
    { status: 401 },
    { status: 403, data: { code: 'SUBSCRIPTION_EXPIRED' } },
    { status: 429, data: { code: 'AI_QUOTA_EXCEEDED' } }
  ]) {
    error = e;
    await expect(engine.sync()).rejects.toBe(e);
    expect(engine.view().locked).toBe(false);
  }
  error = { status: 403, data: { code: 'PROFILE_ACCESS_DENIED' } };
  await expect(engine.sync()).rejects.toBe(error);
  expect(engine.view().locked).toBe(true);
  expect(engine.view().resources).toEqual({});
});

it('restores stable IDs and pending operations offline without restoring authorization or duplicating tiles', async () => {
  const first = client(async () => snapshot);
  await first.init();
  await first.sync();
  await first.edit('tile', 'water', { label: '备份中的离线修改' });
  const bytes = await exportCareDeviceArchive(
    { familyId: 'family', profileId: 'patient', token: 'do-not-export' },
    first.archive()
  );
  const zip = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(
    await zip.file('care-device.json').async('string')
  );
  expect(manifest.token).toBeUndefined();
  expect(manifest.permissions).toBeUndefined();
  expect(manifest.resources[0].id).toBe('water');
  const preview = await previewCareArchive(bytes, {
    familyId: 'family',
    profileId: 'patient'
  });
  const restored = client(async () => {
    throw new Error('offline');
  });
  await restored.init();
  await restored.importPreview(preview);
  await restored.importPreview(preview);
  expect(restored.view().permissions).toEqual([]);
  expect(restored.view().queue).toHaveLength(1);
  expect(restored.view().resources['tile:water'].value.label).toBe(
    '备份中的离线修改'
  );
  await expect(
    previewCareArchive(bytes, { familyId: 'family', profileId: 'someone-else' })
  ).rejects.toThrow('另一患者');
  zip.file(
    'care-device.json',
    JSON.stringify({ ...manifest, profileId: 'tampered' })
  );
  await expect(
    previewCareArchive(await zip.generateAsync({ type: 'uint8array' }), null)
  ).rejects.toThrow('校验');
});
