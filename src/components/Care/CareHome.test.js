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
  async function render(role, intl = {}) {
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
      wrapper = mount(<CareHome intl={intl} />);
      await flush();
    });
    wrapper.update();
    return wrapper;
  }
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
    expect(runtime.selectProfile).toHaveBeenLastCalledWith(profiles[1]);
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
    expect(runtime.changeSpeechRate).toHaveBeenCalledWith(0.8);
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
