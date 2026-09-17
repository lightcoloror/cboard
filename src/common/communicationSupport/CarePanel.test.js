import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import CarePanel from './CarePanel';
import { previewCareArchive } from './careArchiveImport';

jest.mock('./careArchiveImport', () => ({ previewCareArchive: jest.fn() }));

describe('shared patient collaboration UI', () => {
  let host, who, tick, disk, runtime, counter;
  const ui = {
    Box: 'div',
    Text: 'p',
    Button: 'button',
    Image: 'img',
    Input: ({ onValue, ...props }) => (
      <input {...props} onChange={e => onValue(e.target.value)} />
    )
  };
  const flush = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  const button = text =>
    [...host.querySelectorAll('button')].find(b => b.textContent === text);
  beforeEach(() => {
    previewCareArchive.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    who = { id: 'owner', token: 'synthetic' };
    disk = {};
    counter = 0;
    let resources = [];
    runtime = {
      identity: () => who,
      newId: () => `op${++counter}`,
      enabled: true,
      watch: callback => {
        tick = callback;
        return () => {};
      },
      storage: {
        get: async k => disk[k],
        set: async (k, v) => {
          disk[k] = v;
        }
      },
      request: jest.fn(async (path, method, body) => {
        if (path === '/care/profiles')
          return [{ id: 'patient', familyId: 'family', name: '合成患者' }];
        if (path === '/care/families') return [];
        if (method === 'GET')
          return {
            id: 'patient',
            familyId: 'family',
            cursor: 0,
            permissions: ['read', 'library.edit', 'preferences.edit'],
            resources
          };
        const r = {
          id: body.resourceId,
          kind: body.kind,
          version: body.baseVersion + 1,
          value: body.value,
          seq: 1
        };
        resources = resources.filter(v => v.id !== r.id).concat(r);
        return { resource: r };
      }),
      speak: jest.fn(async () => {}),
      confirm: async () => true,
      copy: async () => {},
      logout: () => {
        who = null;
      }
    };
  });
  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(host);
    });
    host.remove();
  });
  it.each([false, true])(
    'refreshes administrator rights only after confirmed transfer (%s)',
    async confirmed => {
      let transferred = false;
      let listReads = 0;
      runtime.confirm = jest.fn(async () => confirmed);
      runtime.request.mockImplementation(async (path, method, body) => {
        if (path === '/care/profiles') {
          listReads += 1;
          return [{ id: 'patient', familyId: 'family', name: '合成患者' }];
        }
        if (path === '/care/families') return [];
        if (path.endsWith('/administrator')) {
          expect(body.member).toBe('relative');
          transferred = true;
          return { ok: true };
        }
        return {
          id: 'patient',
          familyId: 'family',
          cursor: 0,
          resources: [],
          owner: !transferred,
          permissions: transferred ? ['read'] : ['read', 'members.manage'],
          members: transferred
            ? undefined
            : { owner: ['read', 'members.manage'], relative: ['read'] }
        };
      });
      await act(async () => {
        ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
        await flush();
      });
      await act(async () => {
        Simulate.click(button('合成患者'));
        await flush();
      });
      await act(async () => {
        Simulate.click(button('查看成员'));
        await flush();
      });
      const readsBefore = listReads;
      await act(async () => {
        Simulate.click(button('交接家庭管理员'));
        await flush();
      });
      expect(transferred).toBe(confirmed);
      if (confirmed) {
        expect(button('交接家庭管理员')).toBeUndefined();
        expect(listReads).toBeGreaterThan(readsBefore);
      } else {
        expect(button('交接家庭管理员')).toBeTruthy();
        expect(listReads).toBe(readsBefore);
      }
    }
  );
  it('offers account navigation for anonymous users without touching care data or hiding offline import', async () => {
    who = null;
    const openAccount = jest.fn();
    const storageGet = jest.spyOn(runtime.storage, 'get');
    runtime.openAccount = openAccount;
    runtime.chooseArchive = jest.fn();
    runtime.restoreOffline = jest.fn();
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });

    expect(host.textContent).toContain('登录或注册账号');
    expect(host.textContent).toContain('换设备离线恢复');
    await act(async () => {
      Simulate.click(button('登录或注册账号'));
      await flush();
    });
    expect(openAccount).toHaveBeenCalledTimes(1);
    expect(runtime.request).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(previewCareArchive).not.toHaveBeenCalled();
  });
  it('keeps trial claims hidden by default and submits only the family id when enabled', async () => {
    const family = { id: 'family-a', name: '合成家庭' };
    runtime.request.mockImplementation(async (path, method, body) => {
      if (path === '/care/profiles') return [];
      if (path === '/care/families') return [family];
      if (path === '/care/trial-claims') {
        expect(method).toBe('POST');
        expect(body).toEqual({ familyId: 'family-a' });
        return { status: 'complete', claimId: 'trial-a' };
      }
      return {};
    });
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    expect(button('开通体验')).toBeUndefined();

    runtime.trialEnabled = true;
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    expect(button('开通体验')).toBeTruthy();
    await act(async () => {
      Simulate.click(button('开通体验'));
      await flush();
    });
    expect(
      runtime.request.mock.calls.filter(
        ([path]) => path === '/care/trial-claims'
      )
    ).toHaveLength(1);
  });
  it('does not report a non-complete trial result as successful', async () => {
    const family = { id: 'family-pending', name: '待核对家庭' };
    runtime.trialEnabled = true;
    runtime.request.mockImplementation(async path => {
      if (path === '/care/profiles') return [];
      if (path === '/care/families') return [family];
      if (path === '/care/trial-claims') return { status: 'pending' };
      return {};
    });
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      Simulate.click(button('开通体验'));
      await flush();
    });
    expect(host.textContent).toContain('体验开通未完成');
    expect(host.textContent).not.toContain('已保存；本地待同步修改会保留。');
  });
  it.each([
    ['patient', '我是患者，进入表达'],
    ['relative', '我是家属或照护者，进入接收'],
    ['professional', '我是专业协作者，进入接收']
  ])(
    'creates a profile with the selected %s entry role',
    async (role, label) => {
      runtime.request.mockImplementation(async (path, method, body) => {
        if (path === '/care/profiles') return [];
        if (path === '/care/families')
          return [{ id: 'family-a', name: '合成家庭' }];
        if (path === '/care/profiles' && method === 'POST')
          return { id: 'patient-a' };
        return {};
      });
      await act(async () => {
        ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
        await flush();
      });
      const name = host.querySelector(
        'input[placeholder="家庭或患者档案名称"]'
      );
      await act(async () => {
        Simulate.change(name, { target: { value: '合成患者' } });
        Simulate.click(button(label));
        await flush();
      });
      await act(async () => {
        Simulate.click(button('在此家庭新建患者档案'));
        await flush();
      });
      expect(runtime.request).toHaveBeenCalledWith('/care/profiles', 'POST', {
        familyId: 'family-a',
        name: '合成患者',
        role
      });
    }
  );
  it('clears visible creation drafts and restores the relative entry default after an account switch', async () => {
    runtime.request.mockImplementation(async (path, method) => {
      if (path === '/care/profiles') return [];
      if (path === '/care/families')
        return [{ id: `family-${who.id}`, name: '合成家庭' }];
      return {};
    });
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    const [name, invitation] = host.querySelectorAll('input');
    await act(async () => {
      Simulate.change(name, { target: { value: '前账号患者' } });
      Simulate.change(invitation, { target: { value: '前账号邀请凭据' } });
      Simulate.click(button('我是患者，进入表达'));
      who = { id: 'other', token: 'synthetic-other' };
      tick();
      await flush();
    });
    const [nextName, nextInvitation] = host.querySelectorAll('input');
    expect(nextName.value).toBe('');
    expect(nextInvitation.value).toBe('');
    await act(async () => {
      Simulate.change(nextName, { target: { value: '新账号患者' } });
      await flush();
    });
    await act(async () => {
      Simulate.click(button('在此家庭新建患者档案'));
      await flush();
    });
    expect(runtime.request).toHaveBeenCalledWith('/care/profiles', 'POST', {
      familyId: 'family-other',
      name: '新账号患者',
      role: 'relative'
    });
  });
  it('discards an old account response after switching away and back', async () => {
    let finish;
    const original = runtime.request.getMockImplementation();
    runtime.request.mockImplementation((path, ...args) =>
      path === '/care/migration-preview'
        ? new Promise(resolve => {
            finish = resolve;
          })
        : original(path, ...args)
    );
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      Simulate.click(button('查看旧资料归属预览'));
      await flush();
    });
    for (const id of ['other', 'owner']) {
      await act(async () => {
        who = { id, token: 'synthetic' };
        tick();
        await flush();
      });
    }
    await act(async () => {
      finish({
        boardIds: [],
        communicators: [{ sourceId: 'OLD-PRIVATE-SOURCE', boardIds: [] }]
      });
      await flush();
    });
    expect(host.textContent).not.toContain('OLD-PRIVATE-SOURCE');
    expect(host.textContent).not.toContain('已保存；');
    expect(button('查看旧资料归属预览').disabled).toBe(false);
  });
  it('continues loading with a refreshed token for the same account', async () => {
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    runtime.request.mockClear();
    await act(async () => {
      who = { id: 'owner', token: 'refreshed' };
      tick();
      await flush();
    });
    expect(runtime.request).toHaveBeenCalledWith('/care/profiles', 'GET');
    expect(host.textContent).toContain('合成患者');
    expect(host.textContent).not.toContain('账号已切换');
  });
  it('does not persist an old token 401 as the new session login state', async () => {
    let rejectOld;
    const original = runtime.request.getMockImplementation();
    runtime.request.mockImplementation((path, ...args) =>
      path.startsWith('/care/profiles/patient')
        ? new Promise((_, reject) => {
            rejectOld = reject;
          })
        : original(path, ...args)
    );
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      Simulate.click(button('合成患者'));
      await flush();
    });
    expect(rejectOld).toEqual(expect.any(Function));
    await act(async () => {
      who = { id: 'owner', token: 'new-token' };
      tick();
      await flush();
    });
    await act(async () => {
      rejectOld(Object.assign(new Error('OLD-AUTH-FAILURE'), { status: 401 }));
      await flush();
    });
    expect(
      JSON.parse(disk['care-v1:owner:family:patient'] || '{}').status
    ).not.toBe('login_required');
    expect(host.textContent).not.toContain('OLD-AUTH-FAILURE');
  });
  it.each([
    ['patient', '改为患者，进入表达', 'expression'],
    ['relative', '改为家属或照护者，进入接收', 'receiver'],
    ['professional', '改为专业协作者，进入接收', 'receiver']
  ])(
    'changes only the current member to %s without changing permissions',
    async (role, label, defaultMode) => {
      let currentRole = 'relative';
      runtime.selectProfile = jest.fn(async () => {});
      runtime.request.mockImplementation(async (path, method, body) => {
        if (path === '/care/profiles')
          return [
            {
              id: 'patient',
              familyId: 'family',
              name: '合成患者',
              relationship: {
                role: currentRole,
                defaultMode:
                  currentRole === 'patient' ? 'expression' : 'receiver'
              }
            }
          ];
        if (path === '/care/families') return [];
        if (path === '/care/profiles/patient/commands') {
          expect(method).toBe('POST');
          expect(body).toEqual({
            action: 'relationship',
            operationId: expect.any(String),
            value: { role }
          });
          currentRole = role;
          return { relationship: { role, defaultMode } };
        }
        if (method === 'GET')
          return {
            id: 'patient',
            familyId: 'family',
            cursor: 0,
            permissions: ['read', 'library.edit', 'preferences.edit'],
            relationship: {
              role: currentRole,
              defaultMode: currentRole === 'patient' ? 'expression' : 'receiver'
            },
            resources: []
          };
        return {};
      });
      await act(async () => {
        ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
        await flush();
      });
      await act(async () => {
        Simulate.click(button('合成患者'));
        await flush();
      });
      await act(async () => {
        Simulate.click(button(label));
        await flush();
      });
      expect(runtime.selectProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 'patient',
          relationship: { role, defaultMode }
        })
      );
      expect(host.textContent).toContain(
        role === 'patient'
          ? '当前本人身份：患者 · 表达'
          : role === 'professional'
          ? '当前本人身份：专业协作者 · 接收'
          : '当前本人身份：家属或照护者 · 接收'
      );
    }
  );
  async function openImportTarget() {
    previewCareArchive.mockResolvedValue({
      fingerprint: 'synthetic-guest-archive',
      boardCount: 0,
      tileCount: 1,
      media: [],
      resources: [
        {
          kind: 'tile',
          resourceId: 'guest-water',
          value: { label: '访客喝水' }
        }
      ]
    });
    runtime.chooseArchive = jest.fn(async () => new Uint8Array([1]));
    runtime.confirm = jest.fn(async () => true);
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      Simulate.click(button('合成患者'));
      await flush();
    });
    runtime.request.mockClear();
  }
  it.each(['file', 'preview', 'confirmation'])(
    'cancels restoration when the session changes during %s',
    async stage => {
      await openImportTarget();
      let finish;
      const wait = new Promise(resolve => {
        finish = resolve;
      });
      if (stage === 'file') runtime.chooseArchive.mockReturnValue(wait);
      if (stage === 'preview') previewCareArchive.mockReturnValue(wait);
      await act(async () => {
        Simulate.click(button('从同一患者的备份恢复'));
        await flush();
      });
      who = { id: 'owner', token: 'new-session' };
      await act(async () => {
        if (stage === 'confirmation') Simulate.click(button('确认来源并恢复'));
        else
          finish(
            stage === 'file'
              ? new Uint8Array([1])
              : { boardCount: 0, tileCount: 1 }
          );
        await flush();
      });
      // A former session cannot publish even its cancellation message.
      expect(host.textContent).not.toContain('本次恢复已取消');
      expect(runtime.request).not.toHaveBeenCalled();
      expect(JSON.parse(disk['care-v1:owner:family:patient']).queue).toEqual(
        []
      );
      expect(
        JSON.parse(disk['care-v1:owner:family:patient']).resources
      ).toEqual({});
    }
  );
  it.each([false, true])(
    'imports a guest archive only after explicit source confirmation=%s',
    async accepted => {
      await openImportTarget();
      expect(runtime.chooseArchive).not.toHaveBeenCalled();
      expect(runtime.request).not.toHaveBeenCalled();
      await act(async () => {
        Simulate.click(button('从同一患者的备份恢复'));
        await flush();
      });
      expect(previewCareArchive).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        { profileId: 'patient', familyId: 'family' },
        ''
      );
      expect(runtime.confirm).not.toHaveBeenCalled();
      expect(host.textContent).toContain('请确认来源确实为同一患者');
      expect(host.textContent).toContain('恢复到「合成患者」');
      expect(host.textContent).toContain('尚未导入或上传');
      expect(runtime.request).not.toHaveBeenCalled();
      expect(JSON.parse(disk['care-v1:owner:family:patient']).queue).toEqual(
        []
      );
      await act(async () => {
        Simulate.click(button(accepted ? '确认来源并恢复' : '取消恢复'));
        await flush();
      });
      expect(
        host.querySelector('[aria-label="确认备份来源与恢复目标"]')
      ).toBeNull();
      const writes = runtime.request.mock.calls.filter(
        ([, method]) => method === 'POST'
      );
      expect(writes).toHaveLength(accepted ? 1 : 0);
      if (accepted)
        expect(writes[0][0]).toBe('/care/profiles/patient/commands');
      else
        expect(
          JSON.parse(disk['care-v1:owner:family:patient']).resources
        ).toEqual({});
    }
  );
  it('clears an archive preview when the selected account changes', async () => {
    await openImportTarget();
    await act(async () => {
      Simulate.click(button('从同一患者的备份恢复'));
      await flush();
    });
    expect(button('确认来源并恢复')).toBeTruthy();
    await act(async () => {
      who = null;
      tick();
      await flush();
    });
    expect(button('确认来源并恢复')).toBeUndefined();
    expect(JSON.parse(disk['care-v1:owner:family:patient']).queue).toEqual([]);
    expect(runtime.request).not.toHaveBeenCalled();
  });
  it('requires page confirmation for logout-all and permits cancellation', async () => {
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    runtime.request.mockClear();
    act(() => Simulate.click(button('退出全部设备')));
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(runtime.request).not.toHaveBeenCalled();
    act(() => Simulate.click(button('取消退出')));
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(runtime.request).not.toHaveBeenCalled();
    act(() => Simulate.click(button('退出全部设备')));
    await act(async () => {
      Simulate.click(button('确认退出全部设备'));
      await flush();
    });
    expect(runtime.request).toHaveBeenCalledWith('/user/sessions', 'POST', {
      all: true
    });
    expect(who).toBeNull();
  });
  it('does not use a logout confirmation for a different account', async () => {
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    act(() => Simulate.click(button('退出全部设备')));
    who = { id: 'other', token: 'other-synthetic' };
    runtime.request.mockClear();
    await act(async () => {
      Simulate.click(button('确认退出全部设备'));
      await flush();
    });
    expect(runtime.request).not.toHaveBeenCalled();
    expect(who.id).toBe('other');
  });
  it.each(['other', 'owner'])(
    'does not clear a new session while old logout is in flight (%s)',
    async nextId => {
      await act(async () => {
        ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
        await flush();
      });
      let finish;
      runtime.request.mockImplementation(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      act(() => Simulate.click(button('退出全部设备')));
      act(() => Simulate.click(button('确认退出全部设备')));
      who = { id: nextId, token: 'new-session' };
      await act(async () => {
        finish({});
        await flush();
      });
      expect(who).toEqual({ id: nextId, token: 'new-session' });
    }
  );
  it.each([
    [{ status: 401 }, '登录已失效'],
    [
      { status: 403, data: { code: 'PROFILE_ACCESS_DENIED' } },
      '撤销或尚未授权'
    ],
    [{ status: 403, data: { code: 'SUBSCRIPTION_EXPIRED' } }, '订阅已到期'],
    [
      { status: 503, data: { code: 'CARE_STORAGE_UNAVAILABLE' } },
      '云端存储暂时不可用'
    ],
    [{ errMsg: 'request:fail url not in domain list' }, '未获准连接'],
    [new TypeError('Failed to fetch'), '暂时无法连接云端']
  ])(
    'preserves the initial profile load error category %j',
    async (error, expected) => {
      runtime.request.mockRejectedValue(error);
      await act(async () => {
        ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
        await flush();
      });
      expect(host.textContent).toContain(expected);
      expect(host.textContent).not.toContain(
        '暂时无法联网；可打开已缓存的档案。'
      );
    }
  );
  it('does not display an old account load failure after an account switch', async () => {
    let rejectLoad;
    runtime.request.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          rejectLoad = reject;
        })
    );
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      who = { id: 'other', token: 'synthetic-other' };
      rejectLoad({ status: 401 });
      await flush();
    });
    expect(host.textContent).not.toContain('登录已失效');
  });
  it.each([false, true])(
    'matches family favorite ownership controls when administrator=%s',
    async administrator => {
      runtime.funding = () => null;
      const records = [
        { id: 'other', kind: 'favorite', createdBy: 'someone-else' },
        { id: 'own-share', kind: 'favorite', createdBy: 'owner' },
        {
          id: 'source-share',
          kind: 'favorite',
          source: { owner: 'owner', id: 'original' }
        }
      ].map(item => ({
        ...item,
        version: 1,
        seq: 1,
        value: { sentence: item.id, output: [] }
      }));
      runtime.request = jest.fn(async (path, method) => {
        if (path === '/care/profiles')
          return [{ id: 'patient', familyId: 'family', name: '合成患者' }];
        if (path === '/care/families') return [];
        if (path.endsWith('/favorites'))
          return {
            items: [
              {
                id: 'personal',
                version: 1,
                value: { sentence: 'personal', output: [] }
              }
            ]
          };
        if (method === 'GET')
          return {
            familyId: 'family',
            cursor: 1,
            permissions: ['read'],
            owner: administrator,
            resources: records
          };
        throw new Error('Unexpected mutation');
      });
      await act(async () => {
        ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
        await flush();
      });
      await act(async () => {
        Simulate.click(button('合成患者'));
        await flush();
      });
      const row = sentence =>
        [...host.querySelectorAll('p')].find(p =>
          p.textContent.endsWith('：' + sentence)
        ).parentElement;
      const editButtons = sentence =>
        [...row(sentence).querySelectorAll('button')].filter(b =>
          ['编辑此内容', '保存修改', '删除'].includes(b.textContent)
        );
      expect(editButtons('other').map(b => b.disabled)).toEqual([
        !administrator,
        !administrator,
        !administrator
      ]);
      for (const sentence of ['own-share', 'source-share', 'personal'])
        expect(editButtons(sentence).map(b => b.disabled)).toEqual([
          false,
          false,
          false
        ]);
      if (!administrator) {
        await act(async () => {
          Simulate.click(editButtons('other')[1]);
          await flush();
        });
        expect(
          runtime.request.mock.calls.filter(([, method]) => method === 'POST')
        ).toHaveLength(0);
        expect(
          JSON.parse(disk['care-v1:owner:family:patient']).queue
        ).toHaveLength(0);
      }
    }
  );
  it('reports shared success and original conflict separately, then permits keeping the original', async () => {
    const shared = {
      id: 'shared',
      kind: 'favorite',
      version: 1,
      seq: 1,
      source: { owner: 'member', id: 'original', version: 1 },
      value: { sentence: '共享旧内容', output: [] }
    };
    runtime.request = jest.fn(async (path, method, body) => {
      if (path === '/care/profiles')
        return [{ id: 'patient', familyId: 'family', name: '合成患者' }];
      if (path === '/care/families') return [];
      if (path.endsWith('/favorites')) return { items: [] };
      if (path.endsWith('/favorite-original'))
        throw {
          status: 409,
          data: {
            code: 'FAVORITE_CONFLICT',
            current: { version: 2, value: { sentence: '成员自行更新' } }
          }
        };
      if (path.endsWith('/commands')) {
        shared.version += 1;
        shared.value = body.value;
        return { resource: { ...shared } };
      }
      if (method === 'GET')
        return {
          familyId: 'family',
          cursor: 1,
          owner: true,
          permissions: ['read'],
          resources: [shared]
        };
      throw new Error('Unexpected request');
    });
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      Simulate.click(button('合成患者'));
      await flush();
    });
    const input = [...host.querySelectorAll('input')].find(
      e => e.placeholder === '收藏内容或修改后的文字'
    );
    act(() => {
      Simulate.change(input, { target: { value: '管理员修改' } });
      Simulate.click(button('修改范围：仅家庭共享内容'));
    });
    await act(async () => {
      Simulate.click(button('保存修改'));
      await flush();
    });
    expect(host.textContent).toContain('共享内容已保存；成员原收藏尚未更新');
    expect(host.textContent).toContain('原收藏当前内容：成员自行更新');
    expect(shared.value.sentence).toBe('管理员修改');
    expect(
      JSON.parse(disk['care-v1:owner:family:patient']).originalUpdates
    ).toHaveLength(1);
    const writesBefore = runtime.request.mock.calls.filter(
      ([, method]) => method === 'POST'
    ).length;
    await act(async () => {
      Simulate.click(button('保留原收藏当前版本'));
      await flush();
    });
    expect(
      JSON.parse(disk['care-v1:owner:family:patient']).originalUpdates
    ).toHaveLength(0);
    expect(
      runtime.request.mock.calls.filter(([, method]) => method === 'POST')
    ).toHaveLength(writesBefore);
    expect(button('保留原收藏当前版本')).toBeUndefined();
  });
  it('opens the patient, persists a new tile using the shared engine, and renders it for communication', async () => {
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      Simulate.click(button('合成患者'));
      await flush();
    });
    const input = [...host.querySelectorAll('input')].find(e =>
      e.placeholder.startsWith('图卡文字')
    );
    act(() => Simulate.change(input, { target: { value: '我想喝水' } }));
    await act(async () => {
      Simulate.click(button('添加文字图卡'));
      await flush();
    });
    expect(button('我想喝水')).toBeTruthy();
    expect(JSON.parse(disk['care-v1:owner:family:patient']).queue).toHaveLength(
      0
    );
    await act(async () => {
      Simulate.click(button('我想喝水'));
      await flush();
    });
    expect(runtime.speak).toHaveBeenCalledWith('我想喝水', 1);
  });
  it('clears the selected patient and data immediately when account identity disappears', async () => {
    await act(async () => {
      ReactDOM.render(<CarePanel runtime={runtime} ui={ui} />, host);
      await flush();
    });
    await act(async () => {
      Simulate.click(button('合成患者'));
      await flush();
    });
    await act(async () => {
      who = null;
      tick();
      await flush();
    });
    expect(host.textContent).toContain('请先在现有账号页面登录');
    expect(host.textContent).not.toContain('合成患者');
  });
});
