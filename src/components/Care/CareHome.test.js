import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import CareHome from './CareHome';
import { runtime } from './Care';
import CommunicationSupportPanel from '../Board/CommunicationSupport/CommunicationSupportPanel.component';
import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from '../../common/communicationSupport/repository';

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
    newId: jest.fn(),
    speechSettings: jest.fn(() => ({
      rate: 1,
      voiceURI: 'synthetic-local',
      pitch: 0.9
    })),
    changeSpeechRate: jest.fn(),
    cancelSpeech: jest.fn(),
    speak: jest.fn(),
    speakExpression: jest.fn()
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
    runtime.speechSettings.mockReturnValue({
      rate: 1,
      voiceURI: 'synthetic-local',
      pitch: 0.9
    });
  });
  async function render(role, intl = {}, initialResources) {
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
        resources: initialResources || [
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
      wrapper = mount(<CareHome intl={intl} />);
      await flush();
    });
    wrapper.update();
    return wrapper;
  }
  test('Care display callback rejects a silent failed write before applying the new display', async () => {
    const wrapper = await render('patient');
    const before = wrapper.find(CommunicationSupportPanel).prop('displaySettings');
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => false);
    try {
      await act(async () => {
        await expect(Promise.resolve().then(() => wrapper.find(CommunicationSupportPanel).prop('onChangeDisplaySettings')({ ...before, fontSize: 'ExtraLarge' }))).rejects.toThrow();
      });
      wrapper.update();
      expect(wrapper.find(CommunicationSupportPanel).prop('displaySettings').fontSize).toBe(before.fontSize);
    } finally { set.mockRestore(); wrapper.unmount(); }
  });
  test('does not publish a new workspace before profile sync and scoped settings finish', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const profile = { id: 'patient', familyId: 'family', relationship: { role: 'patient', defaultMode: 'expression' } };
    runtime.request.mockImplementation(async path => {
      if(path==='/care/profiles')return [profile];
      if(path==='/care/context')return {selectedProfileId:profile.id};
      if(path.endsWith('/favorites'))return {items:[]};
      return pending;
    });
    let wrapper;
    await act(async()=>{wrapper=mount(<CareHome intl={{}}/>);await flush();});wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(0);
    await act(async()=>{finish({...profile,cursor:1,permissions:['read'],resources:[{id:'fontSize',kind:'preference',version:1,seq:1,value:{value:'large'}}]});await flush();});wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(1);
    expect(wrapper.find(CommunicationSupportPanel).prop('displaySettings').fontSize).toBe('Large');
    wrapper.unmount();
  });
  test('Care speech override survives reopening this profile without changing the global speech setting', async () => {
    const wrapper = await render('patient');
    await act(async () => { await wrapper.find(CommunicationSupportPanel).prop('onChangeSpeechRate')(1.3); });
    wrapper.update();
    expect(runtime.changeSpeechRate).not.toHaveBeenCalled();
    expect(wrapper.find(CommunicationSupportPanel).prop('speechSettings').rate).toBe(1.3);
    wrapper.unmount();
    const reopened = await render('patient');
    expect(reopened.find(CommunicationSupportPanel).prop('speechSettings').rate).toBe(1.3);
    reopened.unmount();
  });
  test('background refresh does not reopen the previous profile after the user requests the picker', async () => {
    const wrapper=await render('patient');
    const stale=wrapper.find(CommunicationSupportPanel).prop('onSaveCareDevicePreferences');
    await act(async()=>{wrapper.find('button').filterWhere(n=>n.text()==='切换患者档案').simulate('click');await flush();});wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(0);
    await act(async()=>{tick();await flush();});wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(0);
    expect(()=>stale({fontSize:'extra-large'})).toThrow('档案已切换');
    wrapper.unmount();
  });
  test('passes the opening generation guard to profile selection when B overtakes A', async () => {
    const profiles = ['a', 'b'].map(id => ({
      id: `patient-${id}`,
      familyId: `family-${id}`,
      relationship: { role: 'patient', defaultMode: 'expression' }
    }));
    const pending = {};
    runtime.selectProfile.mockImplementation(
      (profile, isCurrent) =>
        new Promise(resolve => {
          pending[profile.id] = { resolve, isCurrent };
        })
    );
    runtime.request.mockImplementation(async path => {
      if (path === '/care/profiles') return profiles;
      if (path === '/care/context') return { selectedProfileId: null };
      if (path.endsWith('/favorites')) return { items: [] };
      const profile = profiles.find(item => path.includes(item.id));
      return {
        ...profile,
        cursor: 1,
        permissions: ['read'],
        resources: [{
          id: 'favorite', kind: 'favorite', version: 1, seq: 1,
          value: { sentence: `当前工作区 ${profile.id}` }
        }]
      };
    });
    let wrapper;
    await act(async () => {
      wrapper = mount(<CareHome intl={{}} />);
      await flush();
    });
    wrapper.update();
    const choices = wrapper
      .find('button')
      .filterWhere(node => node.text() === '进入');
    await act(async () => {
      choices.at(0).simulate('click');
      choices.at(1).simulate('click');
      await flush();
    });
    expect(pending['patient-a'].isCurrent()).toBe(false);
    expect(pending['patient-b'].isCurrent()).toBe(true);
    await act(async () => {
      pending['patient-b'].resolve(true);
      await flush();
    });
    wrapper.update();
    expect(wrapper.text()).toContain('当前工作区 patient-b');
    await act(async () => {
      pending['patient-a'].resolve(false);
      await flush();
    });
    wrapper.update();
    expect(wrapper.text()).toContain('当前工作区 patient-b');
    expect(wrapper.text()).not.toContain('当前工作区 patient-a');
    wrapper.unmount();
  });
  test('a delayed initial role choice cannot replace a newer account workspace', async () => {
    let finishChoice;
    const oldProfile = { id: 'old-patient', familyId: 'old-family' };
    const newProfile = {
      id: 'new-patient',
      familyId: 'new-family',
      relationship: { role: 'patient', defaultMode: 'expression' }
    };
    runtime.request.mockImplementation(async (path, method) => {
      if (method === 'POST' && path.includes('/old-patient/commands'))
        return new Promise(resolve => { finishChoice = resolve; });
      if (path === '/care/profiles')
        return who.id === 'account' ? [oldProfile] : [newProfile];
      if (path === '/care/context')
        return { selectedProfileId: who.id === 'account' ? null : newProfile.id };
      if (path.endsWith('/favorites')) return { items: [] };
      const profile = path.includes('new-patient') ? newProfile : oldProfile;
      return {
        ...profile,
        cursor: 1,
        permissions: ['read'],
        resources: [{
          id: 'favorite', kind: 'favorite', version: 1, seq: 1,
          value: { sentence: profile.id === newProfile.id ? '新账号工作区' : '过期工作区' }
        }]
      };
    });
    let wrapper;
    await act(async () => { wrapper = mount(<CareHome intl={{}} />); await flush(); });
    wrapper.update();
    await act(async () => {
      wrapper.find('button').filterWhere(n => n.text() === '我是患者，进入表达').simulate('click');
      await flush();
    });
    await act(async () => {
      who = { id: 'new-account', token: 'new-token' };
      tick();
      await flush();
    });
    wrapper.update();
    expect(wrapper.text()).toContain('新账号工作区');
    await act(async () => {
      finishChoice({ relationship: { role: 'patient', defaultMode: 'expression' } });
      await flush();
    });
    wrapper.update();
    expect(runtime.selectProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: oldProfile.id }),
      expect.any(Function)
    );
    expect(wrapper.text()).toContain('新账号工作区');
    expect(wrapper.text()).not.toContain('过期工作区');
    wrapper.unmount();
  });
  test('a delayed initial role error cannot overwrite the notice after a token and profile switch', async () => {
    let failChoice;
    const oldProfile = { id: 'old-patient', familyId: 'old-family' };
    const newProfile = {
      id: 'new-patient',
      familyId: 'new-family',
      relationship: { role: 'patient', defaultMode: 'expression' }
    };
    runtime.request.mockImplementation(async (path, method) => {
      if (method === 'POST' && path.includes('/old-patient/commands'))
        return new Promise((_, reject) => { failChoice = reject; });
      if (path === '/care/profiles') return who.token === 'new-token' ? [newProfile] : [oldProfile];
      if (path === '/care/context') return { selectedProfileId: who.token === 'new-token' ? newProfile.id : null };
      if (path.endsWith('/favorites')) return { items: [] };
      return { ...newProfile, cursor: 1, permissions: ['read'], resources: [] };
    });
    who = { id: 'account', token: 'old-token' };
    let wrapper;
    await act(async () => { wrapper = mount(<CareHome intl={{}} />); await flush(); });
    wrapper.update();
    await act(async () => {
      wrapper.find('button').filterWhere(n => n.text() === '我是患者，进入表达').simulate('click');
      await flush();
    });
    await act(async () => {
      who = { id: 'account', token: 'new-token' };
      tick();
      await flush();
    });
    wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(1);
    await act(async () => { failChoice(new Error('过期身份选择失败')); await flush(); });
    wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(1);
    expect(wrapper.text()).not.toContain('过期身份选择失败');
    wrapper.unmount();
  });
  test('a delayed initial role response after unmount does not open a profile', async () => {
    let finishChoice;
    const profile = { id: 'old-patient', familyId: 'old-family' };
    runtime.request.mockImplementation(async (path, method) => {
      if (method === 'POST') return new Promise(resolve => { finishChoice = resolve; });
      if (path === '/care/profiles') return [profile];
      if (path === '/care/context') return { selectedProfileId: null };
      return { items: [] };
    });
    let wrapper;
    await act(async () => { wrapper = mount(<CareHome intl={{}} />); await flush(); });
    wrapper.update();
    await act(async () => {
      wrapper.find('button').filterWhere(n => n.text() === '我是患者，进入表达').simulate('click');
      await flush();
    });
    wrapper.unmount();
    await act(async () => {
      finishChoice({ relationship: { role: 'patient', defaultMode: 'expression' } });
      await flush();
    });
    expect(runtime.selectProfile).not.toHaveBeenCalled();
  });
  test.each(['success', 'error'])(
    'a delayed %s from profile A cannot replace profile B under the same identity',
    async outcome => {
      const profiles = ['a', 'b'].map(id => ({
        id: `patient-${id}`,
        familyId: `family-${id}`
      }));
      const pending = {};
      runtime.request.mockImplementation(async (path, method) => {
        if (method === 'POST' && path.endsWith('/commands')) {
          const id = profiles.find(item => path.includes(item.id)).id;
          return new Promise((resolve, reject) => {
            pending[id] = { resolve, reject };
          });
        }
        if (path === '/care/profiles') return profiles;
        if (path === '/care/context') return { selectedProfileId: null };
        if (path.endsWith('/favorites')) return { items: [] };
        const profile = profiles.find(item => path.includes(item.id));
        return {
          ...profile,
          relationship: { role: 'patient', defaultMode: 'expression' },
          cursor: 1,
          permissions: ['read'],
          resources: [
            {
              id: 'favorite',
              kind: 'favorite',
              version: 1,
              seq: 1,
              value: { sentence: `当前工作区 ${profile.id}` }
            }
          ]
        };
      });
      who = { id: 'account', token: 'same-token' };
      let wrapper;
      await act(async () => {
        wrapper = mount(<CareHome intl={{}} />);
        await flush();
      });
      wrapper.update();
      const choices = wrapper
        .find('button')
        .filterWhere(node => node.text() === '我是患者，进入表达');
      await act(async () => {
        choices.at(0).simulate('click');
        choices.at(1).simulate('click');
        await flush();
      });
      await act(async () => {
        pending['patient-b'].resolve({
          relationship: { role: 'patient', defaultMode: 'expression' }
        });
        await flush();
      });
      wrapper.update();
      expect(wrapper.text()).toContain('当前工作区 patient-b');
      if (outcome === 'success') {
        await act(async () => {
          pending['patient-a'].resolve({
            relationship: { role: 'patient', defaultMode: 'expression' }
          });
          await flush();
        });
      } else {
        await act(async () => {
          pending['patient-a'].reject(new Error('过期 A 身份选择失败'));
          await flush();
        });
      }
      wrapper.update();
      expect(runtime.selectProfile).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'patient-b' }),
        expect.any(Function)
      );
      expect(runtime.selectProfile).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'patient-a' }),
        expect.any(Function)
      );
      expect(wrapper.text()).toContain('当前工作区 patient-b');
      expect(wrapper.text()).not.toContain('过期 A 身份选择失败');
      wrapper.unmount();
    }
  );
  test('combined Care preferences are saved in one scoped flow and stale profile callbacks are refused', async () => {
    const wrapper = await render('patient');
    const save = wrapper.find(CommunicationSupportPanel).prop('onSaveCareDevicePreferences');
    await act(async () => { save({ fontSize: 'extra-large', gridColumns: 2, speechRate: 0.7 }); });
    wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel).prop('displaySettings')).toMatchObject({ fontSize: 'ExtraLarge', uiSize: 'ExtraLarge' });
    expect(wrapper.find(CommunicationSupportPanel).prop('speechSettings').rate).toBe(0.7);
    const before = { ...localStorage };
    who = { id: 'synthetic-other-account' };
    expect(() => save({ fontSize: 'normal', speechRate: 1 })).toThrow('档案已切换');
    expect({ ...localStorage }).toEqual(before);
    expect(runtime.changeSpeechRate).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  test('an existing patient keeps its own library while seeing the 15 updated bundled words', async () => {
    const messages = require('../../translations/zh-CN.communication').default;
    const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
    const fixture = require('../../common/communicationSupport/fixtures/builtin15Reuse.json');
    const {
      matchTextToCommunicationTiles
    } = require('../../common/communicationSupport/symbolMatching');
    const wrapper = await render('relative', intl);
    const boards = wrapper.find(CommunicationSupportPanel).prop('boards');
    for (const card of fixture.cards)
      for (const token of card.tokens) {
        const result = matchTextToCommunicationTiles(token, boards, { intl });
        expect(result.matches[0].tile.id).toBe(card.id);
      }
    expect(boards.find(board => board.id === 'board').tiles[0].label).toBe(
      '喝水'
    );
    expect(
      runtime.request.mock.calls.filter(call => call[1] === 'POST')
    ).toHaveLength(0);
    wrapper.unmount();
  });
  test.each([['patient', 'express'], ['relative', 'receive']])(
    'opens %s in the correct existing communication mode',
    async (role, mode) => {
      const wrapper = await render(role);
      const panel = wrapper.find(CommunicationSupportPanel);
      expect(panel.prop('initialMode')).toBe(mode);
      expect(panel.prop('accountId')).toBe('account');
      expect(
        panel.prop('boards').find(board => board.id === 'board').tiles[0].label
      ).toBe('喝水');
      expect(
        panel.prop('boards').find(board => board.id === 'root').tiles
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: '帮帮我' })])
      );
      expect(
        runtime.request.mock.calls.filter(call => call[1] === 'POST')
      ).toHaveLength(0);
      expect(panel.prop('careMode')).toBe(true);
      wrapper.unmount();
    }
  );

  test('shows bundled CBoard boards for an empty patient library without queuing them', async () => {
    const profile = {
      id: 'empty-patient',
      familyId: 'family',
      relationship: { role: 'patient', defaultMode: 'expression' }
    };
    runtime.request.mockImplementation(async path => {
      if (path === '/care/profiles') return [profile];
      if (path === '/care/context') return { selectedProfileId: profile.id };
      return {
        ...profile,
        cursor: 1,
        permissions: ['read'],
        resources: []
      };
    });
    let wrapper;
    await act(async () => {
      wrapper = mount(<CareHome intl={{}} />);
      await flush();
    });
    wrapper.update();
    const panel = wrapper.find(CommunicationSupportPanel);
    expect(panel).toHaveLength(1);
    expect(panel.prop('boards')).toHaveLength(46);
    expect(panel.prop('boards')[0]).toEqual(
      expect.objectContaining({ id: 'root' })
    );
    expect(panel.prop('boards')[0].tiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: '帮帮我' })])
    );
    expect(
      runtime.request.mock.calls.filter(call => call[1] === 'POST')
    ).toHaveLength(0);
    expect(
      localStorage.getItem('care-projection-v1:account:family:empty-patient')
    ).toBeNull();
    wrapper.unmount();
  });

  test('saves a personal board without copying bundled boards into the patient queue', async () => {
    const profile = {
      id: 'empty-patient',
      familyId: 'family',
      relationship: { role: 'patient', defaultMode: 'expression' }
    };
    runtime.request.mockImplementation(async path => {
      if (path === '/care/profiles') return [profile];
      if (path === '/care/context') return { selectedProfileId: profile.id };
      return {
        ...profile,
        cursor: 1,
        permissions: ['read', 'library.edit'],
        resources: []
      };
    });
    let wrapper;
    await act(async () => {
      wrapper = mount(<CareHome intl={{}} />);
      await flush();
    });
    wrapper.update();
    runtime.request.mockClear();
    await act(async () => {
      await wrapper
        .find(CommunicationSupportPanel)
        .prop('onCreateCommunicationBoard')({
        id: 'device_private_board_test',
        name: '我的图板',
        tiles: []
      });
      await flush();
    });
    const writes = runtime.request.mock.calls.filter(
      call => call[1] === 'POST'
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toEqual(
      expect.objectContaining({
        resourceId: 'device_private_board_test',
        kind: 'board'
      })
    );
    expect(writes[0][2].resourceId).not.toBe('root');
    wrapper.unmount();
  });

  test('syncs a favorite with a bundled image reference without uploading media', async () => {
    const profile = {
      id: 'empty-patient',
      familyId: 'family',
      relationship: { role: 'patient', defaultMode: 'expression' }
    };
    runtime.request.mockImplementation(async path => {
      if (path === '/care/profiles') return [profile];
      if (path === '/care/context') return { selectedProfileId: profile.id };
      return {
        ...profile,
        cursor: 1,
        permissions: ['read'],
        resources: []
      };
    });
    const defaultImage = require('../../api/boards.json')
      .advanced.find(board => board.id === 'root')
      .tiles.find(tile => tile.id === 'pi-home-help').image;
    let wrapper;
    await act(async () => {
      wrapper = mount(<CareHome intl={{}} />);
      await flush();
    });
    wrapper.update();
    runtime.request.mockClear();
    await act(async () => {
      await wrapper
        .find(CommunicationSupportPanel)
        .prop('onCareFavoritesChanged')([
        {
          id: 'favorite-with-builtin',
          sentence: '帮帮我',
          output: [
            {
              id: 'pi-home-help',
              label: '帮帮我',
              image: defaultImage
            }
          ],
          createdAt: 1
        }
      ]);
      await flush();
    });
    const writes = runtime.request.mock.calls.filter(
      call => call[1] === 'POST'
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('/commands');
    expect(writes[0][2]).toEqual(
      expect.objectContaining({
        kind: 'favorite',
        resourceId: 'favorite-with-builtin',
        value: expect.objectContaining({
          output: [
            expect.objectContaining({
              builtinImage: {
                catalog: 'cboard-default-v1',
                boardId: 'root',
                tileId: 'pi-home-help'
              }
            })
          ]
        })
      })
    );
    expect(
      runtime.request.mock.calls.some(call => call[0].endsWith('/media'))
    ).toBe(false);
    expect(wrapper.text()).not.toContain('图片需先保存到本机');
    wrapper.unmount();
  });
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
  test('projects downloaded boards while showing a permanent upload failure', async () => {
    const wrapper = await render('patient');
    const key = 'care-v1:account:family:patient';
    const saved = JSON.parse(disk[key]);
    saved.media.invalid = {
      mediaId: 'invalid',
      data: 'local-original',
      pending: true
    };
    disk[key] = JSON.stringify(saved);
    const previousRequest = runtime.request.getMockImplementation();
    runtime.request.mockImplementation(async (path, method, body) => {
      if (method === 'POST' && path.endsWith('/media'))
        throw { status: 400, data: { code: 'INVALID_MEDIA' } };
      const result = await previousRequest(path, method, body);
      if (!result.resources) return result;
      return {
        ...result,
        cursor: 2,
        resources: result.resources.map(resource =>
          resource.id === 'water'
            ? {
                ...resource,
                version: 2,
                seq: 2,
                value: { label: '另一设备更新的喝水图卡' }
              }
            : resource
        )
      };
    });
    await act(async () => {
      tick();
      await flush();
    });
    wrapper.update();
    expect(wrapper.text()).toContain('已暂停此图片的自动上传');
    expect(
      wrapper
        .find(CommunicationSupportPanel)
        .prop('boards')
        .find(board => board.id === 'board').tiles[0].label
    ).toBe('另一设备更新的喝水图卡');
    expect(JSON.parse(disk[key]).media.invalid.data).toBe('local-original');
    expect(JSON.parse(disk[key]).media.invalid.pending).toBe(true);
    wrapper.unmount();
  });
  test('shows favorites after the initial sync without remounting the communication panel', async () => {
    const wrapper = await render('patient');
    expect(wrapper.find(CommunicationSupportPanel).text()).toContain(
      '首次同步收藏'
    );
    wrapper.unmount();
  });

  test('care projection capacity overflow preserves 99 local phrases, displays its reason and allows retry', async () => {
    const phrases = Array.from({ length: 101 }, (_, index) => ({
      id: `care-capacity-${index}`, sentence: `合成同步${index}`, createdAt: index + 1,
      output: [{ id: 'shape', label: '几何图', personId: `synthetic-${index}` }]
    }));
    const values = new Map([[COMMUNICATION_STORAGE_KEYS.savedPhrases, JSON.stringify(phrases.slice(0, 99))]]);
    const repository = createCommunicationRepository({ storage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    }, now: () => 1000 });
    const local = require('../../common/communicationSupport/localData');
    local.loadCommunicationSavedPhrases.mockImplementation(() => repository.loadCommunicationSavedPhrases());
    local.overwriteCommunicationSavedPhrases.mockImplementation(items => repository.overwriteCommunicationSavedPhrases(items));
    const before = repository.readFavoriteState();
    const resources = phrases.map(item => ({ id: item.id, kind: 'favorite', version: 1, seq: 1, value: item }));
    const wrapper = await render('patient', {}, resources.slice(0, 99));
    const baselineRequest = runtime.request.getMockImplementation();
    runtime.request.mockImplementation(async (...args) => {
      const result = await baselineRequest(...args);
      return result.resources ? { ...result, cursor: 2, resources: resources.map(item => ({ ...item, seq: 2, version: 2 })) } : result;
    });
    const current = repository.readFavoriteState();
    await act(async () => { tick(); await flush(); });
    wrapper.update();
    expect(wrapper.text()).toContain('容量上限');
    expect(repository.readFavoriteState()).toEqual(current);
    const previous = runtime.request.getMockImplementation();
    runtime.request.mockImplementation(async (...args) => {
      const result = await previous(...args);
      return result.resources ? { ...result, cursor: 3, resources: result.resources.map(item =>
        item.id === 'care-capacity-100' ? { ...item, deleted: true, version: 3, seq: 3 } : item
      ) } : result;
    });
    await act(async () => { tick(); await flush(); });
    wrapper.update();
    expect(wrapper.text()).not.toContain('容量上限');
    const saved = repository.loadCommunicationSavedPhrases();
    expect(saved).toHaveLength(100);
    for (const item of before.phrases) expect(saved.find(value => value.id === item.id)).toEqual(item);
    wrapper.unmount();
  });

  test.each(['local', 'pending'])('care rejects a 101-item %s batch before cloud mutation and preserves its retry state', async source => {
    const phrases = Array.from({ length: 101 }, (_, index) => ({ id: `full-${index}`, sentence: `合成满额${index}`, output: [], createdAt: index + 1 }));
    const local = require('../../common/communicationSupport/localData');
    const current = source === 'local' ? phrases : phrases.slice(0, 100);
    local.loadCommunicationSavedPhrases.mockReturnValue(current);
    const key = 'care-projection-v1:account:family:patient';
    const pending = JSON.stringify({ favorites: phrases, favoritesBase: [] });
    if (source === 'pending') localStorage.setItem(key, pending);
    const wrapper = await render('patient');
    expect(wrapper.text()).toContain('容量上限');
    expect(local.loadCommunicationSavedPhrases()).toEqual(current);
    expect(local.overwriteCommunicationSavedPhrases).not.toHaveBeenCalled();
    expect(runtime.request.mock.calls.map(call => call[0])).toEqual(['/care/profiles', '/care/context']);
    if (source === 'pending') expect(localStorage.getItem(key)).toBe(pending);
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
    });
    await act(async () => {
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

  test('restores the current account profile list and switches cached content while offline', async () => {
    const profiles = ['a', 'b'].map(id => ({
      id,
      familyId: 'family-' + id,
      name: id,
      relationship: { role: 'patient', defaultMode: 'expression' }
    }));
    disk['care-list-v1:account'] = JSON.stringify({ profiles, families: [] });
    disk['care-list-v1:other'] = JSON.stringify({
      profiles: [{ id: 'private-other-account', familyId: 'other' }]
    });
    localStorage.setItem(
      'care-selection-v1:account',
      JSON.stringify(profiles[0])
    );
    for (const profile of profiles)
      disk[
        `care-v1:account:${profile.familyId}:${profile.id}`
      ] = JSON.stringify({
        cursor: 1,
        permissions: ['read'],
        relationship: profile.relationship,
        locked: false,
        queue: [],
        conflicts: [],
        media: {},
        resources: {
          'favorite:one': {
            kind: 'favorite',
            id: 'one',
            version: 1,
            value: { sentence: 'only-' + profile.id, output: [], createdAt: 1 }
          }
        }
      });
    runtime.request.mockRejectedValue(new Error('offline'));
    let wrapper;
    await act(async () => {
      wrapper = mount(<CareHome />);
      await flush();
    });
    wrapper.update();
    expect(wrapper.text()).toContain('only-a');
    await act(async () => {
      wrapper
        .find('button')
        .filterWhere(b => b.text() === '切换患者档案')
        .simulate('click');
      await flush();
    });
    wrapper.update();
    expect(
      wrapper.find('button').filterWhere(b => b.text() === '进入')
    ).toHaveLength(2);
    expect(wrapper.text()).not.toContain('private-other-account');
    await act(async () => {
      wrapper
        .find('button')
        .filterWhere(b => b.text() === '进入')
        .at(1)
        .simulate('click');
      await flush();
    });
    wrapper.update();
    expect(wrapper.text()).toContain('only-b');
    expect(wrapper.text()).not.toContain('only-a');
    expect(runtime.selectProfile).toHaveBeenLastCalledWith(profiles[1], expect.any(Function));
    wrapper.unmount();
  });

  test('successful profile loading populates the shared account-scoped list cache', async () => {
    const wrapper = await render('patient');
    expect(JSON.parse(disk['care-list-v1:account']).profiles[0].id).toBe(
      'patient'
    );
    wrapper.unmount();
  });

  test.each([401, 403])(
    'does not reopen cached data after explicit HTTP %s',
    async status => {
      const profile = {
        id: 'cached-patient',
        familyId: 'family',
        relationship: { role: 'patient' }
      };
      disk['care-list-v1:account'] = JSON.stringify({ profiles: [profile] });
      localStorage.setItem(
        'care-selection-v1:account',
        JSON.stringify(profile)
      );
      runtime.request.mockRejectedValue(
        Object.assign(new Error('access denied'), { status })
      );
      let wrapper;
      await act(async () => {
        wrapper = mount(<CareHome />);
        await flush();
      });
      wrapper.update();
      expect(runtime.selectProfile).not.toHaveBeenCalled();
      expect(wrapper.find(CommunicationSupportPanel)).toHaveLength(0);
      expect(wrapper.text()).not.toContain('cached-patient');
      wrapper.unmount();
    }
  );

  test('saving a new favorite does not rewrite unchanged projected shared favorites', async () => {
    const wrapper = await render('patient');
    const projected = require('../../common/communicationSupport/localData').loadCommunicationSavedPhrases();
    runtime.request.mockClear();
    await act(async () => {
      await wrapper
        .find(CommunicationSupportPanel)
        .prop('onCareFavoritesChanged')([
        ...projected.map(item => ({
          ...item,
          usageCount: 1,
          lastUsedAt: 3,
          updatedAt: 3
        })),
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
  test('recent usage persists in the patient scope and never creates a cloud operation', async () => {
    let wrapper = await render('patient');
    runtime.request.mockClear();
    await act(async () => {
      wrapper.find(CommunicationSupportPanel).prop('onPictogramUsed')(
        'board',
        'water'
      );
    });
    wrapper.update();
    expect(
      wrapper.find(CommunicationSupportPanel).prop('pictogramOrdering')
        .usageByTileKey['board:water'].count
    ).toBe(1);
    expect(runtime.request).not.toHaveBeenCalled();
    wrapper.unmount();
    wrapper = await render('patient');
    expect(
      wrapper.find(CommunicationSupportPanel).prop('pictogramOrdering')
        .usageByTileKey['board:water'].count
    ).toBe(1);
    expect(
      localStorage.getItem(
        'communication-v2:account:family:patient:cboard_communication_pictogram_ordering_v1'
      )
    ).toContain('board:water');
    expect(
      localStorage.getItem(
        'communication-v2:other:family:patient:cboard_communication_pictogram_ordering_v1'
      )
    ).toBeNull();
    wrapper.unmount();
  });
  test('a later family default refresh applies only where this device has no override', async () => {
    const wrapper = await render('patient');
    const original = runtime.request.getMockImplementation();
    let rate = 0.7, version = 2;
    runtime.request.mockImplementation(async (...args) => {
      const result = await original(...args);
      return result.resources ? { ...result, cursor: version, resources: [...result.resources,
        { id: 'speechRate', kind: 'preference', version, seq: version, value: { value: rate } }
      ] } : result;
    });
    await act(async () => { tick(); await flush(); });
    wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel).prop('speechSettings').rate).toBe(0.7);
    await act(async () => { wrapper.find(CommunicationSupportPanel).prop('onChangeSpeechRate')(1.3); });
    rate = 1; version = 3;
    await act(async () => { tick(); await flush(); });
    wrapper.update();
    expect(wrapper.find(CommunicationSupportPanel).prop('speechSettings').rate).toBe(1.3);
    expect(runtime.changeSpeechRate).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  test('Care uses device speech settings and passes the saved phrase audio output to the original playback chain', async () => {
    const wrapper = await render('patient');
    const panel = wrapper.find(CommunicationSupportPanel);
    expect(panel.prop('speechSettings')).toMatchObject({
      voiceURI: 'synthetic-local',
      pitch: 0.9
    });
    let finish;
    runtime.speakExpression.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const done = jest.fn(),
      audio = [{ id: 'water', sound: 'data:audio/wav;base64,AA==' }];
    const playing = panel.prop('onSpeak')('喝水', done, audio);
    expect(done).not.toHaveBeenCalled();
    expect(runtime.speakExpression).toHaveBeenCalledWith('喝水', audio, 1);
    finish();
    await playing;
    expect(done).toHaveBeenCalledTimes(1);
    runtime.request.mockClear();
    await act(async () => {
      panel.prop('onChangeSpeechRate')(0.8);
    });
    wrapper.update();
    expect(runtime.changeSpeechRate).not.toHaveBeenCalled();
    expect(wrapper.find(CommunicationSupportPanel).prop('speechSettings').rate).toBe(0.8);
    expect(runtime.request).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  test('same-profile local recordings survive a projection and remount while cloud deletions stay deleted', async () => {
    const key = 'care-projection-v1:account:family:patient:tile-media';
    const sound = 'data:audio/wav;base64,c3ludGhldGlj';
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: 'board',
          tiles: [{ id: 'water', sound }, { id: 'removed', sound }]
        }
      ])
    );
    let wrapper = await render('patient');
    const card = () =>
      wrapper
        .find(CommunicationSupportPanel)
        .prop('boards')
        .find(b => b.id === 'board');
    expect(card().tiles.map(t => t.id)).toEqual(['water']);
    expect(card().tiles[0].sound).toBe(sound);
    const previous = runtime.request.getMockImplementation();
    runtime.request.mockImplementation(async (...args) => {
      const result = await previous(...args);
      if (!result.resources) return result;
      return {
        ...result,
        cursor: 2,
        resources: result.resources.map(r =>
          r.id === 'water' ? { ...r, seq: 2, version: 2, deleted: true } : r
        )
      };
    });
    await act(async () => {
      tick();
      await flush();
    });
    wrapper.update();
    expect(card().tiles).toEqual([]);
    wrapper.unmount();
    await act(async () => {
      wrapper = mount(<CareHome intl={{}} />);
      await flush();
    });
    wrapper.update();
    // Reopen against the same authoritative deletion, rather than resetting the server fixture.
    expect(card().tiles).toEqual([]);
    expect(JSON.stringify(runtime.request.mock.calls)).not.toContain(sound);
    wrapper.unmount();
  });
  test('editing a recorded card keeps a stable local copy and only queues supported cloud fields', async () => {
    const wrapper = await render('patient');
    const sound = 'data:audio/wav;base64,c3ludGhldGlj';
    const current = runtime.request.getMockImplementation();
    runtime.request.mockImplementation(async (...args) => {
      const result = await current(...args);
      return result.resources
        ? { ...result, permissions: ['read', 'library.edit'] }
        : result;
    });
    await act(async () => {
      tick();
      await flush();
    });
    wrapper.update();
    const board = wrapper
      .find(CommunicationSupportPanel)
      .prop('boards')
      .find(b => b.id === 'board');
    await act(async () => {
      await wrapper
        .find(CommunicationSupportPanel)
        .prop('onUpdateCommunicationBoard')({
        ...board,
        tiles: board.tiles.map(t => ({ ...t, sound }))
      });
      await flush();
    });
    wrapper.update();
    expect(
      wrapper
        .find(CommunicationSupportPanel)
        .prop('boards')
        .find(b => b.id === 'board').tiles[0].sound
    ).toBe(sound);
    expect(
      localStorage.getItem(
        'care-projection-v1:account:family:patient:tile-media'
      )
    ).toContain(sound);
    expect(JSON.stringify(runtime.request.mock.calls)).not.toContain(sound);
    wrapper.unmount();
    let reopened;
    await act(async () => {
      reopened = mount(<CareHome intl={{}} />);
      await flush();
    });
    reopened.update();
    expect(
      reopened
        .find(CommunicationSupportPanel)
        .prop('boards')
        .find(b => b.id === 'board').tiles[0].sound
    ).toBe(sound);
    reopened.unmount();
  });
});
