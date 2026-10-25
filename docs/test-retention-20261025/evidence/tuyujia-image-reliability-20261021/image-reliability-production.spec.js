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
async function square(page,color='#345899') {
 return page.evaluate(color=>{const c=document.createElement('canvas');c.width=40;c.height=40;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,40,40);return c.toDataURL('image/png');},color);
}
async function addPeople(page) {
 await openManager(page);await manager(page).getByRole('button',{name:/个人图片/}).click();
 const gallery=manager(page).locator('.PersonalImageManager');await gallery.getByRole('button',{name:'创建个人板',exact:true}).click();
 for (const color of ['#345899','#896345']) {
  const uri=await square(page,color);const people=gallery.locator('[aria-label="人物全名与照片"]');
  await people.locator('.MuiTextField-root').filter({has:page.getByText('全名',{exact:true})}).locator('input').fill('欧阳明澈');
  await people.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
  await expect(people.locator('img[alt="本人照片预览"]')).toBeVisible();
  await people.getByRole('button',{name:'保存人物',exact:true}).click();
  await expect(gallery.getByRole('status')).toContainText('人物已保存');
 }
 await manager(page).getByRole('button',{name:/常用语（/}).click();
}
test('real image decoding, independent offline restart, corrupt image, cancel and confirmed local repair',async()=>{
 const h=createPersistentBrowserHarness();let proof={};
 try {
  let page=await open(h);await assertCandidate(page);await openReceiver(page);
  await receiver(page).getByRole('button',{name:'返回图板',exact:true}).click();await addPeople(page);
  await manager(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
  await prepare(page).getByRole('button',{name:'我想回家',exact:true}).click();
  await prepare(page).locator('#receiver-input').fill('欧阳明澈今晚不回家吃饭');
  await prepare(page).getByRole('button',{name:'匹配图片',exact:true}).click();
  await prepare(page).locator('[aria-label="确认欧阳明澈指谁"]').getByRole('button').nth(1).click();
  await expect(prepare(page).getByText('图片已核验可离线使用',{exact:true}).first()).toBeVisible();
  const original=await entry(page);const raw=JSON.stringify(original);
  expect(raw).toContain('personId');expect(raw).toContain('data:image/');
  await prepare(page).getByRole('button',{name:'稍后继续',exact:true}).first().click();
  await waitForProductionServiceWorker(page);await h.close();page=await open(h,true);await openManager(page);
  await manager(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
  await page.getByRole('button',{name:'继续准备',exact:true}).click();
  await expect(prepare(page).locator('#receiver-input')).toHaveValue('欧阳明澈今晚不回家吃饭');
  await expect(prepare(page).getByText('图片已核验可离线使用',{exact:true}).first()).toBeVisible();
  const decoded=await prepare(page).locator('img').evaluateAll(imgs=>imgs.filter(x=>x.src.startsWith('data:image')).map(x=>({width:x.naturalWidth,height:x.naturalHeight})));
  expect(decoded.length).toBeGreaterThan(0);expect(decoded.every(x=>x.width>0&&x.height>0)).toBe(true);
  const recovered=await entry(page);expect({...recovered,updatedAt:0}).toEqual({...original,updatedAt:0});
  // Fault injection modifies only this synthetic prepared draft, after product UI saved it.
  await prepare(page).getByRole('button',{name:'稍后继续',exact:true}).first().click();
  await page.evaluate(()=>{
   const key='cboard_communication_phrase_preparation';const all=JSON.parse(localStorage.getItem(key));
   function corrupt(value){if(!value||typeof value!=='object')return;for(const k of Object.keys(value)){if(k==='image'&&typeof value[k]==='string'&&value[k].startsWith('data:image/'))value[k]='data:image/png;base64,Y29ycnVwdA==';else corrupt(value[k]);}}
   corrupt(all);localStorage.setItem(key,JSON.stringify(all));
  });
  await h.close();page=await open(h,true);await openManager(page);
  await manager(page).getByRole('button',{name:'准备常用表达',exact:true}).click();await page.getByRole('button',{name:'继续准备',exact:true}).click();
  const repair=prepare(page).locator('.CommunicationSupportPanel__imageRepair').filter({hasText:'本机图片无法解码'}).first();
  await expect(repair).toBeVisible();const damaged=await entry(page);
  await repair.getByRole('button',{name:'重新检查',exact:true}).click();await expect(repair).toContainText('本机图片无法解码');
  expect(await entry(page)).toEqual(damaged);
  const replacement=await square(page,'#ff6611');
  async function select(){await repair.getByRole('button',{name:'重新选择本机图片',exact:true}).click();await repair.locator('input[type=file]').setInputFiles({name:'synthetic-repair.png',mimeType:'image/png',buffer:Buffer.from(replacement.split(',')[1],'base64')});await expect(repair.getByRole('button',{name:'确认采用修复图片',exact:true})).toBeVisible();}
  await select();await repair.getByRole('button',{name:'取消修复',exact:true}).click();expect(await entry(page)).toEqual(damaged);
  await select();await fault(page,'cboard_communication_phrase_preparation','silent');
  await repair.getByRole('button',{name:'确认采用修复图片',exact:true}).click();await expect(repair).toContainText('记录保存失败');expect(await entry(page)).toEqual(damaged);
  await page.evaluate(()=>window.__restoreDraftFault());await repair.getByRole('button',{name:'确认采用修复图片',exact:true}).click();
  const fixed=await entry(page);expect(JSON.stringify(fixed)).not.toContain('Y29ycnVwdA==');
  expect(JSON.stringify(fixed)).toContain('欧阳明澈');expect(JSON.stringify(fixed)).toContain('personId');
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  h.assertNoPrivateOrAiRequests();proof={passed:true,original,recovered,damaged,fixed,decoded,syntheticPhotos:true};
 }finally{await h.close();h.saveEvidence('image-reliability-restart.json',proof);}
});

test('public original repair keeps material identity and rejects corrupt download before confirmation',async()=>{
 const h=createPersistentBrowserHarness();let proof={};
 try {
  let page=await open(h);await openReceiver(page);const picture=await square(page,'#479854');
  const publicPath='/api/pictograms/arasaac/29714/image';let downloads=0,corrupt=false;
  await page.route('**/api/pictograms/search',route=>route.fulfill({json:{results:[{token:'回家',pictogram:{
   id:'arasaac-29714',label:'回家',image:publicPath,source:{provider:'arasaac',originalId:'29714',name:'ARASAAC',license:'CC BY-NC-SA 4.0',sourceUrl:'https://arasaac.org/pictograms/29714'}
  }}]}}));
  const livePublic = process.env.LIVE_PUBLIC_IMAGE === 'true';
  const downloadEvidence=[];
  await page.route('**'+publicPath,async route=>{
   downloads++;
   if(livePublic&&!corrupt){
    const response=await route.fetch();const body=await response.body();
    expect(response.status()).toBe(200);expect(body.length).toBeGreaterThan(0);
    downloadEvidence.push({status:response.status(),bytes:body.length,contentType:response.headers()['content-type']});
    return route.fulfill({response,body});
   }
   return route.fulfill({contentType:'image/png',body:corrupt?Buffer.from('corrupt'):Buffer.from(picture.split(',')[1],'base64')});
  });
  await receiver(page).locator('#receiver-input').fill('回家');await receiver(page).getByRole('button',{name:'生成图片序列',exact:true}).click();
  const confirm=receiver(page).getByRole('button',{name:'确认使用',exact:true}).first();
  if(!await confirm.isVisible())await receiver(page).getByRole('button',{name:'在线搜索缺图',exact:true}).click();
  await confirm.click();await expect(receiver(page).getByText('图片已核验可离线使用',{exact:true}).first()).toBeVisible();
  await receiver(page).getByRole('button',{name:'生成图片序列',exact:true}).click();
  const before=await read(page,'receiver_records');
  await receiver(page).getByRole('button',{name:'返回图板',exact:true}).click();
  await page.evaluate(()=>{
   const key='cboard_communication_receiver_records';const rows=JSON.parse(localStorage.getItem(key));
   function damage(x){if(!x||typeof x!=='object')return;for(const k of Object.keys(x)){if(k==='image'&&typeof x[k]==='string'&&x[k].startsWith('data:image/'))x[k]='data:image/png;base64,Y29ycnVwdA==';else damage(x[k]);}}
   damage(rows);localStorage.setItem(key,JSON.stringify(rows));
  });
  await page.reload();await openReceiver(page);
  const resume=receiver(page).getByRole('button',{name:/继续.*复核|恢复.*草稿/});if(await resume.count())await resume.first().click();
  const repair=receiver(page).locator('.CommunicationSupportPanel__imageRepair').filter({hasText:'本机图片无法解码'}).first();
  await expect(repair).toBeVisible();const baseline=downloads;corrupt=true;
  await repair.getByRole('button',{name:'重新检查',exact:true}).click();expect(downloads).toBe(baseline);
  await repair.getByRole('button',{name:'重新下载原图',exact:true}).click();await expect(repair).toContainText('核验失败');
  expect(await repair.getByRole('button',{name:'确认采用修复图片',exact:true}).count()).toBe(0);
  corrupt=false;await repair.getByRole('button',{name:'重新下载原图',exact:true}).click();
  await expect(repair.getByRole('button',{name:'确认采用修复图片',exact:true})).toBeVisible();
  await repair.getByRole('button',{name:'确认采用修复图片',exact:true}).click();
  await expect(receiver(page).getByText('图片已核验可离线使用',{exact:true}).first()).toBeVisible();
  const after=await read(page,'receiver_records');expect(JSON.stringify(after)).not.toContain('Y29ycnVwdA==');
  h.assertNoPrivateOrAiRequests();proof={passed:true,before,after,downloads,exactOriginal:publicPath,downloadFixture:livePublic?'real public API for normal downloads; corrupt bytes only are injected':'synthetic PNG; production UI and decoder',downloadEvidence};
 }finally{await h.close();h.saveEvidence('public-original-repair.json',proof);}
});
