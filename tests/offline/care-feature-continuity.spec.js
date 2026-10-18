import { test, expect } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  dismissBoardTour,
  installBrowserTtsHarness,
  completeCommunicationOnboarding
} from './helpers/communicationSupport';
import { persistAuthenticatedUser } from './helpers/authentication';

const account = 'playwright-private-picture-user';
const profile = {
  id: 'continuity-patient',
  familyId: 'continuity-family',
  relationship: { role: 'patient', defaultMode: 'expression' }
};
const scope = `communication-v2:${account}:${profile.familyId}:${profile.id}:`;
const orderingKey = `${scope}cboard_communication_pictogram_ordering_v1`;
const mediaKey = `care-projection-v1:${account}:${profile.familyId}:${
  profile.id
}:tile-media`;
const candidates = 'button.CommunicationSupportPanel__candidate';
const resources = [
  ['board', 'home', { name: '合成主图板', tileIds: ['folder'] }],
  ['board', 'food', { name: '合成饮食', tileIds: ['water', 'meal'] }],
  ['tile', 'folder', { label: '进入饮食', loadBoardId: 'food' }],
  ['tile', 'water', { label: '喝水' }],
  ['tile', 'meal', { label: '吃饭' }]
].map(([kind, id, value]) => ({ kind, id, value, seq: 1, version: 1 }));

async function openCare(page, touch, recordings = false) {
  await installBrowserTtsHarness(page);
  await page.addInitScript(
    ({ scope }) => {
      localStorage.setItem(
        `${scope}cboard_communication_preferences`,
        JSON.stringify({
          onboardingComplete: true,
          candidateAutoplayDelaySeconds: 0
        })
      );
      const state = window.__cboardTtsHarness;
      state.pending = [];
      window.speechSynthesis.speak = utterance => {
        state.calls.push({
          text: utterance.text,
          pitch: utterance.pitch,
          rate: utterance.rate,
          voiceURI: utterance.voice?.voiceURI
        });
        state.pending.push(utterance);
      };
      window.speechSynthesis.cancel = () => {
        state.cancelCount++;
        state.pending.length = 0;
      };
      state.finish = () => state.pending.shift()?.onend?.({});
      window.__recordingHarness = { played: [], pending: [] };
      window.Audio = class {
        play() {
          window.__recordingHarness.played.push(this.src);
          window.__recordingHarness.pending.push(this);
          return Promise.resolve();
        }
        pause() {}
      };
    },
    { scope }
  );
  await blockRemoteHttpRequests(page);
  await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
  await dismissBoardTour(page, touch);
  await page.route('**/api/care/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === '/api/care/profiles'
        ? [profile]
        : path === '/api/care/context'
        ? { selectedProfileId: profile.id }
        : path.endsWith('/favorites')
        ? { items: [] }
        : { ...profile, cursor: 1, permissions: ['read'], resources };
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });
  await persistAuthenticatedUser(page, 'synthetic-continuity-token', {
    locale: 'zh-CN'
  });
  await page.evaluate(
    async ({ mediaKey, recordings }) => {
      if (recordings)
        localStorage.setItem(
          mediaKey,
          JSON.stringify([
            {
              id: 'food',
              tiles: [{ id: 'water', sound: 'data:audio/wav;base64,UklGRg==' }]
            }
          ])
        );
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('cboard');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('cboard_store', 'readwrite'),
            store = tx.objectStore('cboard_store');
          const read = store.get('persist:root');
          read.onsuccess = () => {
            const root = JSON.parse(read.result),
              speech = JSON.parse(root.speech);
            root.speech = JSON.stringify({
              ...speech,
              options: {
                ...speech.options,
                lang: 'zh-CN',
                pitch: 0.8,
                rate: 0.9,
                voiceURI: 'cboard-e2e-zh-CN',
                isCloud: false
              }
            });
            store.put(JSON.stringify(root), 'persist:root');
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { mediaKey, recordings }
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissBoardTour(page, touch);
  const onboarding = page.getByRole('dialog', {
    name: '双向沟通 · 第一次使用'
  });
  if (await onboarding.isVisible())
    await completeCommunicationOnboarding(page, touch);
  await activate(
    page
      .getByRole('navigation', { name: '选择沟通图板' })
      .getByRole('button', { name: '合成主图板', exact: true }),
    touch
  );
  await expect(
    page.getByRole('button', { name: '选择图卡：进入饮食', exact: true })
  ).toBeVisible();
  return page.locator('.CommunicationSupportPanel');
}
const calls = page => page.evaluate(() => window.__cboardTtsHarness.calls);

test('Care folders, delayed three-sentence playback, stop, original voice and durable usage', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  const panel = await openCare(page, touch);
  await activate(
    page.getByRole('button', { name: '选择图卡：进入饮食', exact: true }),
    touch
  );
  await expect(page.getByText('已选：尚未选图', { exact: true })).toBeVisible();
  await activate(
    page.getByRole('button', { name: '选择图卡：喝水', exact: true }),
    touch
  );
  await expect(panel.locator(candidates)).toHaveCount(3);
  const texts = await panel.locator(candidates).allTextContents();
  await activate(
    panel.getByRole('button', { name: '立即全部播报', exact: true }),
    touch
  );
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await page.waitForTimeout(200);
  expect((await calls(page)).map(x => x.text)).toEqual([texts[0]]);
  await page.evaluate(() => window.__cboardTtsHarness.finish());
  await expect.poll(async () => (await calls(page)).length).toBe(2);
  await page.evaluate(() => window.__cboardTtsHarness.finish());
  await expect.poll(async () => (await calls(page)).length).toBe(3);
  await page.evaluate(() => window.__cboardTtsHarness.finish());
  expect((await calls(page)).map(x => x.text)).toEqual(texts);
  for (const call of await calls(page))
    expect(call).toMatchObject({
      pitch: 0.8,
      rate: 0.9,
      voiceURI: 'cboard-e2e-zh-CN'
    });
  await activate(
    panel.getByRole('button', { name: '立即全部播报', exact: true }),
    touch
  );
  await expect.poll(async () => (await calls(page)).length).toBe(4);
  await activate(
    panel.getByRole('button', { name: '停止播报', exact: true }),
    touch
  );
  await page.waitForTimeout(200);
  expect((await calls(page)).length).toBe(4);
  const usage = await page.evaluate(
    key => localStorage.getItem(key),
    orderingKey
  );
  expect(usage).toContain('water');
  expect(usage).not.toContain('folder');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .getByRole('navigation', { name: '选择沟通图板' })
      .getByRole('button', { name: '合成主图板', exact: true }),
    touch
  );
  await expect(
    page.getByRole('button', { name: '选择图卡：进入饮食', exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(key => localStorage.getItem(key), orderingKey)
  ).toBe(usage);
  await expect(
    panel
      .locator('.CommunicationSupportPanel__suggestionList')
      .getByRole('button')
      .filter({ hasText: '喝水' })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('care-navigation-recent.png'),
    fullPage: true
  });
});

test('Care recording survives reload, waits for completion and falls back only on playback error', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  const panel = await openCare(page, touch, true);
  for (let round = 0; round < 2; round++) {
    await activate(
      page.getByRole('button', { name: '选择图卡：进入饮食', exact: true }),
      touch
    );
    await activate(
      page.getByRole('button', { name: '选择图卡：喝水', exact: true }),
      touch
    );
    await activate(
      panel.locator(candidates).filter({ hasText: /^喝水[。]?$/ }),
      touch
    );
    await expect
      .poll(() => page.evaluate(() => window.__recordingHarness.played.length))
      .toBe(1);
    expect(await calls(page)).toHaveLength(0);
    if (!round) {
      await page.evaluate(() =>
        window.__recordingHarness.pending.shift().onended()
      );
      expect(await calls(page)).toHaveLength(0);
      // Keep serving the local bundle, but deny every Care request on reopen.
      // This exercises cached profile/media recovery without a public outage.
      await page.route('**/api/care/**', route =>
        route.abort('internetdisconnected')
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await activate(
        page
          .getByRole('navigation', { name: '选择沟通图板' })
          .getByRole('button', { name: '合成主图板', exact: true }),
        touch
      );
      await expect(
        page.getByRole('button', { name: '选择图卡：进入饮食', exact: true })
      ).toBeVisible();
    } else {
      await page.evaluate(() =>
        window.__recordingHarness.pending.shift().onerror()
      );
      await expect
        .poll(async () => (await calls(page)).map(x => x.text))
        .toEqual(['喝水']);
      await page.evaluate(() => window.__cboardTtsHarness.finish());
    }
  }
});
