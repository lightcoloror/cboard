import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { projectCareSharedPhrases } from '../../common/communicationSupport/careSharedPhrases';
import Care, { runtime, localCareIdentity } from './Care';
import {
  encodeCareMedia,
  decodeCareMedia
} from '../../common/communicationSupport/careMediaValues';
import { toByteArray, fromByteArray } from 'base64-js';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { careErrorMessage } from '../../common/communicationSupport/careErrors';
import { sameCareFavoriteContent } from '../../common/communicationSupport/careFavoriteChanges';
import { assertSavedPhraseCapacity } from '../../common/communicationSupport/savedPhraseManagement';
import { createCareBuiltinImages } from '../../common/communicationSupport/careBuiltinImages';
import { createCareBuiltinBoards } from './careBuiltinBoards';
import { createPictogramOrderingStore } from '../../common/communicationSupport/pictogramOrderingStore';
import { createScopedCommunicationStorage } from '../../common/communicationSupport/scopedCommunicationStorage';
import {
  preserveCareLocalTileMedia,
  preserveCareLocalFavoriteMedia
} from '../../common/communicationSupport/careLocalMediaProjection';
import { createCareDevicePreferencesStore } from '../../common/communicationSupport/careDevicePreferences';
import { CboardScannerRoot, CboardScanItem } from '../UI/CboardScan';

const fontToDisplay = { normal: 'Standard', large: 'Large', 'extra-large': 'ExtraLarge' };
const densityToDisplay = { 2: 'ExtraLarge', 3: 'Large', 4: 'Standard' };
const displayToFont = { Standard: 'normal', Large: 'large', ExtraLarge: 'extra-large' };
const displayToDensity = { Standard: 4, Large: 3, ExtraLarge: 2 };
const CareButton = props => <CboardScanItem disabled={Boolean(props.disabled)}><button {...props} /></CboardScanItem>;

async function readImage(source, builtinImages) {
  const builtinImage = builtinImages.reference(source);
  if (builtinImage) return { builtinImage };
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

function CareHomeWorkspace({ intl }) {
  const builtinBoards = useMemo(() => createCareBuiltinBoards(intl), [intl]);
  const builtinImages = useMemo(() => createCareBuiltinImages(builtinBoards), [
    builtinBoards
  ]);
  const mediaImage = asset =>
    asset?.builtinImage
      ? builtinImages.resolve(asset.builtinImage)
      : `data:${asset.type};base64,${asset.data}`;
  const readCareImage = source => readImage(source, builtinImages);
  const [accountId, setAccountId] = useState(localCareIdentity()?.id);
  const [profiles, setProfiles] = useState([]);
  const [active, setActive] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [projectionVersion, setProjectionVersion] = useState(0);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState('正在读取患者档案');
  const [output, setOutput] = useState([]);
  const [display, setDisplay] = useState({});
  const [ordering, setOrdering] = useState({});
  const [localMediaBoards, setLocalMediaBoards] = useState([]);
  const [speechSettings, setSpeechSettings] = useState(() =>
    runtime.speechSettings()
  );
  const [selectedBoard, setSelectedBoard] = useState(null);
  const engine = useRef(null);
  const settingsOpen = useRef(false);
  const syncing = useRef(Promise.resolve());
  const mounted = useRef(true);
  const actions = useRef(null);
  const openingGeneration = useRef(0);
  const choosingProfile = useRef(false);
  const who = localCareIdentity();
  const valid = who?.id === accountId;

  async function open(profile, expectedGeneration) {
    const identity = localCareIdentity();
    if (!identity) return;
    const generation =
      expectedGeneration === undefined
        ? ++openingGeneration.current
        : expectedGeneration;
    const current = () => mounted.current && generation === openingGeneration.current &&
      localCareIdentity()?.id === identity.id && localCareIdentity()?.token === identity.token;
    if (!current()) return;
    runtime.cancelSpeech();
    // Retire the old workspace before selectProfile changes the storage scope.
    engine.current = null;
    setActive(null);
    setSnapshot(null);
    setDisplay({});
    setOutput([]);
    const selected = await runtime.selectProfile(profile, current);
    if (selected === false || !current()) return;
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
        if (instance.ready) setSnapshot(instance.view());
      }
    });
    engine.current = instance;
    instance.ready = false;
    instance.localKey = `care-projection-v1:${identity.id}:${
      profile.familyId
    }:${profile.id}`;
    instance.localRole = profile.relationship?.role;
    instance.accountId = identity.id;
    instance.scope = {
      accountId: identity.id,
      familyId: profile.familyId,
      profileId: profile.id
    };
    instance.devicePreferences = createCareDevicePreferencesStore({
      storage: createScopedCommunicationStorage(localStorage, () => instance.scope),
      scope: () => engine.current === instance && localCareIdentity()?.id === instance.accountId ? instance.localKey : 'changed',
      defaults: () => {
        const resources = instance.view().resources;
        return { fontSize: resources['preference:fontSize']?.value?.value || 'normal', cardDensity: resources['preference:cardDensity']?.value?.value || 3, speechRate: resources['preference:speechRate']?.value?.value || 1 };
      },
      legacy: () => {
        const raw = localStorage.getItem(`${instance.localKey}:display`);
        if (!raw) return {};
        const value = JSON.parse(raw);
        return { ...(displayToFont[value.fontSize] ? { fontSize: displayToFont[value.fontSize] } : {}), ...(displayToDensity[value.uiSize] ? { gridColumns: displayToDensity[value.uiSize] } : {}) };
      }
    });
    instance.orderingStore = createPictogramOrderingStore(
      createScopedCommunicationStorage(localStorage, () => instance.scope)
    );
    setOrdering(instance.orderingStore.load());
    setSpeechSettings(runtime.speechSettings());
    try {
      const saved = JSON.parse(
        localStorage.getItem(`${instance.localKey}:tile-media`) || '[]'
      );
      instance.localMediaBoards = Array.isArray(saved) ? saved : [];
    } catch (_) {
      instance.localMediaBoards = [];
    }
    setLocalMediaBoards(instance.localMediaBoards);
    try {
      const favorites = JSON.parse(
        localStorage.getItem(`${instance.localKey}:favorite-media`) || '[]'
      );
      instance.localFavoriteMedia = Array.isArray(favorites) ? favorites : [];
    } catch (_) {
      instance.localFavoriteMedia = [];
    }
    const savedIds = new Set(instance.localFavoriteMedia.map(item => item.id));
    instance.localFavoriteMedia = instance.localFavoriteMedia.concat(
      loadCommunicationSavedPhrases().filter(item => !savedIds.has(item.id))
    );
    await instance.init();
    if (!current() || engine.current !== instance) return;
    await sync();
    if (current() && engine.current === instance) {
      try {
        applyDeviceSettings(instance.devicePreferences.load());
        instance.ready = true;
        setSnapshot(instance.view());
      }
      catch (_) { setNotice('本机设置无法读取，原数据已保留；请重新打开设置核对。'); }
    }
  }
  function applyDeviceSettings(value) {
    setDisplay({ fontSize: fontToDisplay[value.fontSize], uiSize: densityToDisplay[value.gridColumns] });
    setSpeechSettings({ ...runtime.speechSettings(), rate: value.speechRate });
    return value;
  }
  function saveDeviceSettings(instance, changes, complete = false) {
    if (!mounted.current || !instance || engine.current !== instance || localCareIdentity()?.id !== instance.accountId) throw new Error('当前档案已切换，请重新打开设置。');
    const value = complete ? instance.devicePreferences.save(changes) : instance.devicePreferences.update(changes);
    return applyDeviceSettings(value);
  }
  function sync(options = {}) {
    const task = syncing.current.then(() => synchronize(options));
    syncing.current = task.catch(() => {});
    return task;
  }
  async function synchronize(options) {
    const instance = engine.current;
    if (!instance) return;
    try {
      assertSavedPhraseCapacity(loadCommunicationSavedPhrases());
      const raw = localStorage.getItem(instance.localKey);
      if (raw) {
        const pending = JSON.parse(raw);
        if (pending.favorites) assertSavedPhraseCapacity(pending.favorites);
        if (pending.boards) {
          const withLocalMedia = await rememberLocalMedia(
            instance,
            pending.boards
          );
          await queueCareBoards(instance, withLocalMedia, readCareImage);
        }
        if (pending.favorites) {
          const kind =
            instance.localRole === 'patient' ? 'favorite' : 'personalFavorite';
          for (const item of pending.favorites) {
            const baseline = pending.favoritesBase?.find(
              old => old.id === item.id
            );
            if (baseline && sameCareFavoriteContent(baseline, item)) continue;
            const value = await encodeCareMedia(item, instance, readCareImage);
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
              readCareImage
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
        await instance.sync(options);
        setNotice('');
      }
    } catch (e) {
      setNotice(careErrorMessage(e));
      if (e.code === 'SAVED_PHRASE_CAPACITY') return;
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
    try { applyDeviceSettings(instance.devicePreferences.load()); }
    catch (_) { setNotice('本机设置无法读取，原数据已保留；请重新打开设置核对。'); }
    const kind =
      data.relationship?.role === 'patient' ? 'favorite' : 'personalFavorite';
    const pending = JSON.parse(localStorage.getItem(instance.localKey) || '{}');
    if (!pending.favorites) {
      try {
        overwriteCommunicationSavedPhrases(
        preserveCareLocalFavoriteMedia(
          Object.values(data.resources)
            .filter(r => !r.deleted && r.kind === kind)
            .map(r => ({
              ...decodeCareMedia(r.value, data.media, mediaImage),
              id: r.id,
              createdAt: r.value.createdAt || r.updatedAt || 1
            })),
          instance.localFavoriteMedia,
          instance.scope,
          instance.scope
        )
      );
        instance.projectedFavorites = loadCommunicationSavedPhrases();
      } catch (e) {
        setNotice(careErrorMessage(e));
        return;
      }
    }
    const pref = data.resources['preference:personalImagePreferences'];
    if (pref && !pref.deleted && !pending.personalImages)
      overwritePersonalImagePreferences(
        decodeCareMedia(pref.value.value, data.media, mediaImage)
      );
    // The engine can publish resource versions before the local projection is
    // written. Notify the panel after that write, even if versions are unchanged.
    setProjectionVersion(version => version + 1);
    if (instance.ready) setSnapshot({ ...data });
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
      const cacheKey = `care-list-v1:${loadingAccount}`;
      let cachedList = {};
      try {
        cachedList = JSON.parse((await runtime.storage.get(cacheKey)) || '{}');
      } catch (_) {}
      await runtime.storage.set(
        cacheKey,
        JSON.stringify({
          profiles: list,
          families: Array.isArray(cachedList?.families)
            ? cachedList.families
            : []
        })
      );
      if (!mounted.current || runtime.identity()?.id !== loadingAccount) return;
      setProfiles(list);
      const selected = list.find(p => p.id === context.selectedProfileId);
      if (selected?.relationship && !choosingProfile.current) await open(selected);
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
        let cached = null;
        let list = [];
        try {
          cached = JSON.parse(
            localStorage.getItem(`care-selection-v1:${loadingAccount}`) ||
              'null'
          );
        } catch (_) {}
        try {
          const saved = JSON.parse(
            (await runtime.storage.get(`care-list-v1:${loadingAccount}`)) ||
              '{}'
          );
          if (Array.isArray(saved.profiles))
            list = saved.profiles.filter(p => p?.id && p?.familyId);
        } catch (_) {}
        if (!mounted.current || runtime.identity()?.id !== loadingAccount)
          return;
        if (!list.length && cached?.id && cached?.familyId) list = [cached];
        setProfiles(list);
        const selected = list.find(
          p => p.id === cached?.id && p.familyId === cached?.familyId
        );
        if (selected?.relationship && !choosingProfile.current) {
          await open(selected);
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
        openingGeneration.current += 1;
        choosingProfile.current = false;
        runtime.cancelSpeech();
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
      if (engine.current) void actions.current.sync({ automatic: true });
      else void actions.current.load();
    };
    const stop = runtime.watch(update);
    update();
    return () => {
      openingGeneration.current += 1;
      mounted.current = false;
      runtime.cancelSpeech();
      stop();
      engine.current = null;
    };
  }, []);

  async function choose(profile, role) {
    const identity = localCareIdentity();
    if (!identity) return;
    const generation = ++openingGeneration.current;
    const current = () =>
      mounted.current &&
      generation === openingGeneration.current &&
      localCareIdentity()?.id === identity.id &&
      localCareIdentity()?.token === identity.token;
    try {
      choosingProfile.current = false;
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
        if (!current()) return;
        profile = { ...profile, relationship: result.relationship };
      }
      if (!current()) return;
      await open(profile, generation);
    } catch (e) {
      if (current()) setNotice(e.message);
    }
  }
  async function favoritesChanged(items) {
    const instance = engine.current;
    if (!instance) return;
    instance.localFavoriteMedia = items.map(item => ({
      id: item.id,
      output: (item.output || []).map(tile => ({
        id: tile.id,
        boardId: tile.boardId,
        sound: tile.sound || '',
        video: tile.video || '',
        mediaType: tile.mediaType || 'image'
      }))
    }));
    localStorage.setItem(
      `${instance.localKey}:favorite-media`,
      JSON.stringify(instance.localFavoriteMedia)
    );
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
  async function rememberLocalMedia(instance, nextBoards) {
    // Reuse the mini-program's same-scope preservation contract. Cloud images
    // and local recordings have different storage/permission contracts.
    const stable = await Promise.all(
      nextBoards.map(async board => ({
        ...board,
        tiles: await Promise.all(
          board.tiles.map(async tile => {
            if (!tile.sound?.startsWith('blob:')) return tile;
            const blob = await (await fetch(tile.sound)).blob();
            const sound = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error('本机录音保存失败'));
              reader.onload = () => resolve(String(reader.result));
              reader.readAsDataURL(blob);
            });
            return { ...tile, sound };
          })
        )
      }))
    );
    const media = stable.map(board => ({
      id: board.id,
      tiles: board.tiles.map(tile => ({
        id: tile.id,
        sound: tile.sound || '',
        video: tile.video || '',
        mediaType: tile.mediaType || 'image'
      }))
    }));
    localStorage.setItem(
      `${instance.localKey}:tile-media`,
      JSON.stringify(media)
    );
    instance.localMediaBoards = media;
    if (
      engine.current === instance &&
      localCareIdentity()?.id === instance.accountId
    )
      setLocalMediaBoards(media);
    return stable;
  }
  const patientBoards =
    snapshot && !snapshot.locked && engine.current
      ? preserveCareLocalTileMedia(
          projectCareBoards(snapshot, mediaImage),
          localMediaBoards,
          engine.current.scope,
          {
            accountId: who?.id,
            familyId: active?.familyId,
            profileId: active?.id
          }
        )
      : [];
  // Display-only catalog: never pass bundled boards to the patient upload queue.
  const patientBoardIds = new Set(patientBoards.map(board => board.id));
  const boards = builtinBoards
    .filter(board => !patientBoardIds.has(board.id))
    .concat(patientBoards);
  async function updateBoard(board) {
    const next = patientBoards.filter(b => b.id !== board.id).concat(board);
    const instance = engine.current;
    if (!instance) return;
    const stable = await rememberLocalMedia(instance, next);
    if (
      engine.current !== instance ||
      localCareIdentity()?.id !== instance.accountId
    )
      return;
    await savePending({ boards: stable });
    return board.id;
  }
  if (!valid || !who) return <p>请先登录。</p>;
  if (settings)
    return (
      <main>
        <CareButton
          onClick={() => {
            settingsOpen.current = false;
            setSettings(false);
            engine.current = null;
            void load();
          }}
        >
          返回沟通
        </CareButton>
        <Care />
      </main>
    );
  const displayedInstance = engine.current;
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <CareButton
        aria-label="设置"
        onClick={() => {
          runtime.cancelSpeech();
          openingGeneration.current += 1;
          engine.current = null;
          settingsOpen.current = true;
          setSettings(true);
        }}
      >
        ⚙ 设置
      </CareButton>
      {active && (
        <CareButton
          onClick={() => {
            runtime.cancelSpeech();
            choosingProfile.current = true;
            openingGeneration.current += 1;
            engine.current = null;
            setActive(null);
            setSnapshot(null);
            setOutput([]);
          }}
        >
          切换患者档案
        </CareButton>
      )}
      {notice && <p role="status">{notice}</p>}
      {active && <p>此处字号、格数和语速只保存到当前设备的当前档案；不会修改共享档案默认值。</p>}
      {!active &&
        profiles.map(profile => (
          <section key={profile.id}>
            <p>{profile.name}</p>
            {profile.relationship ? (
              <CareButton onClick={() => choose(profile)}>进入</CareButton>
            ) : (
              <>
                <CareButton onClick={() => choose(profile, 'patient')}>
                  我是患者，进入表达
                </CareButton>
                <CareButton onClick={() => choose(profile, 'relative')}>
                  我是家属或照护者，进入接收
                </CareButton>
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
            careSharedPhrases={projectCareSharedPhrases(
              snapshot,
              active.relationship?.role,
              mediaImage
            )}
            isLogged={!who.offline}
            accountId={who.id}
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
              ...ordering,
              manualOrderByBoard: Object.fromEntries(
                boards.map(board => [board.id, board.layout.tileIds])
              )
            }}
            onPictogramUsed={(boardId, tileId) => {
              const instance = engine.current;
              if (
                !instance ||
                instance.scope.profileId !== active.id ||
                instance.accountId !== who.id
              )
                return;
              try {
                setOrdering(
                  instance.orderingStore.recordUsage(boardId, tileId)
                );
              } catch (_) {
                setNotice('最近使用记录保存失败，当前表达仍可继续。');
              }
            }}
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
            speechSettings={speechSettings}
            onSaveCareDevicePreferences={value => saveDeviceSettings(displayedInstance, value, true)}
            onChangeDisplaySettings={value => {
              return saveDeviceSettings(displayedInstance, { fontSize: displayToFont[value.fontSize], gridColumns: displayToDensity[value.uiSize] });
            }}
            onChangeSpeechRate={value => {
              return saveDeviceSettings(displayedInstance, { speechRate: value });
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
            onSpeak={(text, done, playbackOutput = output) =>
              runtime
                .speakExpression(text, playbackOutput, speechSettings.rate)
                .then(() => done && done())
            }
            onCancelSpeech={runtime.cancelSpeech}
          />
        ))}
    </main>
  );
}
function CareHome(props) {
  const [scanning, setScanning] = useState(() => runtime.scannerSettings?.() || {});
  useEffect(() => runtime.watchScanner?.(setScanning), []);
  return <CboardScannerRoot active={Boolean(scanning.active)} strategy={scanning.strategy} iterationInterval={scanning.delay} onDeactivation={runtime.deactivateScanner} showStopAction>
    <CareHomeWorkspace {...props} />
  </CboardScannerRoot>;
}
export default injectIntl(CareHome);
