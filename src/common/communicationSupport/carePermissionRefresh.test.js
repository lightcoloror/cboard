import { createCareSync } from './careSync';
import { careErrorMessage } from './careErrors';

describe('Care write denial and current read permission', () => {
  function fixture(outcome = 'read-only') {
    const disk = new Map();
    const history = [];
    let phase = 'initial';
    let account = 'synthetic-member';
    const denied = () => Object.assign(new Error('PROFILE_ACCESS_DENIED'), {
      status: 403, data: { code: 'PROFILE_ACCESS_DENIED' }
    });
    const stored = () => JSON.parse(disk.values().next().value);
    const snapshot = permissions => ({
      id: 'synthetic-patient', familyId: 'synthetic-family', cursor: 1,
      permissions, resources: [
        { id: 'speechRate', kind: 'preference', version: 1, value: { value: 0.7 } },
        { id: 'synthetic-sentence', kind: 'favorite', version: 1, value: { sentence: '我今晚不回家吃饭', output: [] } }
      ]
    });
    const request = jest.fn(async (path, method) => {
      history.push({ path, method });
      if (method === 'POST') {
        phase = 'denied';
        if (outcome === 'account-changed-before-read') account = 'synthetic-other-member';
        throw denied();
      }
      if (phase === 'initial') return snapshot(['read', 'preferences.edit']);
      if (outcome === 'revoked') throw denied();
      if (outcome === 'unavailable') throw Object.assign(new Error('TEMPORARILY_UNAVAILABLE'), { status: 503 });
      if (outcome === 'account-changed') account = 'synthetic-other-member';
      return snapshot(['read']);
    });
    const engine = createCareSync({
      accountId: 'synthetic-member', familyId: 'synthetic-family', profileId: 'synthetic-patient',
      storage: { get: async key => disk.get(key), set: async (key, value) => { disk.set(key, value); } },
      request, newId: async () => 'synthetic-queued-preference', currentAccount: () => account
    });
    return { engine, stored, history, request };
  }

  it('keeps read-only access after a shared write loses its grant, retaining the unsent intention', async () => {
    const { engine, stored, history } = fixture();
    await engine.init(); await engine.sync();
    await engine.edit('preference', 'speechRate', { value: 1.3 });
    let denied;
    try { await engine.sync(); } catch (error) { denied = error; }
    expect(denied).toMatchObject({ status: 403, profileReadAllowed: true });
    expect(careErrorMessage(denied)).toContain('仍可查看此档案');
    expect(careErrorMessage({status:403,data:{code:'PROFILE_ACCESS_DENIED'}})).toContain('访问已撤销或尚未授权');
    const view = engine.view();
    expect(view.locked).toBe(false);
    expect(view.permissions).toEqual(['read']);
    expect(view.resources['favorite:synthetic-sentence'].value.sentence).toBe('我今晚不回家吃饭');
    expect(view.resources['preference:speechRate']).toMatchObject({ pending: true, value: { value: 1.3 } });
    expect(stored().queue.map(v => v.operationId)).toEqual(['synthetic-queued-preference']);
    expect(history.filter(v => v.method === 'POST')).toHaveLength(1);
    await expect(engine.edit('preference', 'speechRate', { value: 1 })).rejects.toThrow('未授予编辑权限');
    await expect(engine.sync()).rejects.toThrow('未授予编辑权限');
    expect(history.filter(v => v.method === 'POST')).toHaveLength(1);
  });

  it('locks only when a fresh read confirms that profile access was revoked', async () => {
    const { engine, stored } = fixture('revoked');
    await engine.init(); await engine.sync(); await engine.edit('preference', 'speechRate', { value: 1.3 });
    await expect(engine.sync()).rejects.toMatchObject({ status: 403 });
    expect(engine.view()).toMatchObject({ locked: true, status: 'access_revoked', resources: {} });
    expect(stored().queue).toHaveLength(1);
  });

  it('does not label an unavailable permission recheck as confirmed revocation', async () => {
    const { engine, stored, history } = fixture('unavailable');
    await engine.init(); await engine.sync(); await engine.edit('preference', 'speechRate', { value: 1.3 });
    await expect(engine.sync()).rejects.toMatchObject({ status: 503 });
    expect(engine.view()).toMatchObject({ locked: true, status: 'access_check_required', resources: {} });
    expect(stored().queue).toHaveLength(1);
    expect(history.filter(v => v.method === 'POST')).toHaveLength(1);
  });

  it('cannot write a late permission read into a different account context', async () => {
    const { engine, stored } = fixture('account-changed');
    await engine.init(); await engine.sync(); await engine.edit('preference', 'speechRate', { value: 1.3 });
    await expect(engine.sync()).rejects.toMatchObject({ status: 401 });
    expect(stored().permissions).toEqual(['read', 'preferences.edit']);
    expect(stored().queue).toHaveLength(1);
  });

  it('does not start a permission read after the account already changed', async () => {
    const { engine, stored, history } = fixture('account-changed-before-read');
    await engine.init(); await engine.sync(); await engine.edit('preference', 'speechRate', { value: 1.3 });
    await expect(engine.sync()).rejects.toMatchObject({ status: 401 });
    expect(history.filter(v => v.method === 'GET')).toHaveLength(2);
    expect(history.filter(v => v.method === 'POST')).toHaveLength(1);
    expect(stored().permissions).toEqual(['read', 'preferences.edit']);
    expect(stored().queue).toHaveLength(1);
  });
});
