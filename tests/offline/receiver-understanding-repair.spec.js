import { expect, test } from '@playwright/test';
import { blockRemoteHttpRequests, completeCommunicationOnboarding, dismissBoardTour,
  installBrowserTtsHarness, waitForProductionServiceWorker } from './helpers/communicationSupport';

const raw = '我今晚不回家吃饭，明早七点半回家';
const revised = '我不回家吃饭，明早回家';
const records = page => page.evaluate(() => JSON.parse(localStorage.getItem('cboard_communication_receiver_records') || '[]'));
const workspace = page => page.getByRole('dialog', { name: /接收理解/ });
const display = page => page.getByRole('dialog').filter({ has: page.locator('.CommunicationSupportPanel__originalText') });
async function enter(page, first = false) {
  await page.goto('/board/root');
  await dismissBoardTour(page, false);
  await page.locator('.CommunicationSupportPanel').getByRole('button', { name: '接收理解', exact: true }).click();
  if (first) await completeCommunicationOnboarding(page, false);
  return workspace(page);
}
async function keepMissing(w) {
  const keep = w.getByRole('button', { name: '保留文字', exact: true });
  while (await keep.count()) await keep.first().click();
}
async function match(w, text) {
  await w.locator('#receiver-input').fill(text);
  await w.getByRole('button', { name: '生成图片序列', exact: true }).click();
  await expect(w.getByRole('textbox', { name: '分词结果（可修改）' })).toBeVisible();
  await keepMissing(w);
}
async function visibleImagesLoaded(page) {
  const images = display(page).locator('.CommunicationSupportPanel__displayOverlay img');
  expect(await images.count()).toBeGreaterThan(0);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
}

test('original, manual segments, repair, cancel, reconfirm and true offline reopen retain local lineage', async ({ page, context }, info) => {
  test.setTimeout(180000);
  const requests = [];
  context.on('request', request => {
    if (/\/api\//.test(request.url())) requests.push({ path: new URL(request.url()).pathname, method: request.method(), body: request.postData() || '' });
  });
  await context.route('**/api/**', route => route.abort('internetdisconnected'));
  await blockRemoteHttpRequests(page);
  await installBrowserTtsHarness(page);
  let w = await enter(page, true);
  await match(w, raw);
  await w.getByRole('button', { name: '全屏展示', exact: true }).click();
  await expect(display(page).locator('.CommunicationSupportPanel__originalText')).toHaveText(raw);
  await visibleImagesLoaded(page);
  const original = (await records(page)).find(record => record.recordStatus === 'confirmed');
  expect(original.inputText).toBe(raw);
  const initialCalls = await page.evaluate(() => window.__cboardTtsHarness.calls.length);
  await display(page).getByRole('button', { name: '按原文分段阅读' }).click();
  await expect(display(page)).toContainText('第 1 / 2 段');
  await display(page).getByRole('button', { name: '下一段', exact: true }).click();
  await expect(display(page)).toContainText('第 2 / 2 段');
  expect(await page.evaluate(() => window.__cboardTtsHarness.calls.length)).toBe(initialCalls);
  await display(page).getByRole('button', { name: '再说一次', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__cboardTtsHarness.calls.at(-1)?.text)).toBe('明早七点半回家');
  await page.screenshot({ path: info.outputPath('segmented-original.png'), fullPage: true });
  await display(page).getByRole('button', { name: '没明白', exact: true }).click();
  const repair = w.getByRole('region', { name: '误解修复' });
  await expect(repair).toContainText(`原句：${raw}`);
  await repair.getByRole('button', { name: '重新展示原记录，不新增历史' }).click();
  await expect(display(page)).toContainText('第 1 / 2 段');
  expect((await records(page)).filter(record => record.recordStatus === 'confirmed')).toHaveLength(1);
  await display(page).getByRole('button', { name: '没明白', exact: true }).click();
  await repair.getByRole('button', { name: '我换个说法', exact: true }).click();
  await w.locator('#receiver-input').fill(revised);
  const draft = (await records(page)).find(record => record.recordStatus === 'draft');
  expect(draft.repairOfRecordId).toBe(original.id);
  // The same production Service Worker serves a new tab with network disabled.
  await waitForProductionServiceWorker(page);
  await context.setOffline(true);
  await page.close();
  page = await context.newPage();
  await installBrowserTtsHarness(page);
  w = await enter(page);
  await expect(w.locator('#receiver-input')).toHaveValue(revised);
  await expect(w.getByRole('region', { name: '误解修复' })).toContainText(raw);
  expect(await page.evaluate(() => window.__cboardTtsHarness.calls)).toEqual([]);
  expect((await records(page)).find(record => record.id === draft.id).repairOfRecordId).toBe(original.id);
  await page.screenshot({ path: info.outputPath('offline-repair-draft.png'), fullPage: true });
  await w.getByRole('button', { name: '取消修改并返回原记录' }).click();
  await expect(w.locator('#receiver-input')).toHaveValue(raw);
  await w.getByRole('button', { name: '我换个说法', exact: true }).click();
  await match(w, revised);
  await w.getByRole('button', { name: '全屏展示', exact: true }).click();
  await expect(display(page).locator('.CommunicationSupportPanel__originalText')).toHaveText(revised);
  await visibleImagesLoaded(page);
  await expect(display(page)).not.toContainText('第 1 /');
  const confirmed = (await records(page)).filter(record => record.recordStatus === 'confirmed');
  expect(confirmed).toHaveLength(2);
  const repairRecord = confirmed.find(record => record.id !== original.id);
  expect(repairRecord.repairOfRecordId).toBe(original.id);
  expect(repairRecord.patientFeedback).not.toBe('understood');
  const savedOriginal = confirmed.find(record => record.id === original.id);
  expect(savedOriginal.inputText).toBe(raw);
  expect(savedOriginal.output).toEqual(original.output);
  await display(page).getByRole('button', { name: '明白了', exact: true }).click();
  await expect(w.getByRole('region', { name: '误解修复' })).toHaveCount(0);
  // Existing public pictogram lookup is not an AI generation or billing endpoint.
  const expensive = requests.filter(request => /ai|generate|billing|charge/i.test(request.path) && request.method === 'POST');
  expect(expensive).toEqual([]);
  expect(requests.some(request => /data:image|blob:synthetic-private/.test(request.body))).toBe(false);
  await info.attach('receiver-repair-evidence', { body: JSON.stringify({ originalId: original.id, repairId: repairRecord.id,
    offlineReopen: true, offlineImagesLoaded: true, readingRestoredAsWhole: true, automaticModelCalls: expensive.length, requests }, null, 2), contentType: 'application/json' });
});

test('picture repair reuses picker and ordering, preserves original and falls back safely after reorder', async ({ page }, info) => {
  await blockRemoteHttpRequests(page);
  await page.route('**/api/**', route => route.abort('internetdisconnected'));
  await installBrowserTtsHarness(page);
  const w = await enter(page, true);
  await match(w, raw);
  await w.getByRole('button', { name: '全屏展示', exact: true }).click();
  const original = (await records(page)).find(record => record.recordStatus === 'confirmed');
  await display(page).getByRole('button', { name: '没明白', exact: true }).click();
  await w.getByRole('button', { name: '调整图片', exact: true }).click();
  await w.locator('.CommunicationSupportPanel__matchRow').first().getByRole('button', { name: '换图', exact: true }).click();
  await page.getByPlaceholder('搜索标签或同义词').fill('我');
  await page.locator('.CommunicationSupportPanel__swapOption').first().click();
  await w.locator('.CommunicationSupportPanel__matchRow').first().getByRole('button', { name: '右移', exact: true }).click();
  await w.getByRole('button', { name: '全屏展示', exact: true }).click();
  await expect(display(page).getByRole('button', { name: '按原文分段阅读' })).toBeDisabled();
  await expect(display(page)).toContainText('图片与原文暂时无法可靠分段');
  const confirmed = (await records(page)).filter(record => record.recordStatus === 'confirmed');
  expect(confirmed).toHaveLength(2);
  expect(confirmed.find(record => record.id === original.id).output).toEqual(original.output);
  const changed = confirmed.find(record => record.id !== original.id);
  expect(changed.repairOfRecordId).toBe(original.id);
  expect(changed.pictogramSequence[0].sourceSpan.start).toBeGreaterThan(changed.pictogramSequence[1].sourceSpan.start);
  await page.screenshot({ path: info.outputPath('picture-repair-fallback.png'), fullPage: true });
  await info.attach('picture-repair-evidence', { body: JSON.stringify({ originalId: original.id, repairId: changed.id,
    originalUnchanged: true, reorderingFallsBack: true }), contentType: 'application/json' });
});
