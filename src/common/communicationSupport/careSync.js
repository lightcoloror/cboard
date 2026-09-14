/* Shared Web/WeChat collaboration engine. Storage contains patient data: never log it. */
import { careMediaIds } from './careMediaValues.js';
const copy = value => JSON.parse(JSON.stringify(value));
const resourceKey = r => `${r.kind}:${r.id || r.resourceId}`;
const storageQueues = new WeakMap();

export function createCareSync({
  accountId,
  familyId,
  profileId,
  storage,
  request,
  newId,
  currentAccount,
  personalFavorites = false,
  changed = () => {}
}) {
  const key = `care-v1:${accountId}:${familyId}:${profileId}`;
  let state = {
    cursor: -1,
    resources: {},
    queue: [],
    conflicts: [],
    media: {},
    permissions: [],
    locked: false
  };
  if (!storageQueues.has(storage)) storageQueues.set(storage, new Map());
  const queues = storageQueues.get(storage);
  const serial = fn => {
    const run = async () => {
      checkAccount();
      const raw = await storage.get(key);
      if (raw) state = JSON.parse(raw);
      return fn();
    };
    const job = (queues.get(key) || Promise.resolve()).then(() =>
      storage.exclusive ? storage.exclusive(key, run) : run()
    );
    queues.set(key, job.catch(() => {}));
    return job;
  };
  const checkAccount = () => {
    if (currentAccount() !== accountId) {
      const e = new Error('账号已切换，请重新打开档案');
      e.status = 401;
      throw e;
    }
  };
  async function persist(next) {
    checkAccount();
    await storage.set(key, JSON.stringify(next));
    state = next;
    changed();
  }
  function checkEdit(kind) {
    checkAccount();
    const p = ['favorite', 'personalFavorite'].includes(kind)
      ? 'read'
      : kind === 'preference'
      ? 'preferences.edit'
      : 'library.edit';
    if (state.locked || (!state.localArchive && !state.permissions.includes(p)))
      throw new Error('当前档案未授予编辑权限');
  }
  function visible() {
    checkAccount();
    if (state.locked)
      return {
        ...copy(state),
        resources: {},
        media: {},
        queue: [],
        conflicts: []
      };
    const result = copy(state);
    for (const op of result.queue)
      result.resources[resourceKey(op)] = {
        id: op.resourceId,
        kind: op.kind,
        value: op.value,
        deleted: op.action === 'delete',
        version: op.baseVersion + 1,
        pending: true
      };
    return result;
  }
  const api = `/care/profiles/${encodeURIComponent(profileId)}`;
  return {
    newMediaId: newId,
    view: visible,
    archive: () => {
      checkAccount();
      if (state.locked) throw new Error('该档案访问已撤销');
      return copy(state);
    },
    importPreview: preview =>
      serial(async () => {
        if (preview.restore) {
          checkAccount();
          if (
            preview.profileId !== profileId ||
            preview.familyId !== familyId ||
            state.locked
          )
            throw new Error('无法恢复到当前档案');
          const next = copy(state);
          for (const r of preview.resources) {
            const k = resourceKey(r);
            if (!next.resources[k]) next.resources[k] = r;
          }
          next.archiveResources = {
            ...(next.archiveResources || {}),
            ...Object.fromEntries(
              preview.resources.map(r => [resourceKey(r), r])
            )
          };
          for (const op of preview.queue) {
            if (!next.queue.some(q => q.operationId === op.operationId))
              next.queue.push(op);
          }
          next.originalUpdates = next.originalUpdates || [];
          for (const job of preview.originalUpdates || [])
            if (
              !next.originalUpdates.some(
                item => item.operationId === job.operationId
              )
            )
              next.originalUpdates.push(job);
          for (const c of preview.conflicts) {
            if (
              !next.conflicts.some(
                v => v.operation.operationId === c.operation.operationId
              )
            )
              next.conflicts.push(c);
          }
          for (const asset of preview.media)
            if (!next.media[asset.mediaId]) next.media[asset.mediaId] = asset;
          next.localArchive = true;
          next.relationship = preview.relationship || next.relationship;
          next.cursor = -1;
          await persist(next);
          return;
        }
        checkEdit('tile');
        const next = copy(state);
        for (const asset of preview.media) {
          if (!next.media[asset.mediaId])
            next.media[asset.mediaId] = { ...asset, pending: true };
        }
        for (const resource of preview.resources) {
          const k = `${resource.kind}:${resource.resourceId}`;
          if (next.resources[k] || next.queue.some(op => resourceKey(op) === k))
            continue;
          next.queue.push({
            ...resource,
            operationId: await newId(),
            action: 'put',
            baseVersion: 0
          });
        }
        next.migrations = {
          ...(next.migrations || {}),
          [preview.fingerprint]: { mapping: preview.mapping, at: Date.now() }
        };
        await persist(next);
      }),
    init: () =>
      serial(async () => {
        checkAccount();
        const raw = await storage.get(key);
        if (raw) {
          const loaded = JSON.parse(raw);
          state = loaded;
        }
        changed();
        return visible();
      }),
    edit: (kind, resourceId, value, action = 'put', options = {}) =>
      serial(async () => {
        checkEdit(kind);
        const next = copy(state);
        const k = `${kind}:${resourceId}`;
        if (next.conflicts.some(c => resourceKey(c.operation) === k))
          throw new Error('请先处理此内容的同步冲突');
        const current = visible().resources[k];
        if (current && current.deleted)
          throw new Error('已删除内容不能恢复，请新建图卡');
        const operationId = await newId();
        if (options.updateOriginal) {
          if (!state.owner || kind !== 'favorite' || !current?.source)
            throw new Error('仅家庭管理员可更新关联原收藏');
          next.originalUpdates = [
            ...(next.originalUpdates || []),
            {
              sharedOperationId: operationId,
              operationId: await newId(),
              action,
              sharedId: resourceId,
              baseVersion: current.source.version,
              ...(action === 'put' ? { value } : {})
            }
          ];
        }
        next.queue.push({
          operationId,
          kind,
          resourceId,
          action,
          baseVersion: current ? current.version : 0,
          ...(action === 'put' ? { value } : {})
        });
        await persist(next);
      }),
    resolveOriginal: (operationId, choice) =>
      serial(async () => {
        checkEdit('favorite');
        const next = copy(state);
        const job = (next.originalUpdates || []).find(
          item => item.operationId === operationId
        );
        if (!job) return;
        if (choice === 'server')
          next.originalUpdates = next.originalUpdates.filter(
            item => item !== job
          );
        else if (choice === 'local' && job.current && !job.current.deleted) {
          job.baseVersion = job.current.version;
          job.operationId = await newId();
          delete job.error;
          delete job.current;
        } else
          throw new Error('原收藏已删除或共享版本已变化，请核对后重新编辑');
        await persist(next);
      }),
    addMedia: media =>
      serial(async () => {
        checkEdit('favorite');
        const next = copy(state);
        next.media[media.mediaId] = { ...media, pending: true };
        await persist(next);
      }),
    resolve: (operationId, choice) =>
      serial(async () => {
        const conflict = state.conflicts.find(
          c => c.operation.operationId === operationId
        );
        if (!conflict) return;
        checkEdit(conflict.operation.kind);
        const next = copy(state);
        const k = resourceKey(conflict.operation);
        if (choice === 'local' && conflict.current && conflict.current.deleted)
          throw new Error('云端已删除，请另建图卡');
        if (!['local', 'server'].includes(choice))
          throw new Error('请选择保留哪一版');
        next.conflicts = next.conflicts.filter(
          c => c.operation.operationId !== operationId
        );
        // Later edits of this same resource depend on the conflicting base.
        const dependents = next.queue.filter(op => resourceKey(op) === k);
        next.queue = next.queue.filter(op => resourceKey(op) !== k);
        if (choice === 'local') {
          const latest =
            dependents[dependents.length - 1] || conflict.operation;
          next.queue.push({
            ...latest,
            operationId: await newId(),
            baseVersion: conflict.current ? conflict.current.version : 0
          });
        }
        await persist(next);
      }),
    sync: () =>
      serial(async () => {
        checkAccount();
        try {
          // Every delta response includes current grants. A restored server can
          // invalidate a cursor; recover once with a full snapshot, retaining edits.
          let full = state.cursor < 0;
          let snapshot;
          try {
            snapshot = await request(
              full ? api : `${api}?since=${state.cursor}`,
              'GET'
            );
          } catch (e) {
            if (e.status !== 400 || e.data?.code !== 'INVALID_CURSOR') throw e;
            full = true;
            snapshot = await request(api, 'GET');
          }
          checkAccount();
          if (snapshot.familyId !== familyId) throw new Error('档案空间不匹配');
          let next = copy(state);
          next.permissions = snapshot.permissions;
          next.owner = snapshot.owner === true;
          next.localArchive = false;
          next.locked = false;
          next.status = 'ready';
          next.entitlements = snapshot.entitlements || null;
          next.relationship = snapshot.relationship || null;
          next.cursor = snapshot.cursor;
          if (full) next.resources = {};
          if (full && next.archiveResources)
            next.resources = { ...next.archiveResources };
          snapshot.resources.forEach(r => {
            next.resources[resourceKey(r)] = r;
          });
          await persist(next);
          if (personalFavorites) {
            const own = await request(`${api}/favorites`, 'GET');
            checkAccount();
            next = copy(state);
            for (const r of own.items || [])
              next.resources[`personalFavorite:${r.id}`] = {
                ...r,
                kind: 'personalFavorite'
              };
            await persist(next);
          }
          const canUpload = !next.entitlements || next.entitlements.syncWrite;
          for (const [mediaId, asset] of Object.entries(state.media)) {
            if (!canUpload) break;
            if (!asset.pending) continue;
            checkEdit('favorite');
            await request(`${api}/media`, 'POST', asset);
            checkAccount();
            next = copy(state);
            next.media[mediaId].pending = false;
            await persist(next);
          }
          const blocked = new Set(
            state.conflicts.map(c => resourceKey(c.operation))
          );
          for (const op of [...state.queue]) {
            if (!canUpload) break;
            if (blocked.has(resourceKey(op))) continue;
            checkEdit(op.kind);
            let result;
            try {
              result = await request(
                op.kind === 'personalFavorite'
                  ? `${api}/favorites`
                  : `${api}/commands`,
                'POST',
                op
              );
              if (result.resource && op.kind === 'personalFavorite')
                result.resource.kind = 'personalFavorite';
            } catch (error) {
              if (error.status === 409 && error.data && error.data.conflict)
                result = error.data;
              else if (
                [400, 413].includes(error.status) ||
                (error.status === 403 &&
                  error.data?.code === 'FAVORITE_ADMIN_REQUIRED')
              ) {
                result = {
                  conflict: true,
                  current: state.resources[resourceKey(op)] || null,
                  reason: error.data?.code || 'INVALID_OPERATION'
                };
              } else throw error;
            }
            checkAccount();
            next = copy(state);
            next.queue = next.queue.filter(
              q => q.operationId !== op.operationId
            );
            if (result.conflict) {
              next.conflicts.push({
                operation: op,
                current: result.current,
                reason: result.reason
              });
              blocked.add(resourceKey(op));
            } else if (result.resource) {
              for (const job of next.originalUpdates || [])
                if (job.sharedOperationId === op.operationId)
                  job.sharedVersion = result.resource.version;
              const key = resourceKey(result.resource);
              if (
                !next.resources[key] ||
                next.resources[key].version <= result.resource.version
              )
                next.resources[key] = result.resource;
            }
            await persist(next);
          }
          for (const job of [...(state.originalUpdates || [])]) {
            if (!canUpload) break;
            if (!job.sharedVersion || job.error) continue;
            checkEdit('favorite');
            try {
              const result = await request(
                `${api}/favorite-original`,
                'POST',
                job
              );
              if (result.conflict)
                throw Object.assign(new Error('FAVORITE_CONFLICT'), {
                  status: 409,
                  data: result
                });
              next = copy(state);
              next.originalUpdates = next.originalUpdates.filter(
                v => v.operationId !== job.operationId
              );
            } catch (error) {
              if (
                ![400, 403, 404, 409].includes(error.status) ||
                error.data?.code === 'PROFILE_ACCESS_DENIED'
              )
                throw error;
              next = copy(state);
              const pending = next.originalUpdates.find(
                v => v.operationId === job.operationId
              );
              pending.error = error.data?.code || 'ORIGINAL_UPDATE_CONFLICT';
              pending.current = error.data?.current || null;
            }
            await persist(next);
          }
          // Download authorized assets for offline use; never use permanent public URLs.
          const mediaIds = new Set(
            Object.values(state.resources)
              .filter(r => !r.deleted)
              .flatMap(r => careMediaIds(r.value))
          );
          for (const mediaId of mediaIds) {
            if (!mediaId || state.media[mediaId]) continue;
            const asset = await request(
              `${api}/media/${encodeURIComponent(mediaId)}`,
              'GET'
            );
            checkAccount();
            next = copy(state);
            next.media[mediaId] = { ...asset, mediaId, pending: false };
            await persist(next);
          }
          return visible();
        } catch (error) {
          if (currentAccount() === accountId) {
            const code = error.data?.code || error.code;
            if (error.status === 401) {
              await persist({ ...copy(state), status: 'login_required' });
            } else if (
              ['SUBSCRIPTION_EXPIRED', 'DOWNLOAD_PERIOD_ENDED'].includes(code)
            ) {
              await persist({
                ...copy(state),
                status: code,
                entitlements: {
                  ...(state.entitlements || {}),
                  syncWrite: false
                }
              });
            } else if (
              error.status === 403 &&
              code === 'PROFILE_ACCESS_DENIED'
            ) {
              await persist({
                ...copy(state),
                locked: true,
                status: 'access_revoked'
              });
            }
          }
          throw error;
        }
      })
  };
}
