import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import CareHome from './CareHome';
import { runtime } from './Care';
import CommunicationSupportPanel from '../Board/CommunicationSupport/CommunicationSupportPanel.component';

jest.mock('react-intl', () => ({ injectIntl: component => component }));
jest.mock(
  '../Board/CommunicationSupport/CommunicationSupportPanel.component',
  () =>
    function CommunicationPanel({ careDataVersion }) {
      const React = require('react');
      const {
        loadCommunicationSavedPhrases
      } = require('../../common/communicationSupport/localData');
      const [items, setItems] = React.useState([]);
      React.useEffect(
        () => {
          setItems(loadCommunicationSavedPhrases());
        },
        [careDataVersion]
      );
      return <div>沟通界面 {items.map(item => item.sentence).join(' ')}</div>;
    }
);
jest.mock('../../common/communicationSupport/localData', () => ({
  loadCommunicationSavedPhrases: jest.fn(() => []),
  overwriteCommunicationSavedPhrases: jest.fn(items => {
    require('../../common/communicationSupport/localData').loadCommunicationSavedPhrases.mockReturnValue(
      items
    );
  }),
  overwritePersonalImagePreferences: jest.fn()
}));
jest.mock('./Care', () => {
  const runtime = {
    identity: jest.fn(),
    watch: jest.fn(),
    request: jest.fn(),
    storage: { get: jest.fn(), set: jest.fn() },
    selectProfile: jest.fn(),
    newId: jest.fn()
  };
  return {
    __esModule: true,
    default: () => <div>设置界面</div>,
    runtime,
    localCareIdentity: () => runtime.identity()
  };
});
const flush = async () => {
  for (let i = 0; i < 35; i++) await Promise.resolve();
};

describe('patient collaboration home', () => {
  let who, tick, disk;
  beforeEach(() => {
    jest.clearAllMocks();
    require('../../common/communicationSupport/localData').loadCommunicationSavedPhrases.mockReturnValue(
      []
    );
    require('../../common/communicationSupport/localData').overwriteCommunicationSavedPhrases.mockImplementation(
      items => {
        require('../../common/communicationSupport/localData').loadCommunicationSavedPhrases.mockReturnValue(
          items
        );
      }
    );
    localStorage.clear();
    disk = {};
    who = { id: 'account' };
    runtime.identity.mockImplementation(() => who);
    runtime.storage.get.mockImplementation(async key => disk[key]);
    runtime.storage.set.mockImplementation(async (key, value) => {
      disk[key] = value;
    });
    runtime.watch.mockImplementation(callback => {
      tick = callback;
      return () => {};
    });
    runtime.selectProfile.mockResolvedValue(undefined);
    runtime.newId.mockReturnValue('operation');
  });
  async function render(role) {
    const relationship = {
      role,
      defaultMode: role === 'patient' ? 'expression' : 'receiver'
    };
    const profile = { id: 'patient', familyId: 'family', relationship };
    runtime.request.mockImplementation(async path => {
      if (path === '/care/profiles')
        return who.id === 'account' ? [profile] : [];
      if (path === '/care/context') return { selectedProfileId: 'patient' };
      if (path.endsWith('/favorites')) return { items: [] };
      return {
        ...profile,
        cursor: 1,
        permissions: ['read'],
        resources: [
          {
            id: 'favorite',
            kind: 'favorite',
            version: 1,
            seq: 1,
            value: { sentence: '首次同步收藏' }
          },
          {
            id: 'board',
            kind: 'board',
            version: 1,
            seq: 1,
            value: { name: '合成患者图库', tileIds: ['water'] }
          },
          {
            id: 'water',
            kind: 'tile',
            version: 1,
            seq: 1,
            value: { label: '喝水' }
          }
        ]
      };
    });
    let wrapper;
    await act(async () => {
      wrapper = mount(<CareHome intl={{}} />);
      await flush();
    });
    wrapper.update();
    return wrapper;
  }
  test.each([['patient', 'express'], ['relative', 'receive']])(
    'opens %s in the correct existing communication mode',
    async (role, mode) => {
      const wrapper = await render(role);
      const panel = wrapper.find(CommunicationSupportPanel);
      expect(panel.prop('initialMode')).toBe(mode);
      expect(panel.prop('boards')[0].tiles[0].label).toBe('喝水');
      expect(panel.prop('careMode')).toBe(true);
      wrapper.unmount();
    }
  );
  test('removes the previous patient immediately when switching accounts', async () => {
    const wrapper = await render('patient');
    await act(async () => {
      who = { id: 'other-account' };
      tick();
      await flush();
    });
    wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(0);
    wrapper.unmount();
  });
  test('shows favorites after the initial sync without remounting the communication panel', async () => {
    const wrapper = await render('patient');
    expect(wrapper.find(CommunicationSupportPanel).text()).toContain(
      '首次同步收藏'
    );
    wrapper.unmount();
  });
  test('restored offline profile never requests cloud synchronization on open or refresh', async () => {
    who = { id: 'offline', offline: true };
    localStorage.setItem(
      'care-offline-selection-v1',
      JSON.stringify({
        id: 'patient',
        familyId: 'family',
        relationship: { role: 'patient', defaultMode: 'expression' }
      })
    );
    disk['care-v1:offline:family:patient'] = JSON.stringify({
      cursor: -1,
      resources: {},
      queue: [],
      conflicts: [],
      media: {},
      permissions: [],
      locked: false,
      localArchive: true
    });
    let wrapper;
    await act(async () => {
      wrapper = mount(<CareHome intl={{}} />);
      await flush();
      tick();
      await flush();
    });
    wrapper.update();
    expect(runtime.request).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('修改仅保存在本机');
    expect(wrapper.text()).not.toContain('登录已失效');
    expect(wrapper.find(CommunicationSupportPanel).prop('isLogged')).toBe(
      false
    );
    wrapper.unmount();
  });

  test('saving a new favorite does not rewrite unchanged projected shared favorites', async () => {
    const wrapper = await render('patient');
    const projected = require('../../common/communicationSupport/localData').loadCommunicationSavedPhrases();
    runtime.request.mockClear();
    await act(async () => {
      await wrapper
        .find(CommunicationSupportPanel)
        .prop('onCareFavoritesChanged')([
        ...projected,
        { id: 'new-favorite', sentence: '新收藏', output: [], createdAt: 2 }
      ]);
      await flush();
    });
    const writes = runtime.request.mock.calls.filter(
      call => call[1] === 'POST'
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toEqual(
      expect.objectContaining({ resourceId: 'new-favorite', kind: 'favorite' })
    );
    wrapper.unmount();
  });
});
