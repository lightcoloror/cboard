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

const state = page => read(page,'favorite_state_v1');
const row = (page,id) => manager(page).locator(`#saved-phrase-${id}`);
const undo = page => manager(page).getByRole('button',{name:'撤销上次删除的常用语',exact:true});
async function start(page,text) {
  await manager(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
  await prepare(page).getByRole('button',{name:'我想回家',exact:true}).click();
  await prepare(page).locator('#receiver-input').fill(text);
  await review(prepare(page));
}
async function save(page) {
  await prepare(page).getByRole('button',{name:'确认存为常用语',exact:true}).click();
  await expect(prepare(page)).not.toBeVisible();
}
test('product saves, retries lost receipts, deletes and undoes, then survives independent offline process restarts', async()=>{
 const h=createPersistentBrowserHarness();let proof={};
 try {
  let page=await open(h);await assertCandidate(page);await openReceiver(page);
  await receiver(page).locator('#receiver-input').fill('保护原对话，不修改。');
  await receiver(page).getByRole('button',{name:'返回图板',exact:true}).click();
  const originalRecords=await read(page,'receiver_records');await openManager(page);
  await start(page,'我今晚不回家吃饭');
  const initial=await state(page);
  await fault(page,'cboard_communication_favorite_state_v1','silent');
  await prepare(page).getByRole('button',{name:'确认存为常用语',exact:true}).click();
  await expect(prepare(page)).toContainText('保存失败');
  expect(await state(page)).toEqual(initial);
  await page.evaluate(()=>window.__restoreDraftFault());await save(page);
  const first=await state(page);expect(first.phrases).toHaveLength(1);
  await start(page,'明早七点半喝三杯水');
  await fault(page,'cboard_communication_favorite_state_v1','receipt');
  await prepare(page).getByRole('button',{name:'确认存为常用语',exact:true}).click();
  await expect(prepare(page)).toContainText('保存失败');
  await page.evaluate(()=>window.__restoreDraftFault());
  const committed=await state(page);expect(committed.phrases).toHaveLength(2);
  await save(page);expect((await state(page)).phrases).toEqual(committed.phrases);
  await start(page,'请安静一点');await save(page);
  let saved=await state(page);expect(saved.phrases).toHaveLength(3);
  await row(page,saved.phrases[0].id).getByRole('button',{name:/^情境：/}).click();
  await manager(page).getByRole('textbox',{name:'生活情境',exact:true}).fill('合成散步');
  await fault(page,'cboard_communication_favorite_state_v1','silent');
  await manager(page).getByRole('button',{name:'保存情境',exact:true}).click();
  await expect(manager(page)).toContainText('保存失败');
  expect(await state(page)).toEqual(saved);
  await page.evaluate(()=>window.__restoreDraftFault());
  await manager(page).getByRole('button',{name:'保存情境',exact:true}).click();
  saved=await state(page);expect(saved.phrases[0].lifeContext).toBe('合成散步');
  await manager(page).getByRole('button',{name:'全部',exact:true}).click();
  for(const p of saved.phrases) await row(page,p.id).getByRole('button',{name:'删除',exact:true}).click();
  const removed=await state(page);expect(removed.phrases).toEqual([]);expect(removed.tombstones).toHaveLength(3);
  for(let i=0;i<3;i++)await undo(page).click();
  const restored=await state(page);expect(restored.phrases).toHaveLength(3);
  for(const p of saved.phrases){const match=restored.phrases.find(v=>v.sentence===p.sentence);expect(match.id).not.toBe(p.id);expect(match.output).toEqual(p.output);expect(match.usageCount).toBe(p.usageCount);}
  await waitForProductionServiceWorker(page);await h.close();page=await open(h,true);await openManager(page);
  expect(await state(page)).toEqual(restored);await expect(undo(page)).toBeDisabled();
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  await row(page,restored.phrases[0].id).getByRole('button',{name:'删除',exact:true}).click();
  const final=await state(page);await h.close();page=await open(h,true);await openManager(page);
  expect(await state(page)).toEqual(final);expect(final.phrases).toHaveLength(2);
  expect(await read(page,'receiver_records')).toEqual(originalRecords);
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  h.assertNoPrivateOrAiRequests();proof={passed:true,first,committed,saved,removed,restored,final,receiverUnchanged:true};
 } finally {await h.close();h.saveEvidence('favorite-restart.json',proof);}
});

test('synthetic namesake photo identity stays local through reviewed save and offline process reopen', async()=>{
 const h=createPersistentBrowserHarness();let proof={};
 try {
  let page=await open(h);await assertCandidate(page);await openReceiver(page);
  await receiver(page).getByRole('button',{name:'返回图板',exact:true}).click();
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

  await prepare(page).getByRole('textbox',{name:'生活情境',exact:true}).fill('饭后散步');
  const reviewed=await entry(page);await save(page);const before=await state(page);
  expect(before.phrases).toHaveLength(1);expect(before.phrases[0].output.some(x=>x.personId)).toBe(true);
  await waitForProductionServiceWorker(page);await h.close();page=await open(h,true);await openManager(page);
  expect(await state(page)).toEqual(before);
  await row(page,before.phrases[0].id).getByRole('button',{name:'查看整句',exact:true}).click();
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  h.assertNoPrivateOrAiRequests();proof={passed:true,reviewed,before,photoSource:'two synthetic geometric squares',sameIdentity:true};
 }finally{await h.close();h.saveEvidence('favorite-person-restart.json',proof);}
});
