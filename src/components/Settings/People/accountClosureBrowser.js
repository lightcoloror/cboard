import { saveAs } from 'file-saver';
import API from '../../../api';
import { API_URL } from '../../../constants';
import { getStore } from '../../../store';
import { careBrowserStorage } from '../../../common/communicationSupport/careBrowserStorage';
import { createAccountClosure } from '../../../common/communicationSupport/accountClosure';
import { createAccountClosureRecovery } from '../../../common/communicationSupport/accountClosureRecovery';
import { exportCareDeviceArchive } from '../../../common/communicationSupport/careDeviceArchive';
import { encryptPrivateArchive } from '../../../common/communicationSupport/privateArchiveEncryption';
import { buildLocalDeviceDataArchive } from '../Export/PictureLibraryArchive.helpers';

export function createBrowserAccountClosure({
  api = API,
  storage = careBrowserStorage,
  state = () => getStore().getState(),
  scope = API_URL,
  selection = owner =>
    process.env.REACT_APP_CARE_COLLABORATION === 'true'
      ? JSON.parse(localStorage.getItem(`care-selection-v1:${owner}`) || 'null')
      : null,
  buildLegacy = buildLocalDeviceDataArchive,
  buildCare = exportCareDeviceArchive,
  download = saveAs
} = {}) {
  const account = () => {
    const user = state().app.userData;
    return user && user.authToken ? String(user.id || user._id || '') : null;
  };
  const indexKey = owner =>
    `closure-recovery-index-v1:${encodeURIComponent(scope)}:${owner}`;
  const recovery = (id, buildArchive) =>
    createAccountClosureRecovery({
      storage,
      scope: `${scope}:${id}`,
      currentAccount: account,
      buildArchive
    });
  const client = createAccountClosure({
    scope,
    storage,
    currentAccount: account,
    api: {
      preview: () => api.previewAccountClosure(),
      prepare: () => api.prepareAccountClosure(),
      confirm: body => api.confirmAccountClosure(body),
      status: body => api.getAccountClosureStatus(body)
    },
    async preserveLocal({ owner, familyIds }) {
      const selected = selection(owner);
      const selectedKey = JSON.stringify(selected);
      const check = () => {
        if (
          account() !== owner ||
          JSON.stringify(selection(owner)) !== selectedKey
        )
          throw Object.assign(new Error('账号或患者档案已切换'), {
            code: 'ACCOUNT_CHANGED'
          });
      };
      check();
      const entries = [];
      if (selected && (!selected.id || !selected.familyId))
        throw new Error('患者档案选择无效');
      const raw = selected
        ? await storage.get(
            `care-v1:${owner}:${selected.familyId}:${selected.id}`
          )
        : null;
      const locked = raw ? JSON.parse(raw).locked : false;
      check();
      // The legacy archive includes scoped communication sidecars. Never turn an
      // invited family's current data into the closing account's offline copy.
      if ((!selected || familyIds.includes(selected.familyId)) && !locked) {
        const boards = state().board.boards;
        await recovery(
          'legacy',
          async () =>
            (await buildLegacy({ boards, zipType: 'uint8array' })).content
        ).preserve({ owner });
        entries.push({
          id: 'legacy',
          label: '本机图板与沟通资料',
          kind: 'legacy'
        });
      }
      check();
      // Only export caches of families explicitly owned and closed by this user.
      // Collaborator caches stay in their original partition, never become guest data.
      const profiles = await storage.list(`care-v1:${owner}:`);
      for (const row of profiles) {
        const parts = row.key.split(':');
        if (parts.length !== 4 || !familyIds.includes(parts[2])) continue;
        const snapshot = JSON.parse(row.value);
        if (snapshot.locked) continue;
        const id = `care:${parts[2]}:${parts[3]}`;
        await recovery(id, () =>
          buildCare({ familyId: parts[2], profileId: parts[3] }, snapshot)
        ).preserve({ owner });
        check();
        entries.push({
          id,
          label: `患者档案恢复副本 ${entries.length}`,
          kind: 'care'
        });
      }
      check();
      await storage.set(indexKey(owner), entries);
      if (
        JSON.stringify(await storage.get(indexKey(owner))) !==
        JSON.stringify(entries)
      )
        throw Object.assign(new Error('Recovery index unavailable'), {
          code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE'
        });
      check();
      return { saved: true };
    }
  });
  async function recoveryContext() {
    const receipt = await client.receipt();
    const context = receipt
      ? {
          owner: receipt.owner,
          entries: (await storage.get(indexKey(receipt.owner))) || []
        }
      : null;
    const current = await client.receipt();
    if (current?.owner !== receipt?.owner) throw new Error('账号已切换。');
    return context;
  }
  return {
    ...client,
    isCurrentAccount: owner => account() === owner,
    async recoveries() {
      const context = await recoveryContext();
      return context ? context.entries : [];
    },
    async downloadRecovery(id, passphrase) {
      const context = await recoveryContext();
      const entry = context && context.entries.find(item => item.id === id);
      if (!entry) throw new Error('未找到当前账号的本机恢复副本。');
      const bytes = await recovery(id).load(context.owner);
      const encrypted = await encryptPrivateArchive({
        data: bytes,
        passphrase,
        randomBytes: length => crypto.getRandomValues(new Uint8Array(length))
      });
      const current = await recoveryContext();
      if (!current || current.owner !== context.owner)
        throw new Error('账号已切换。');
      download(
        new Blob([encrypted], { type: 'application/octet-stream' }),
        entry.kind === 'care'
          ? 'tuyujia-device.zip'
          : 'tuyujia-local-device-data.zip'
      );
    }
  };
}
