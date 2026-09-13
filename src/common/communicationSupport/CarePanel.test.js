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
