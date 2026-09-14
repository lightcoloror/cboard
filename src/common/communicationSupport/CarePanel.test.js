import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import CarePanel from './CarePanel';

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
