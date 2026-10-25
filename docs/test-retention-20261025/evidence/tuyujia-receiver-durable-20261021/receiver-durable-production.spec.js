import fs from 'fs';
import { test, expect } from '../../fork-cboard/cboard/node_modules/@playwright/test';
import { dismissBoardTour, installBrowserTtsHarness, openCaregiverTools, completeCommunicationOnboarding, waitForProductionServiceWorker } from '../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import { createPersistentBrowserHarness, snapshotStorage } from './persistent-browser-harness.cjs';

const receiver = page => page.getByRole('dialog', { name: /接收理解/ });
const prepare = page => page.getByRole('dialog', { name: /^准备常用表达/ });
const manager = page => page.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
const read = (page, suffix) => page.evaluate(s => JSON.parse(localStorage.getItem('cboard_communication_' + s) || 'null'), suffix);
const entry = async page => Object.values(await read(page, 'phrase_preparation') || {})[0];
async function openReceiver(page) {
  await dismissBoardTour(page, false);
  await page.locator('.CommunicationSupportPanel').getByRole('button', { name: '接收理解', exact: true }).click();
  if (await page.getByRole('dialog', {name:'双向沟通 · 第一次使用'}).isVisible()) await completeCommunicationOnboarding(page, false);
  await expect(receiver(page).locator('#receiver-input')).toBeVisible();
}
async function openManager(page) {
  await dismissBoardTour(page, false);
  const panel = page.locator('.CommunicationSupportPanel');
  await openCaregiverTools(panel, false);
  await panel.getByRole('button', { name: '常用语与历史', exact: true }).click();
}
async function review(dialog) {
  await dialog.getByRole('button', { name: /^(匹配图片|生成图片序列)$/ }).click();
  await expect(dialog.locator('.CommunicationSupportPanel__results')).toBeVisible();
  const missing = dialog.getByRole('button', { name: '保留文字', exact: true });
  while (await missing.count()) await missing.first().click();
}
async function fault(page, key, mode) {
  await page.evaluate(({key, mode}) => {
    window.__restoreDraftFault?.();
    const set = Storage.prototype.setItem, get = Storage.prototype.getItem;
    let unreadable = false;
    Storage.prototype.setItem = function(k, value) {
      if (k === key) {
        if (mode === 'silent') return;
        if (mode === 'write') throw new Error('synthetic write failure');
        set.call(this, k, value); unreadable = true; return;
      }
      return set.call(this, k, value);
    };
    Storage.prototype.getItem = function(k) {
      if (k === key && unreadable) { unreadable = false; throw new Error('synthetic receipt failure'); }
      return get.call(this, k);
    };
    window.__restoreDraftFault = () => { Storage.prototype.setItem = set; Storage.prototype.getItem = get; };
  }, {key, mode});
}
async function open(h, offline=false) {
  const { page } = await h.open({ offline, installPage: installBrowserTtsHarness });
  page.setDefaultTimeout(20000);
  const response = await page.goto('/board/root');
  if (offline) expect(response.fromServiceWorker()).toBe(true);
  return page;
}
function assertCandidate(page) {
  const inventory = JSON.parse(fs.readFileSync(process.env.EXPRESSION_WEB_INVENTORY, 'utf8'));
  // Actual emitted script names are included in the existing builder inventory.
  return page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.getAttribute('src'))).then(scripts => {
    const serialized = JSON.stringify(inventory);
    expect(scripts.filter(s => /static\/js\/main\./.test(s)).every(s => serialized.includes(s.split('/').pop()))).toBe(true);
  });
}

test('receiver saves current edits, retries faults, and restores repair through a real offline browser restart', async () => {
  const h = createPersistentBrowserHarness(); let evidence = {};
  try {
    let page = await open(h); await assertCandidate(page); await openReceiver(page);
    const raw = '我今晚不回家吃饭，明早七点半回家。';
    await receiver(page).locator('#receiver-input').fill(raw);
    await expect(receiver(page).getByTestId('receiver-draft-save-status')).toContainText('已保存到本机');
    const originalDraft = await read(page, 'receiver_records');
    await fault(page, 'cboard_communication_receiver_records', 'silent');
    await receiver(page).locator('#receiver-input').fill('我不想喝水');
    await expect(receiver(page).getByTestId('receiver-draft-save-status')).not.toContainText('已保存到本机');
    expect(await read(page, 'receiver_records')).toEqual(originalDraft);
    await page.evaluate(() => window.__restoreDraftFault());
    await receiver(page).getByRole('button', {name:'重试保存',exact:true}).click();
    await expect(receiver(page).getByTestId('receiver-draft-save-status')).toContainText('已保存到本机');
    await fault(page, 'cboard_communication_receiver_records', 'receipt');
    await receiver(page).locator('#receiver-input').fill(raw);
    await expect(receiver(page).getByTestId('receiver-draft-save-status')).not.toContainText('已保存到本机');
    await page.evaluate(() => window.__restoreDraftFault());
    await receiver(page).getByRole('button', {name:'重试保存',exact:true}).click();
    await review(receiver(page));
    fs.writeFileSync(process.env.EXPRESSION_WEB_INVENTORY + '.receiver-before-debug.json', JSON.stringify({records:await read(page,'receiver_records'),text:await receiver(page).innerText()},null,2));
    await expect(receiver(page).getByTestId('receiver-draft-save-status')).toContainText('已保存到本机');
    const before = await read(page, 'receiver_records');
    await waitForProductionServiceWorker(page); await h.close();
    page = await open(h, true); await openReceiver(page);
    await expect(receiver(page).locator('#receiver-input')).toHaveValue(raw);
    expect(await read(page, 'receiver_records')).toEqual(before);
    expect(await page.evaluate(() => window.__cboardTtsHarness.calls)).toEqual([]);
    fs.writeFileSync(process.env.EXPRESSION_WEB_INVENTORY + '.receiver-reopen-debug.json', JSON.stringify({before, text:await receiver(page).innerText()},null,2));
    await receiver(page).getByRole('button', {name:'全屏展示',exact:true}).click();
    await page.getByRole('button', {name:'没明白',exact:true}).click();
    const original = (await read(page, 'receiver_records')).find(x => x.recordStatus === 'confirmed');
    await receiver(page).getByRole('button', {name:'我换个说法',exact:true}).click();
    await receiver(page).locator('#receiver-input').fill('我今晚在外面吃饭');
    const repair = await read(page, 'receiver_records');
    expect(repair.find(x => x.recordStatus === 'draft').repairOfRecordId).toBe(original.id);
    await h.close(); page = await open(h, true); await openReceiver(page);
    expect(await read(page, 'receiver_records')).toEqual(repair);
    await expect(receiver(page).locator('#receiver-input')).toHaveValue('我今晚在外面吃饭');
    expect(await page.evaluate(() => window.__cboardTtsHarness.calls)).toEqual([]);
    await receiver(page).getByRole('button', {name:'取消修改并返回原记录',exact:true}).click();
    expect((await read(page, 'receiver_records')).find(x => x.id === original.id)).toEqual(original);
    evidence = { savedDraft:before, repair, originalUnchanged:true, faults:['silent','committed-receipt'], snapshot:await snapshotStorage(page) };
    h.assertNoPrivateOrAiRequests();
  } finally { await h.close(); h.saveEvidence('receiver-restart.json', evidence); }
});

test('preparation keeps namesake identity and context, invalidates edited pictures, and restores offline without changing receiver', async () => {
  const h = createPersistentBrowserHarness(); let evidence = {};
  try {
    let page = await open(h); await assertCandidate(page); await openReceiver(page);
    await receiver(page).locator('#receiver-input').fill('原接收输入不要覆盖');
    await receiver(page).getByRole('button', {name:'返回图板',exact:true}).click();
    const protectedReceiver = await read(page,'receiver_records');
    await openManager(page);
    await manager(page).getByRole('button',{name:/个人图片/}).click();
    const gallery=manager(page).locator('.PersonalImageManager');
    await gallery.getByRole('button',{name:'创建个人板',exact:true}).click();
    for (const color of ['#345899','#896345']) {
      const uri=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL('image/png');},color);
      const people=gallery.locator('[aria-label="人物全名与照片"]');
      await people.locator('.MuiTextField-root').filter({has:page.getByText('全名',{exact:true})}).locator('input').fill('欧阳明澈');
      await people.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
      await people.getByRole('button',{name:'保存人物',exact:true}).click();
      await expect(gallery.getByRole('status')).toContainText('人物已保存');
    }
    await manager(page).getByRole('button',{name:/常用语（/}).click();
    await manager(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
    await prepare(page).getByRole('button',{name:'我想回家',exact:true}).click();
    const text='欧阳明澈今晚不回家吃饭';
    await prepare(page).locator('#receiver-input').fill(text);
    await prepare(page).getByRole('button',{name:'匹配图片',exact:true}).click();
    await prepare(page).locator('[aria-label="确认欧阳明澈指谁"]').getByRole('button').nth(1).click();
    const missing=prepare(page).getByRole('button',{name:'保留文字',exact:true});
    while(await missing.count()) await missing.first().click();
    await fault(page,'cboard_communication_phrase_preparation','write');
    await prepare(page).getByRole('textbox',{name:'生活情境',exact:true}).fill('饭后散步');
    await expect(prepare(page).getByTestId('receiver-draft-save-status')).not.toContainText('已保存到本机');
    await page.evaluate(()=>window.__restoreDraftFault());
    await prepare(page).getByRole('button',{name:'重试保存情境',exact:true}).click();
    const before=await entry(page);
    expect(before.lifeContext).toBe('饭后散步'); expect(before.output.some(x=>x.personId)).toBe(true);
    await waitForProductionServiceWorker(page); await h.close(); page=await open(h,true);
    await openManager(page); await manager(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
    await prepare(page).getByRole('button',{name:'继续准备',exact:true}).click();
    await expect(prepare(page).locator('#receiver-input')).toHaveValue(text);
    expect(await entry(page)).toMatchObject({inputText:before.inputText,lifeContext:before.lifeContext,output:before.output,pictogramSequence:before.pictogramSequence});
    expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
    await prepare(page).locator('#receiver-input').fill('欧阳明澈明早七点半回家');
    expect((await entry(page)).pictogramSequence).toEqual([]);
    await h.close(); page=await open(h,true); await openManager(page);
    await manager(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
    await prepare(page).getByRole('button',{name:'继续准备',exact:true}).click();
    await expect(prepare(page).locator('#receiver-input')).toHaveValue('欧阳明澈明早七点半回家');
    expect((await entry(page)).pictogramSequence).toEqual([]);
    expect(await read(page,'receiver_records')).toEqual(protectedReceiver);
    await prepare(page).getByRole('button',{name:'取消准备',exact:true}).click();
    expect(await entry(page)).toBeUndefined();
    evidence={before,receiverUnchanged:true,changedTextReviewCleared:true,contextFailureRetried:true};
    h.assertNoPrivateOrAiRequests();
  } finally { await h.close(); h.saveEvidence('preparation-restart.json',evidence); }
});
