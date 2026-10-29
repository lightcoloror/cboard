import React from 'react';
import CarePanel from '../../common/communicationSupport/CarePanel';
import { API_URL } from '../../constants';
import { getStore } from '../../store';
import history from '../../history';
import { logout } from '../Account/Login/Login.actions';
import { deactivateScanner } from '../../providers/ScannerProvider/ScannerProvider.actions';
import { CboardScanItem } from '../UI/CboardScan';
import { careBrowserStorage } from '../../common/communicationSupport/careBrowserStorage';
import { createCareSync } from '../../common/communicationSupport/careSync';
import { configureCareLocalAccount } from '../../common/communicationSupport/localData';
import { chooseCareBrowserFile } from '../../common/communicationSupport/careBrowserFile';
import { createCareBuiltinImages } from '../../common/communicationSupport/careBuiltinImages';
import boardsFixture from '../../api/boards.json';
import { careTextAiEnabled } from '../../common/communicationSupport/careAiAvailability';
import {
  speak,
  cancelSpeech,
  changeRate
} from '../../providers/SpeechProvider/SpeechProvider.actions';
import { playExpressionSentence } from '../../common/communicationSupport/expressionPlaybackCoordinator';
import { createBrowserExpressionAudio } from '../../common/communicationSupport/browserExpressionAudio';

const builtinImages = createCareBuiltinImages(boardsFixture.advanced || []);
let pendingSpeech = null;
const tileAudio = createBrowserExpressionAudio();
let expressionGeneration = 0;

const identity = () => {
  const u = getStore().getState().app.userData;
  return u && u.authToken && (u.id || u._id)
    ? { id: String(u.id || u._id), token: u.authToken }
    : null;
};
export const localCareIdentity = () =>
  identity() ||
  (localStorage.getItem('care-offline-selection-v1')
    ? { id: 'offline', offline: true }
    : null);
configureCareLocalAccount(() => identity()?.id);
export const runtime = {
  scannerSettings: () => getStore()?.getState().scanner,
  deactivateScanner: () => getStore().dispatch(deactivateScanner()),
  watchScanner: callback => {
    let previous = getStore().getState().scanner;
    return getStore().subscribe(() => {
      const next = getStore().getState().scanner;
      if (next !== previous) { previous = next; callback(next); }
    });
  },
  enabled: process.env.REACT_APP_CARE_COLLABORATION === 'true',
  trialEnabled: process.env.REACT_APP_CARE_PUBLIC_TRIAL === 'true',
  fundingEnabled: careTextAiEnabled(),
  identity,
  resolveBuiltinImage: reference => builtinImages.resolve(reference),
  openAccount: () => history.replace('/login-signup'),
  randomBytes: length => crypto.getRandomValues(new Uint8Array(length)),
  newId: () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), b =>
      b.toString(16).padStart(2, '0')
    ).join(''),
  storage: careBrowserStorage,
  funding(profileId) {
    const who = identity();
    return who
      ? localStorage.getItem(`care-funding-v1:${who.id}:${profileId}`)
      : null;
  },
  setFunding(profileId, fundingId) {
    const who = identity();
    if (who)
      localStorage.setItem(`care-funding-v1:${who.id}:${profileId}`, fundingId);
  },
  async selectProfile(profile, isCurrent = () => true, options = {}) {
    const who = identity();
    if (!isCurrent()) return false;
    if (!who) {
      const selected = JSON.parse(
        localStorage.getItem('care-offline-selection-v1') || 'null'
      );
      if (
        !selected ||
        selected.id !== profile.id ||
        selected.familyId !== profile.familyId
      )
        throw new Error('请先登录');
      return isCurrent();
    }
    const current = () => {
      if (identity()?.id !== who.id || identity()?.token !== who.token)
        throw Object.assign(new Error('账号已切换，请重新选择档案'), {
          status: 401
        });
      return isCurrent();
    };
    // Restoring a GET result or an offline cache is not a new server selection.
    if (options.persist !== false) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!current()) return false;
        try {
          const context = await runtime.request('/care/context', 'GET');
          if (!current()) return false;
          if (
            !Number.isSafeInteger(context?.selectionVersion) ||
            context.selectionVersion < 0
          )
            throw Object.assign(
              new Error('服务尚不支持档案选择版本核对，请升级服务后重试'),
              { status: 503, code: 'CARE_CONTEXT_VERSION_UNAVAILABLE' }
            );
          if (!current()) return false;
          await runtime.request('/care/context', 'PUT', {
            profileId: profile.id,
            expectedSelectionVersion: context.selectionVersion
          });
          if (!current()) return false;
          break;
        } catch (error) {
          if (!current()) return false;
          const conflict =
            error.status === 409 &&
            (error.code === 'CARE_CONTEXT_CHANGED' ||
              error.data?.code === 'CARE_CONTEXT_CHANGED');
          if (conflict && attempt < 2) continue;
          if (error.status) throw error;
          // Preserve the existing explicit offline choice, without a new PUT.
          break;
        }
      }
    }
    if (!current()) return false;
    localStorage.setItem(
      `care-selection-v1:${who.id}`,
      JSON.stringify(profile)
    );
    window.dispatchEvent(new Event('care-profile-selected'));
    return true;
  },
  async restoreOffline(preview) {
    const old = JSON.parse(
      localStorage.getItem('care-offline-selection-v1') || 'null'
    );
    if (
      old &&
      (old.id !== preview.profileId || old.familyId !== preview.familyId)
    )
      throw new Error('本机已有另一患者资料，请使用独立设备空间。');
    const engine = createCareSync({
      accountId: 'offline',
      profileId: preview.profileId,
      familyId: preview.familyId,
      storage: runtime.storage,
      request: runtime.request,
      newId: runtime.newId,
      currentAccount: () => 'offline'
    });
    await engine.init();
    await engine.importPreview(preview);
    localStorage.setItem(
      'care-offline-selection-v1',
      JSON.stringify({
        id: preview.profileId,
        familyId: preview.familyId,
        name: '离线恢复的患者',
        relationship: preview.relationship || {
          role: 'patient',
          defaultMode: 'expression'
        }
      })
    );
    window.location.assign('/');
  },
  async saveArchive(bytes) {
    const url = URL.createObjectURL(
      new Blob([bytes], { type: 'application/zip' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tuyujia-device.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async offlineArchive() {
    const selected = JSON.parse(
      localStorage.getItem('care-offline-selection-v1') || 'null'
    );
    if (!selected) throw new Error('本机尚未恢复患者备份');
    const engine = createCareSync({
      accountId: 'offline',
      profileId: selected.id,
      familyId: selected.familyId,
      storage: runtime.storage,
      request: runtime.request,
      newId: runtime.newId,
      currentAccount: () => 'offline'
    });
    await engine.init();
    return {
      identity: { profileId: selected.id, familyId: selected.familyId },
      snapshot: engine.archive()
    };
  },
  async request(path, method, body) {
    const who = identity();
    if (!who) {
      const e = new Error('请先登录');
      e.status = 401;
      throw e;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(API_URL.replace(/\/$/, '') + path, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${who.token}`
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      let data;
      try {
        data = await response.json();
      } catch (_) {
        const e = new Error('服务响应格式异常，请稍后重试');
        e.status = response.status;
        e.code = 'INVALID_RESPONSE';
        throw e;
      }
      if (!response.ok) {
        const e = new Error(data.code || '连接失败');
        e.status = response.status;
        e.data = data;
        throw e;
      }
      return data;
    } catch (error) {
      const current = identity();
      if (
        error.status === 401 &&
        current?.id === who.id &&
        current?.token === who.token
      ) {
        await runtime.logout();
        history.replace('/login-signup');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
  watch(callback) {
    const session = () => {
      const who = identity();
      return JSON.stringify([who?.id, who?.token]);
    };
    let prior = session();
    const unsubscribe = getStore().subscribe(() => {
      const next = session();
      if (next !== prior) {
        prior = next;
        callback();
      }
    });
    const foreground = () => {
      if (!document.hidden) callback();
    };
    window.addEventListener('online', foreground);
    document.addEventListener('visibilitychange', foreground);
    const timer = setInterval(foreground, 30000);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener('online', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  },
  async chooseImage() {
    const file = await chooseCareBrowserFile('image/png,image/jpeg,image/webp');
    if (!file) return null;
    if (file.size > 4 * 1024 * 1024) throw new Error('请选择不超过4 MiB的图片');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      b => b.toString(16).padStart(2, '0')
    ).join('');
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = reject;
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.readAsDataURL(file);
    });
    return { data, type: file.type, sha256 };
  },
  async chooseArchive() {
    const file = await chooseCareBrowserFile('.zip');
    if (!file) return null;
    if (file.size > 20 * 1024 * 1024)
      throw new Error('请选择不超过20 MiB的图库备份');
    return new Uint8Array(await file.arrayBuffer());
  },
  speechSettings: () => ({
    ...(getStore().getState().speech?.options || {}),
    rate: getStore().getState().speech?.options?.rate || 1
  }),
  changeSpeechRate: rate => getStore().dispatch(changeRate(rate)),
  cancelSpeech: () => {
    expressionGeneration += 1;
    tileAudio.stop();
    if (pendingSpeech)
      pendingSpeech(
        Object.assign(new Error('播报已取消'), { name: 'AbortError' })
      );
    getStore().dispatch(cancelSpeech());
  },
  speak: (text, rate) => {
    if (pendingSpeech) runtime.cancelSpeech();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        if (pendingSpeech === finish) pendingSpeech = null;
        if (error) reject(error);
        else resolve();
      };
      pendingSpeech = finish;
      try {
        getStore().dispatch(
          speak(
            text,
            event => {
              finish(
                event?.error
                  ? new Error('播报失败，请使用文字与图片表达。')
                  : null
              );
            },
            Number.isFinite(rate) ? { rate } : {}
          )
        );
      } catch (error) {
        finish(error);
      }
    });
  },
  async speakExpression(text, output, rate) {
    runtime.cancelSpeech();
    const generation = expressionGeneration;
    const stopped = () => ({
      ok: false,
      reason: 'stopped',
      message: '朗读已停止。'
    });
    const result = await playExpressionSentence({
      sentence: text,
      output,
      rate,
      speechPort: {
        stop: runtime.cancelSpeech,
        speak: async (value, options) => {
          if (generation !== expressionGeneration) return stopped();
          try {
            await runtime.speak(value, options?.rate);
            return { ok: true, message: '播报完成' };
          } catch (error) {
            return error.name === 'AbortError'
              ? stopped()
              : { ok: false, reason: 'provider', message: error.message };
          }
        }
      },
      audioPort: {
        stop: tileAudio.stop,
        play: (source, options) =>
          generation !== expressionGeneration
            ? Promise.resolve(stopped())
            : tileAudio.play(source, options)
      }
    });
    if (!result.ok)
      throw Object.assign(new Error(result.message), {
        name: result.reason === 'stopped' ? 'AbortError' : 'Error'
      });
  },
  confirm: message => Promise.resolve(window.confirm(message)),
  copy: text => navigator.clipboard.writeText(text),
  logout: () => getStore().dispatch(logout())
};
const ui = {
  Box: props => (
    <div
      style={{
        padding: 10,
        margin: '8px 0',
        border: '1px solid #d1ded9',
        borderRadius: 8
      }}
      {...props}
    />
  ),
  Text: props => <p {...props} />,
  Button: props => (
    <CboardScanItem disabled={Boolean(props.disabled)}><button
      style={{ minHeight: 44, margin: 4, padding: '8px 14px', fontSize: 16 }}
      {...props}
    /></CboardScanItem>
  ),
  Input: ({ onValue, ...props }) => (
    <input
      style={{ minHeight: 44, width: '95%', fontSize: 16 }}
      onChange={e => onValue(e.target.value)}
      {...props}
    />
  ),
  Image: props => (
    <img
      alt="个人沟通图片"
      style={{ width: 150, height: 150, objectFit: 'contain' }}
      {...props}
    />
  )
};
export default function Care() {
  return (
    <main style={{ maxWidth: 900, margin: 'auto', padding: 16 }}>
      <a href="/settings">返回设置</a>
      <CarePanel runtime={runtime} ui={ui} />
    </main>
  );
}
