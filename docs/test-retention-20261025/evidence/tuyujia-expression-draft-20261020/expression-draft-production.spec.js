import fs from 'fs';
import path from 'path';
import { test, expect } from '../../fork-cboard/cboard/node_modules/@playwright/test';
import {
  dismissBoardTour, installBrowserTtsHarness, openCaregiverTools,
  waitForProductionServiceWorker
} from '../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {
  createPersistentBrowserHarness, digest, snapshotStorage
} from './persistent-browser-harness.cjs';
import { createCommunicationRepository } from '../../fork-cboard/cboard/src/common/communicationSupport/repository';
import { buildReceiverHistoryEntry } from '../../fork-cboard/cboard/src/common/communicationSupport/receiverPipeline';
import { createSavedPhrasePreparationService } from '../../fork-cboard/cboard/src/common/communicationSupport/savedPhrasePreparation';

const DRAFT_KEY = 'cboard_communication_expression_draft_v1';
const FAVORITES_KEY = 'cboard_communication_saved_phrases';
const HISTORY_KEY = 'cboard_communication_history';
const candidates = 'button.CommunicationSupportPanel__candidate';
const panel = page => page.locator('.CommunicationSupportPanel');
const manager = page => page.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
const circle = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="green"/></svg>');
const square = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect x="4" y="4" width="40" height="40" fill="purple"/></svg>');
const identityPhrase = {
  id: 'synthetic-draft-identity',
  sentence: '合成林安告诉合成林安，我今晚七点半不回家吃饭。',
  lifeContext: '出门', createdAt: 10, updatedAt: 10, usageCount: 0,
  output: [
    { id: 'same-card', label: '合成林安', personId: 'synthetic-person-a', image: circle },
    { id: 'same-card', label: '合成林安', personId: 'synthetic-person-b', image: square },
    { id: 'time', label: '七点半', image: '', textOnly: true },
    { id: 'missing', label: '回家', image: 'data:image/png;base64,AAAA' }
  ]
};
const simplePhrase = {
  id: 'synthetic-draft-simple', sentence: '我今晚不回家吃饭',
  lifeContext: '吃饭', createdAt: 11, updatedAt: 11, usageCount: 0,
  output: [
    { id: 'self', label: '我', image: circle },
    { id: 'tonight', label: '今晚', image: square },
    { id: 'not', label: '不', image: circle },
    { id: 'go-home', label: '回家', image: square },
    { id: 'eat', label: '吃饭', image: circle }
  ]
};

async function readStorage(page, key) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key);
}

async function readDraft(page) {
  const map = await readStorage(page, DRAFT_KEY);
  const records = Object.values(map || {});
  expect(records).toHaveLength(1);
  return records[0];
}

async function openManagement(page) {
  await dismissBoardTour(page, false);
  await openCaregiverTools(panel(page), false);
  await panel(page).getByRole('button', { name: '常用语与历史', exact: true }).click();
  await expect(manager(page)).toBeVisible();
}

async function loadFavorite(page, id) {
  await openManagement(page);
  await manager(page).locator(`#saved-phrase-${id}`).getByRole('button', { name: '重用', exact: true }).click();
  await expect(panel(page).locator(candidates).first()).toBeVisible();
  await expect(page.locator('#expression-draft-save-status')).toContainText('已保存到本机');
}

async function installPage(page) {
  await installBrowserTtsHarness(page);
  page.on('pageerror', error => {
    // Errors are collected rather than ignored in all scenarios.
    page.__expressionErrors = [...(page.__expressionErrors || []), error.message];
  });
}

async function initialOpen(harness, fixtures = [identityPhrase, simplePhrase]) {
  const { page, context } = await harness.open({ installPage });
  // Reuse current repository constructors for nonempty protected fixtures.
  // Checking an absent unrelated key would not prove existing work survives.
  const protectedData = new Map();
  let fixtureSequence = 0;
  const repository = createCommunicationRepository({
    storage: {
      getItem: key => protectedData.get(key) || null,
      setItem: (key, value) => { protectedData.set(key, value); return true; }
    },
    now: () => 1800000000000,
    createId: prefix => `synthetic-other-${prefix}-${++fixtureSequence}`
  });
  repository.createReceiverDraft(buildReceiverHistoryEntry('请再说一遍', []));
  createSavedPhrasePreparationService({ repository }).start('meal-water');
  const protectedStorage = Object.fromEntries(protectedData);
  await page.addInitScript(({ fixtures, favorites, protectedStorage }) => {
    const marker = '__synthetic_expression_draft_seed_v1';
    if (localStorage.getItem(marker)) return;
    localStorage.setItem(marker, 'true');
    for (const [key, value] of Object.entries(protectedStorage))
      localStorage.setItem(key, value);
    localStorage.setItem('cboard_communication_preferences',
      JSON.stringify({ onboardingComplete: true, candidateAutoplayDelaySeconds: 5 }));
    localStorage.setItem(favorites, JSON.stringify(fixtures));
  }, { fixtures, favorites: FAVORITES_KEY, protectedStorage });
  const response = await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
  const inventoryPath = process.env.EXPRESSION_WEB_INVENTORY;
  expect(inventoryPath, 'Pass the accepted production build inventory').toBeTruthy();
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  expect(digest(await response.body())).toBe(inventory['index.html']);
  await dismissBoardTour(page, false);
  await waitForProductionServiceWorker(page);
  await dismissBoardTour(page, false);
  return { page, context };
}

async function coldOpen(harness, offline = true) {
  await harness.close();
  const next = await harness.open({ offline, installPage });
  await next.page.goto('/board/root', { waitUntil: 'domcontentloaded' });
  await dismissBoardTour(next.page, false);
  await expect(next.page.locator('#expression-draft-continue-button')).toBeVisible();
  expect(await next.page.evaluate(() => window.__cboardTtsHarness.calls)).toEqual([]);
  return next;
}

async function preservedOtherState(page) {
  const values = (await snapshotStorage(page)).values;
  return Object.fromEntries(Object.entries(values)
    .filter(([key]) => /receiver|phrase_preparation/.test(key)));
}

async function ensureZeroSpeechPastAutoplay(page) {
  // Five-second fixture preference; explicitly span the old countdown deadline.
  await page.waitForTimeout(5500);
  expect(await page.evaluate(() => window.__cboardTtsHarness.calls)).toEqual([]);
}

async function finishEvidence(harness, extra, name, info) {
  const page = harness.getPage();
  if (page && !page.isClosed()) {
    extra.lastUrl = page.url();
    try {
      extra.lastStorage = await snapshotStorage(page);
      extra.lastBodyText = await page.locator('body').innerText();
      const screenshot = info.outputPath('last-synthetic-page.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      await info.attach('last-synthetic-page', { path: screenshot, contentType: 'image/png' });
    } catch (error) {
      extra.lastStateCaptureError = String(error.message || error);
    }
  }
  await harness.close();
  const evidence = harness.saveEvidence(name, extra);
  await info.attach('browser-process-evidence', {
    body: JSON.stringify(evidence, null, 2), contentType: 'application/json'
  });
}

test('cold offline process restart preserves exact identity, rejected candidates and Later/Cancel choices', async ({}, info) => {
  const harness = createPersistentBrowserHarness();
  let lastPage;
  const extra = {};
  try {
    let { page } = await initialOpen(harness);
    lastPage = page;
    await loadFavorite(page, identityPhrase.id);
    const beforeReject = await readDraft(page);
    expect(beforeReject.snapshot.pipeline.outputSnapshot.map(item => item.personId || null))
      .toEqual(['synthetic-person-a', 'synthetic-person-b', null, null]);
    expect(beforeReject.snapshot.pipeline.candidateSentences).toContain(identityPhrase.sentence);
    await expect(panel(page).locator('.CommunicationSupportPanel__sequenceMissing:visible')).toContainText('图片不可用');
    await panel(page).getByRole('button', { name: '这组候选都不对，停止并保留图片', exact: true }).click();
    await expect(page.locator('#expression-draft-save-status')).toContainText('已保存到本机');
    const saved = await readDraft(page);
    expect(saved.snapshot.rejected).toBe(true);
    const unrelated = await preservedOtherState(page);
    expect(Object.keys(unrelated).some(key => key.includes('receiver_records'))).toBe(true);
    expect(Object.keys(unrelated).some(key => key.includes('phrase_preparation'))).toBe(true);
    const history = await readStorage(page, HISTORY_KEY);
    const favorites = await readStorage(page, FAVORITES_KEY);
    extra.before = { draft: saved, unrelated, history, favorites };
    ({ page } = await coldOpen(harness));
    lastPage = page;
    expect(await readDraft(page)).toEqual(saved);
    await page.locator('#expression-draft-defer-button').click();
    await expect(page.locator('#expression-draft-continue-button')).toHaveCount(0);
    expect(await readDraft(page)).toEqual(saved);
    await page.getByRole('button', { name: '查看待恢复表达', exact: true }).click();
    await page.locator('#expression-draft-new-button').click();
    await expect(page.locator('#expression-draft-confirm-new-button')).toBeVisible();
    await panel(page).getByRole('button', { name: '取消', exact: true }).click();
    expect(await readDraft(page)).toEqual(saved);
    await page.locator('#expression-draft-continue-button').click();
    await expect(panel(page)).toContainText('已停止这组候选');
    await ensureZeroSpeechPastAutoplay(page);
    expect((await readDraft(page)).snapshot).toEqual(saved.snapshot);
    expect(await preservedOtherState(page)).toEqual(unrelated);
    expect(await readStorage(page, HISTORY_KEY)).toEqual(history);
    expect(await readStorage(page, FAVORITES_KEY)).toEqual(favorites);
    await openManagement(page);
    await manager(page).getByRole('button', { name: '返回沟通', exact: true }).click();
    await expect(page.locator('#expression-draft-continue-button')).toHaveCount(0);
    expect((await readDraft(page)).snapshot).toEqual(saved.snapshot);
    await page.screenshot({ path: info.outputPath('offline-cold-resumed-rejected.png'), fullPage: true });
    extra.after = { draft: await readDraft(page), fullBrowserProcessRestart: true, offline: true };
    expect(page.__expressionErrors || []).toEqual([]);
    harness.assertNoPrivateOrAiRequests();
  } finally {
    if (lastPage && !lastPage.isClosed()) extra.lastUrl = lastPage.url();
    await finishEvidence(harness, extra, 'browser-cold-identity.json', info);
  }
});

test('silent storage failure preserves prior draft; cleanup failure and double confirmation write one history record', async ({}, info) => {
  const harness = createPersistentBrowserHarness();
  const extra = {};
  try {
    let { page } = await initialOpen(harness);
    await loadFavorite(page, simplePhrase.id);
    const prior = await readDraft(page);
    const historyBefore = await readStorage(page, HISTORY_KEY);
    const otherBefore = await preservedOtherState(page);
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      window.__restoreDraftStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (name, value) {
        if (name.endsWith(key)) return undefined; // Silent failed write, real storage unchanged.
        return original.call(this, name, value);
      };
    }, DRAFT_KEY);
    await panel(page).locator(candidates).nth(1).click();
    await expect(page.locator('#expression-draft-save-status')).toContainText(/未能|失败/);
    expect(await readDraft(page)).toEqual(prior);
    await page.evaluate(() => window.__restoreDraftStorage());
    await page.getByRole('button', { name: '重试保存表达', exact: true }).click();
    await expect(page.locator('#expression-draft-save-status')).toContainText('已保存到本机');
    expect((await readDraft(page)).snapshot.pipeline.selectedIndex).toBe(1);
    ({ page } = await coldOpen(harness));
    await page.locator('#expression-draft-continue-button').click();
    await ensureZeroSpeechPastAutoplay(page);
    const restored = await readDraft(page);
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      window.__restoreDraftStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (name, value) {
        if (name.endsWith(key)) {
          const values = Object.values(JSON.parse(value || '{}'));
          if (values.some(record => record.status === 'confirmed'))
            throw new Error('synthetic draft cleanup write failed');
        }
        return original.call(this, name, value);
      };
    }, DRAFT_KEY);
    await panel(page).getByRole('button', { name: '确认此句', exact: true }).click();
    const afterFirst = await readStorage(page, HISTORY_KEY);
    expect(afterFirst.length).toBe((historyBefore || []).length + 1);
    expect((await readDraft(page)).status).toBe('draft');
    await page.evaluate(() => window.__restoreDraftStorage());
    await panel(page).getByRole('button', { name: '确认此句', exact: true }).evaluate(node => { node.click(); node.click(); });
    await expect(panel(page).getByRole('button', { name: '已确认', exact: true })).toBeDisabled();
    expect(await readStorage(page, HISTORY_KEY)).toEqual(afterFirst);
    expect((await readDraft(page)).status).toBe('confirmed');
    expect(await preservedOtherState(page)).toEqual(otherBefore);
    expect(afterFirst[0].output).toEqual(restored.snapshot.pipeline.outputSnapshot);
    await harness.close();
    ({ page } = await harness.open({ offline: true, installPage }));
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#expression-draft-continue-button')).toHaveCount(0);
    expect(await readStorage(page, HISTORY_KEY)).toEqual(afterFirst);
    extra.confirmed = afterFirst[0];
    extra.singleHistoryRecord = true;
    expect(page.__expressionErrors || []).toEqual([]);
    harness.assertNoPrivateOrAiRequests();
  } finally {
    await finishEvidence(harness, extra, 'browser-storage-confirmation.json', info);
  }
});

test('clear and confirmed Start new do not resurrect expression after another offline browser process restart', async ({}, info) => {
  const harness = createPersistentBrowserHarness();
  const extra = {};
  try {
    let { page } = await initialOpen(harness);
    await loadFavorite(page, simplePhrase.id);
    const favoritesBefore = await readStorage(page, FAVORITES_KEY);
    const historyBefore = await readStorage(page, HISTORY_KEY);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect.poll(async () => (await readDraft(page)).status).toBe('cleared');
    await harness.close();
    ({ page } = await harness.open({ offline: true, installPage }));
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#expression-draft-continue-button')).toHaveCount(0);
    expect((await readDraft(page)).snapshot.pipeline.outputSnapshot).toEqual([]);
    expect(await readStorage(page, HISTORY_KEY)).toEqual(historyBefore);
    await loadFavorite(page, identityPhrase.id);
    ({ page } = await coldOpen(harness));
    await page.locator('#expression-draft-new-button').click();
    await page.locator('#expression-draft-confirm-new-button').click();
    expect((await readDraft(page)).status).toBe('cleared');
    expect((await readDraft(page)).snapshot.pipeline.outputSnapshot).toEqual([]);
    const favoritesAfter = await readStorage(page, FAVORITES_KEY);
    expect(favoritesAfter.map(item => ({ id: item.id, sentence: item.sentence, output: item.output })))
      .toEqual(favoritesBefore.map(item => ({ id: item.id, sentence: item.sentence, output: item.output })));
    await ensureZeroSpeechPastAutoplay(page);
    await harness.close();
    ({ page } = await harness.open({ offline: true, installPage }));
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#expression-draft-continue-button')).toHaveCount(0);
    expect((await readDraft(page)).status).toBe('cleared');
    expect(await readStorage(page, HISTORY_KEY)).toEqual(historyBefore);
    extra.clearAndDiscardStayedEmpty = true;
    expect(page.__expressionErrors || []).toEqual([]);
    harness.assertNoPrivateOrAiRequests();
  } finally {
    await finishEvidence(harness, extra, 'browser-clear-discard.json', info);
  }
});
