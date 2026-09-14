import React, { useEffect, useRef, useState } from 'react';
import { injectIntl } from 'react-intl';
import { createCareSync } from '../../common/communicationSupport/careSync';
import {
  projectCareBoards,
  queueCareBoards
} from '../../common/communicationSupport/careProjection';
import {
  loadCommunicationSavedPhrases,
  overwriteCommunicationSavedPhrases,
  overwritePersonalImagePreferences
} from '../../common/communicationSupport/localData';
import CommunicationSupportPanel from '../Board/CommunicationSupport/CommunicationSupportPanel.component';
import Care, { runtime, localCareIdentity } from './Care';
import {
  encodeCareMedia,
  decodeCareMedia
} from '../../common/communicationSupport/careMediaValues';
import { toByteArray, fromByteArray } from 'base64-js';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { careErrorMessage } from '../../common/communicationSupport/careErrors';

const mediaImage = asset => `data:${asset.type};base64,${asset.data}`;
const favoriteContent = item => {
  const { usageCount, lastUsedAt, updatedAt, ...content } = item;
  return JSON.stringify(content);
};
async function readImage(source) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(source);
  if (match)
    return {
      data: match[2],
      type: match[1],
      sha256: bytesToHex(sha256(toByteArray(match[2])))
    };
  if (source.startsWith('blob:')) {
    const blob = await (await fetch(source)).blob();
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
      blob.size > 4 * 1024 * 1024
    )
      throw new Error('图片格式或大小不受支持');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      data: fromByteArray(bytes),
      type: blob.type,
      sha256: bytesToHex(sha256(bytes))
    };
  }
  throw new Error('请先将图片保存到本机，再同步到患者图库');
}

function CareHome({ intl }) {
  const [accountId, setAccountId] = useState(localCareIdentity()?.id);
  const [profiles, setProfiles] = useState([]);
  const [active, setActive] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [projectionVersion, setProjectionVersion] = useState(0);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState('正在读取患者档案');
  const [output, setOutput] = useState([]);
  const [display, setDisplay] = useState({});
  const [selectedBoard, setSelectedBoard] = useState(null);
  const engine = useRef(null);
  const settingsOpen = useRef(false);
  const syncing = useRef(Promise.resolve());
  const mounted = useRef(true);
  const actions = useRef(null);
  const who = localCareIdentity();
  const valid = who?.id === accountId;

  async function open(profile) {
    const identity = localCareIdentity();
    if (!identity) return;
    await runtime.selectProfile(profile);
    setActive({ ...profile, accountId: identity.id });
    setSnapshot(null);
    setOutput([]);
    setSelectedBoard(null);
    const instance = createCareSync({
      accountId: identity.id,
      profileId: profile.id,
      familyId: profile.familyId,
      storage: runtime.storage,
      request: runtime.request,
      newId: runtime.newId,
      personalFavorites: true,
      currentAccount: () => localCareIdentity()?.id,
      changed: () => {
        if (
          !mounted.current ||
          engine.current !== instance ||
          localCareIdentity()?.id !== identity.id
        )
          return;
        setSnapshot(instance.view());
      }
    });
    engine.current = instance;
    instance.localKey = `care-projection-v1:${identity.id}:${
      profile.familyId
    }:${profile.id}`;
    instance.localRole = profile.relationship?.role;
    instance.accountId = identity.id;
    await instance.init();
    try {
      setDisplay(
        JSON.parse(localStorage.getItem(`${instance.localKey}:display`) || '{}')
      );
    } catch (_) {
      setDisplay({});
    }
    await sync();
  }
  function sync() {
    const task = syncing.current.then(synchronize);
    syncing.current = task.catch(() => {});
    return task;
  }
  async function synchronize() {
    const instance = engine.current;
    if (!instance) return;
    try {
      const raw = localStorage.getItem(instance.localKey);
      if (raw) {
        const pending = JSON.parse(raw);
        if (pending.boards)
          await queueCareBoards(instance, pending.boards, readImage);
        if (pending.favorites) {
          const kind =
            instance.localRole === 'patient' ? 'favorite' : 'personalFavorite';
          for (const item of pending.favorites) {
            const baseline = pending.favoritesBase?.find(
              old => old.id === item.id
            );
            if (baseline && favoriteContent(baseline) === favoriteContent(item))
              continue;
            const value = await encodeCareMedia(item, instance, readImage);
            const old = instance.view().resources[`${kind}:${item.id}`];
            if (!old || JSON.stringify(old.value) !== JSON.stringify(value))
              await instance.edit(kind, item.id, value);
          }
          const ids = new Set(pending.favorites.map(item => item.id));
          for (const r of Object.values(instance.view().resources))
            if (
              r.kind === kind &&
              !r.deleted &&
              !ids.has(r.id) &&
              (!pending.favoritesBase ||
                pending.favoritesBase.some(item => item.id === r.id))
            )
              await instance.edit(kind, r.id, null, 'delete');
        }
        if (pending.personalImages) {
          const value = {
            value: await encodeCareMedia(
              pending.personalImages,
              instance,
              readImage
            )
          };
          if (
            JSON.stringify(
              instance.view().resources['preference:personalImagePreferences']
                ?.value
            ) !== JSON.stringify(value)
          )
            await instance.edit(
              'preference',
              'personalImagePreferences',
              value
            );
        }
        if (localStorage.getItem(instance.localKey) === raw)
          localStorage.removeItem(instance.localKey);
      }
      if (localCareIdentity()?.offline) {
        setNotice('正在使用本机恢复的患者资料；修改仅保存在本机。');
      } else {
        await instance.sync();
        setNotice('');
      }
    } catch (e) {
      setNotice(careErrorMessage(e));
    }
    if (
      instance !== engine.current ||
      localCareIdentity()?.id !== instance.accountId
    )
      return;
    const data = instance.view();
    if (data.locked) {
      setOutput([]);
      return;
    }
    const kind =
      data.relationship?.role === 'patient' ? 'favorite' : 'personalFavorite';
    const pending = JSON.parse(localStorage.getItem(instance.localKey) || '{}');
    if (!pending.favorites) {
      overwriteCommunicationSavedPhrases(
        Object.values(data.resources)
          .filter(r => !r.deleted && r.kind === kind)
          .map(r => ({
            ...decodeCareMedia(r.value, data.media, mediaImage),
            id: r.id,
            createdAt: r.value.createdAt || r.updatedAt || 1
          }))
      );
      instance.projectedFavorites = loadCommunicationSavedPhrases();
    }
    const pref = data.resources['preference:personalImagePreferences'];
    if (pref && !pref.deleted && !pending.personalImages)
      overwritePersonalImagePreferences(
        decodeCareMedia(pref.value.value, data.media, mediaImage)
      );
    // The engine can publish resource versions before the local projection is
    // written. Notify the panel after that write, even if versions are unchanged.
    setProjectionVersion(version => version + 1);
    setSnapshot({ ...data });
  }
  async function load() {
    const loadingAccount = localCareIdentity()?.id;
    if (localCareIdentity()?.offline) {
      const profile = JSON.parse(
        localStorage.getItem('care-offline-selection-v1')
      );
      setProfiles([profile]);
      await open(profile);
      return;
    }
    try {
      const [list, context] = await Promise.all([
        runtime.request('/care/profiles', 'GET'),
        runtime.request('/care/context', 'GET')
      ]);
      if (!mounted.current || runtime.identity()?.id !== loadingAccount) return;
      setProfiles(list);
      const selected = list.find(p => p.id === context.selectedProfileId);
      if (selected?.relationship) await open(selected);
      else
        setNotice(
          list.length
            ? '选择患者档案及此账号的使用身份'
            : '请从设置创建档案或接受家庭邀请'
        );
    } catch (e) {
      if (
        !e.status &&
        mounted.current &&
        runtime.identity()?.id === loadingAccount
      ) {
        const cached = JSON.parse(
          localStorage.getItem(`care-selection-v1:${loadingAccount}`) || 'null'
        );
        if (cached?.relationship) {
          await open(cached);
          return;
        }
      }
      setNotice(careErrorMessage(e));
    }
  }
  actions.current = { load, sync };
  useEffect(() => {
    mounted.current = true;
    let lastAccount = localCareIdentity()?.id;
    const update = () => {
      const next = localCareIdentity()?.id;
      if (next !== lastAccount) {
        lastAccount = next;
        engine.current = null;
        settingsOpen.current = false;
        setSettings(false);
        setAccountId(next);
        setActive(null);
        setSnapshot(null);
        setProfiles([]);
        setOutput([]);
      }
      if (!next) return;
      if (settingsOpen.current) return;
      if (engine.current) void actions.current.sync();
      else void actions.current.load();
    };
    const stop = runtime.watch(update);
    update();
    return () => {
      mounted.current = false;
      stop();
      engine.current = null;
    };
  }, []);

  async function choose(profile, role) {
    try {
      if (role) {
        const result = await runtime.request(
          `/care/profiles/${profile.id}/commands`,
          'POST',
          {
            action: 'relationship',
            operationId: runtime.newId(),
            value: { role }
          }
        );
        profile = { ...profile, relationship: result.relationship };
      }
      await open(profile);
    } catch (e) {
      setNotice(e.message);
    }
  }
  async function favoritesChanged(items) {
    const instance = engine.current;
    if (!instance) return;
    const pending = JSON.parse(localStorage.getItem(instance.localKey) || '{}');
    // Diff against the normalized view the user actually saw, not the raw cloud
    // value. Keep that baseline with the pending edit across process restarts.
    await savePending({
      favorites: items,
      favoritesBase: pending.favoritesBase || instance.projectedFavorites || []
    });
  }
  async function savePending(change) {
    const instance = engine.current;
    if (!instance) return;
    localStorage.setItem(
      instance.localKey,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(instance.localKey) || '{}'),
        ...change
      })
    );
    await sync();
  }
  const boards =
    snapshot && !snapshot.locked ? projectCareBoards(snapshot) : [];
  async function updateBoard(board) {
    const next = boards.filter(b => b.id !== board.id).concat(board);
    await savePending({ boards: next });
    return board.id;
  }
  if (!valid || !who) return <p>请先登录。</p>;
  if (settings)
    return (
      <main>
        <button
          onClick={() => {
            settingsOpen.current = false;
            setSettings(false);
            engine.current = null;
            void load();
          }}
        >
          返回沟通
        </button>
        <Care />
      </main>
    );
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <button
        aria-label="设置"
        onClick={() => {
          engine.current = null;
          settingsOpen.current = true;
          setSettings(true);
        }}
      >
        ⚙ 设置
      </button>
      {active && (
        <button
          onClick={() => {
            engine.current = null;
            setActive(null);
            setSnapshot(null);
            setOutput([]);
          }}
        >
          切换患者档案
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {!active &&
        profiles.map(profile => (
          <section key={profile.id}>
            <p>{profile.name}</p>
            {profile.relationship ? (
              <button onClick={() => choose(profile)}>进入</button>
            ) : (
              <>
                <button onClick={() => choose(profile, 'patient')}>
                  我是患者，进入表达
                </button>
                <button onClick={() => choose(profile, 'relative')}>
                  我是家属或照护者，进入接收
                </button>
              </>
            )}
          </section>
        ))}
      {active?.accountId === who.id &&
        snapshot &&
        (snapshot.locked ? (
          <p>此档案的访问已撤销。</p>
        ) : (
          <CommunicationSupportPanel
            key={`${who.id}:${active.id}`}
            intl={intl}
            careMode
            isLogged={!who.offline}
            initiallyExpanded
            initialMode={
              active.relationship?.defaultMode === 'receiver'
                ? 'receive'
                : 'express'
            }
            boards={boards}
            output={output}
            activeBoardId={selectedBoard || boards[0]?.id}
            onApplyOutput={setOutput}
            careDataVersion={JSON.stringify([
              projectionVersion,
              Object.values(snapshot.resources).map(r => [
                r.kind,
                r.id,
                r.version
              ])
            ])}
            pictogramOrdering={{
              manualOrderByBoard: Object.fromEntries(
                boards.map(board => [board.id, board.layout.tileIds])
              )
            }}
            onPictogramUsed={() => {}}
            displaySettings={{
              fontSize:
                {
                  normal: 'Standard',
                  large: 'Large',
                  'extra-large': 'ExtraLarge'
                }[(snapshot.resources['preference:fontSize']?.value?.value)] ||
                'Standard',
              uiSize:
                { 2: 'ExtraLarge', 3: 'Large', 4: 'Standard' }[
                  (snapshot.resources['preference:cardDensity']?.value?.value)
                ] || 'Large',
              ...display
            }}
            speechSettings={{
              rate:
                snapshot.resources['preference:speechRate']?.value?.value || 1
            }}
            onChangeDisplaySettings={value => {
              setDisplay(value);
              localStorage.setItem(
                `${engine.current.localKey}:display`,
                JSON.stringify(value)
              );
            }}
            onChangeSpeechRate={value => {
              void engine.current
                .edit('preference', 'speechRate', { value })
                .then(sync)
                .catch(e => setNotice(e.message));
            }}
            onJumpBoard={setSelectedBoard}
            onCreateCommunicationBoard={updateBoard}
            onUpdateCommunicationBoard={updateBoard}
            onCareFavoritesChanged={favoritesChanged}
            onCarePersonalImagesChanged={items => {
              void savePending({ personalImages: items }).catch(e =>
                setNotice(e.message)
              );
            }}
            onSpeak={(text, done) =>
              runtime
                .speak(
                  text,
                  snapshot.resources['preference:speechRate']?.value?.value || 1
                )
                .then(() => done && done())
            }
            onCancelSpeech={() => window.speechSynthesis?.cancel()}
          />
        ))}
    </main>
  );
}
export default injectIntl(CareHome);
