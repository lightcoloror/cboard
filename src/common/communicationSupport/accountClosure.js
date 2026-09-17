// Shared by browser and mini program. Platform adapters provide transport/storage.
// A status receipt is not a login token and must never enter exports or sync data.
const storageQueues = new WeakMap();
export function createAccountClosure({
  api,
  storage,
  currentAccount,
  scope,
  preserveLocal
}) {
  const prefix = `account-closure-v1:${encodeURIComponent(scope)}:`;
  const latestKey = `${prefix}latest`;
  let busy = false;
  if (!storageQueues.has(storage)) storageQueues.set(storage, new Map());
  const changed = () =>
    Object.assign(new Error('账号已切换，请重新打开注销页面。'), {
      code: 'ACCOUNT_CHANGED'
    });
  const check = owner => {
    if (!owner || currentAccount() !== owner) throw changed();
  };
  async function read() {
    const account = currentAccount();
    const owner = account || (await storage.get(latestKey));
    if (!owner) return null;
    const receipt = await storage.get(prefix + owner);
    if (currentAccount() !== account) throw changed();
    return receipt && receipt.owner === owner ? receipt : null;
  }
  async function persist(receipt) {
    await storage.set(prefix + receipt.owner, receipt);
    const saved = await storage.get(prefix + receipt.owner);
    if (
      !saved ||
      saved.secret !== receipt.secret ||
      saved.receiptId !== receipt.receiptId ||
      saved.submitted !== receipt.submitted
    )
      throw Object.assign(new Error('无法保存注销进度凭据，尚未提交删除。'), {
        code: 'CLOSURE_STORAGE_UNAVAILABLE'
      });
    await storage.set(latestKey, receipt.owner);
    if ((await storage.get(latestKey)) !== receipt.owner)
      throw Object.assign(new Error('无法保存注销进度入口，尚未提交删除。'), {
        code: 'CLOSURE_STORAGE_UNAVAILABLE'
      });
  }
  async function inspect(receipt) {
    const result = await api.status({
      receiptId: receipt.receiptId,
      secret: receipt.secret
    });
    if (
      !result ||
      !['prepared', 'confirmed'].includes(result.status) ||
      (result.accountDeleted === true &&
        (result.status !== 'confirmed' || result.cleanupStatus !== 'complete'))
    )
      throw Object.assign(new Error('注销状态暂时无法确认，请稍后查询。'), {
        code: 'INVALID_RESPONSE'
      });
    return result;
  }
  return {
    receipt: read,
    async status() {
      const account = currentAccount();
      const receipt = await read();
      const result = receipt ? await inspect(receipt) : null;
      if (currentAccount() !== account) throw changed();
      if (result && result.status === 'prepared' && receipt.submitted)
        return { ...result, confirmationUnknown: true };
      return result;
    },
    async preview() {
      const owner = currentAccount();
      check(owner);
      const preview = await api.preview();
      check(owner);
      return { ...preview, owner };
    },
    async confirm(preview) {
      if (busy)
        throw Object.assign(new Error('注销请求正在处理，请查询进度。'), {
          code: 'CLOSURE_IN_PROGRESS'
        });
      const owner = preview && preview.owner;
      check(owner);
      if (
        preview.canConfirm !== true ||
        !Array.isArray(preview.familyIds) ||
        !preview.familyIds.every(
          id => typeof id === 'string' && id.length > 0
        ) ||
        !Array.isArray(preview.blockers) ||
        preview.blockers.length
      )
        throw Object.assign(
          new Error('请先处理管理员交接，再重新查看注销范围。'),
          { code: 'CLOSURE_BLOCKED' }
        );
      busy = true;
      const submit = async () => {
        check(owner);
        let receipt = await read();
        if (receipt) {
          // Never replace an ambiguous submitted receipt. The server, not the
          // locally saved 15-minute expiry, decides whether confirmation happened.
          try {
            const status = await inspect(receipt);
            check(owner);
            if (status.status === 'confirmed') return status;
            if (receipt.submitted)
              throw Object.assign(
                new Error('确认请求结果尚不明确，请查询进度。'),
                {
                  code: 'CLOSURE_CONFIRMATION_UNKNOWN'
                }
              );
          } catch (error) {
            if (
              receipt.submitted ||
              error.code !== 'CLOSURE_RECEIPT_UNAVAILABLE' ||
              error.status !== 404
            )
              throw error;
            receipt = null;
          }
        }
        check(owner);
        if (!receipt) {
          const prepared = await api.prepare();
          check(owner);
          if (
            !prepared ||
            prepared.receiptId !== owner ||
            !/^[a-f0-9]{64}$/.test(prepared.secret)
          )
            throw Object.assign(new Error('注销凭据格式异常，尚未提交删除。'), {
              code: 'INVALID_RESPONSE'
            });
          receipt = {
            owner,
            receiptId: prepared.receiptId,
            secret: prepared.secret
          };
        }
        try {
          await persist(receipt);
        } catch (_) {
          throw Object.assign(
            new Error('无法保存注销进度凭据，尚未提交删除。'),
            { code: 'CLOSURE_STORAGE_UNAVAILABLE' }
          );
        }
        check(owner);
        if (typeof preserveLocal !== 'function')
          throw Object.assign(
            new Error('本机资料保留尚未准备好，未提交注销。'),
            {
              code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE'
            }
          );
        let recovery;
        try {
          recovery = await preserveLocal({
            owner,
            familyIds: preview.familyIds
          });
        } catch (error) {
          if (error.code === 'ACCOUNT_CHANGED') throw error;
          throw Object.assign(new Error('本机恢复副本保存失败，未提交注销。'), {
            code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE'
          });
        }
        check(owner);
        if (!recovery || recovery.saved !== true)
          throw Object.assign(new Error('本机资料保留未完成，未提交注销。'), {
            code: 'CLOSURE_LOCAL_RECOVERY_UNAVAILABLE'
          });
        // Persist the attempt before sending. A process crash or a temporarily
        // prepared status must never authorize a second ambiguous submission.
        receipt = { ...receipt, submitted: true };
        try {
          await persist(receipt);
        } catch (_) {
          throw Object.assign(new Error('无法保存提交记录，尚未提交注销。'), {
            code: 'CLOSURE_STORAGE_UNAVAILABLE'
          });
        }
        check(owner);
        try {
          const accepted = await api.confirm({
            familyIds: preview.familyIds,
            secret: receipt.secret,
            confirmCloudDeletion: true
          });
          check(owner);
          if (
            !accepted ||
            accepted.accountDeleted !== false ||
            !accepted.operationId
          )
            throw Object.assign(new Error('请查询注销进度。'), {
              code: 'INVALID_RESPONSE'
            });
          return { ...accepted, status: 'confirmed', accountDeleted: false };
        } catch (error) {
          // A lost response may mean the server committed and revoked the login.
          // Query the persisted capability instead of resending a destructive call.
          try {
            const status = await inspect(receipt);
            check(owner);
            if (status.status === 'confirmed') return status;
          } catch (_) {
            /* Keep the original bounded error and durable receipt. */
          }
          if (error.status >= 400 && error.status < 500) {
            // An explicit client-error response is a definite refusal. Keep
            // uncertain network/5xx attempts blocked until status is confirmed.
            try {
              await persist({ ...receipt, submitted: false });
            } catch (_) {
              /* The durable attempted flag remains conservative. */
            }
          }
          throw error;
        }
      };
      try {
        const queues = storageQueues.get(storage);
        const key = prefix + owner;
        const job = (queues.get(key) || Promise.resolve()).then(() =>
          storage.exclusive ? storage.exclusive(key, submit) : submit()
        );
        queues.set(key, job.catch(() => {}));
        return await job;
      } finally {
        busy = false;
      }
    }
  };
}

export function accountClosureMessage(error) {
  const messages = {
    CLOSURE_CONFIRMATION_UNKNOWN:
      '注销确认请求的结果尚不明确。请查询进度；暂不重复提交，必要时联系支持核对。',
    CLOSURE_LOCAL_RECOVERY_UNAVAILABLE:
      '本机恢复副本未能完整保存，尚未提交注销。请先检查存储空间或导出资料。',
    ACCOUNT_CHANGED: '账号已切换，请重新打开注销页面。',
    LOGIN_REQUIRED: '请重新登录后确认；已提交的注销仍可查询进度。',
    FAMILY_TRANSFER_REQUIRED: '家庭还有其他成员，请先交接管理员权限。',
    INSTITUTION_TRANSFER_REQUIRED: '请先交接机构管理员权限。',
    FUNDING_TRANSFER_REQUIRED: '请先处理额度账户的管理关系。',
    CLOSURE_FAMILY_SET_CHANGED: '家庭范围已变化，请重新查看并确认。',
    CLOSURE_RECEIPT_UNAVAILABLE:
      '进度查询凭据已失效。请联系支持核对，不代表注销已完成。',
    CARE_CLOSURE_DISABLED: '注销服务暂未开放，请稍后再试或联系支持。',
    CLOSURE_STORAGE_UNAVAILABLE: '无法保存本机进度查询凭据，尚未提交删除。'
  };
  return (
    messages[error && error.code] ||
    '暂时无法确认注销状态。请查询进度或联系支持，本机资料未主动删除。'
  );
}
