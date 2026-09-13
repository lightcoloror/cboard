/* Shared Web/WeChat collaboration engine. Storage contains patient data: never log it. */
const copy = value => JSON.parse(JSON.stringify(value));
const resourceKey = r => `${r.kind}:${r.id || r.resourceId}`;

export function createCareSync({
  accountId,
  familyId,
  profileId,
  storage,
  request,
  newId,
  currentAccount,
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
  let tail = Promise.resolve();
  const serial = fn => {
    const job = tail.then(fn);
    tail = job.catch(() => {});
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
    const p = kind === 'preference' ? 'preferences.edit' : 'library.edit';
    if (state.locked || !state.permissions.includes(p))
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
    view: visible,
    importPreview: preview =>
      serial(async () => {
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
    edit: (kind, resourceId, value, action = 'put') =>
      serial(async () => {
        checkEdit(kind);
        const next = copy(state);
        const k = `${kind}:${resourceId}`;
        if (next.conflicts.some(c => resourceKey(c.operation) === k))
          throw new Error('请先处理此内容的同步冲突');
        const current = visible().resources[k];
        if (current && current.deleted)
          throw new Error('已删除内容不能恢复，请新建图卡');
        next.queue.push({
          operationId: await newId(),
          kind,
          resourceId,
          action,
          baseVersion: current ? current.version : 0,
          ...(action === 'put' ? { value } : {})
        });
        await persist(next);
      }),
    addMedia: media =>
      serial(async () => {
        checkEdit('tile');
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
          next.locked = false;
          next.cursor = snapshot.cursor;
          if (full) next.resources = {};
          snapshot.resources.forEach(r => {
            next.resources[resourceKey(r)] = r;
          });
          await persist(next);
          for (const [mediaId, asset] of Object.entries(state.media)) {
            if (!asset.pending) continue;
            checkEdit('tile');
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
            if (blocked.has(resourceKey(op))) continue;
            checkEdit(op.kind);
            let result;
            try {
              result = await request(`${api}/commands`, 'POST', op);
            } catch (error) {
              if (error.status === 409 && error.data && error.data.conflict)
                result = error.data;
              else if ([400, 413].includes(error.status)) {
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
              const key = resourceKey(result.resource);
              if (
                !next.resources[key] ||
                next.resources[key].version <= result.resource.version
              )
                next.resources[key] = result.resource;
            }
            await persist(next);
          }
          // Download authorized assets for offline use; never use permanent public URLs.
          for (const r of Object.values(state.resources)) {
            const mediaId = !r.deleted && r.value && r.value.mediaId;
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
          if (
            (error.status === 401 || error.status === 403) &&
            currentAccount() === accountId
          ) {
            await persist({ ...copy(state), locked: true });
          }
          throw error;
        }
      })
  };
}
