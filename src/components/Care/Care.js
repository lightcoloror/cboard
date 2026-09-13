import React from 'react';
import CarePanel from '../../common/communicationSupport/CarePanel';
import { API_URL } from '../../constants';
import { getStore } from '../../store';
import { logout } from '../Account/Login/Login.actions';
import { careBrowserStorage } from '../../common/communicationSupport/careBrowserStorage';
import { createCareSync } from '../../common/communicationSupport/careSync';
import { configureCareLocalAccount } from '../../common/communicationSupport/localData';

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
  enabled: process.env.REACT_APP_CARE_COLLABORATION === 'true',
  identity,
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
  async selectProfile(profile) {
    const who = identity();
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
      return;
    }
    try {
      await runtime.request('/care/context', 'PUT', { profileId: profile.id });
    } catch (error) {
      if (error.status) throw error;
    }
    localStorage.setItem(
      `care-selection-v1:${who.id}`,
      JSON.stringify(profile)
    );
    window.dispatchEvent(new Event('care-profile-selected'));
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
      const data = await response.json();
      if (!response.ok) {
        const e = new Error(data.code || '连接失败');
        e.status = response.status;
        e.data = data;
        throw e;
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  },
  watch(callback) {
    let prior = identity()?.id;
    const unsubscribe = getStore().subscribe(() => {
      const next = identity()?.id;
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
    const file = await new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.onchange = () => resolve(input.files[0] || null);
      input.oncancel = () => resolve(null);
      input.click();
    });
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
    const file = await new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip';
      input.onchange = () => resolve(input.files[0] || null);
      input.oncancel = () => resolve(null);
      input.click();
    });
    if (!file) return null;
    if (file.size > 20 * 1024 * 1024)
      throw new Error('请选择不超过20 MiB的图库备份');
    return new Uint8Array(await file.arrayBuffer());
  },
  speak: async (text, rate) => {
    if (!window.speechSynthesis)
      throw new Error('此设备未提供语音，请使用文字与图片表达。');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
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
    <button
      style={{ minHeight: 44, margin: 4, padding: '8px 14px', fontSize: 16 }}
      {...props}
    />
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
