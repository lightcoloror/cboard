import fs from 'fs';
import path from 'path';
import nodeCrypto from 'crypto';
import { test, expect } from '../../../fork-cboard/cboard/node_modules/@playwright/test';
import { dismissBoardTour, installBrowserTtsHarness, openCaregiverTools, completeCommunicationOnboarding, waitForProductionServiceWorker } from '../../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import { createPersistentBrowserHarness } from './persistent-browser-harness.cjs';

const receiver=p=>p.getByRole('dialog',{name:/接收理解/});
const prep=p=>p.getByRole('dialog',{name:/^准备常用表达/});
const manager=p=>p.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
const display=p=>p.getByRole('dialog').filter({has:p.locator('.CommunicationSupportPanel__originalText')});
const row=(p,id)=>manager(p).locator(`#saved-phrase-${id}`);
const undo=p=>manager(p).getByRole('button',{name:'撤销上次删除的常用语',exact:true});
const read=(p,s)=>p.evaluate(s=>JSON.parse(localStorage.getItem('cboard_communication_'+s)||'null'),s);
const phrases=async p=>(await read(p,'favorite_state_v1'))?.phrases||[];
const calls=p=>p.evaluate(()=>window.__cboardTtsHarness.calls);
function checkpoint(name,value){const suffix=process.env.EXPRESSION_ACCEPTANCE_LABEL?'-'+process.env.EXPRESSION_ACCEPTANCE_LABEL:'';fs.writeFileSync(path.join(__dirname,name+suffix+'.json'),JSON.stringify(value,null,2));}
async function open(h,offline=false){
 const {page}=await h.open({offline,installPage:installBrowserTtsHarness});
 const mainResponses=[];
 const captureMain=response=>{if(/\/static\/js\/main\.[^/]+\.js$/.test(new URL(response.url()).pathname))mainResponses.push(response);};
 page.on('response',captureMain);
 page.setDefaultTimeout(18000);
 const response=await page.goto('/board/root');if(offline)expect(response.fromServiceWorker()).toBe(true);
 if(!offline)await waitForProductionServiceWorker(page);
 const inventory=fs.readFileSync(process.env.EXPRESSION_WEB_INVENTORY,'utf8');
 const scripts=await page.locator('script[src]').evaluateAll(ns=>ns.map(n=>n.getAttribute('src')));
 const main=scripts.filter(s=>/static\/js\/main\./.test(s));expect(main.length).toBeGreaterThan(0);
 expect(main.every(s=>inventory.includes(s.split('/').pop()))).toBe(true);
 expect(mainResponses.length).toBeGreaterThan(0);
 const captured=mainResponses.at(-1),relative=new URL(captured.url()).pathname.replace(/^\//,'');
 const sha256=nodeCrypto.createHash('sha256').update(await captured.body()).digest('hex');expect(sha256).toBe(JSON.parse(inventory)[relative]);
 h.evidence.bundleVerifications=h.evidence.bundleVerifications||[];h.evidence.bundleVerifications.push({generation:h.evidence.processes.length,url:captured.url(),sha256,fromServiceWorker:captured.fromServiceWorker()});
 page.off('response',captureMain);return page;
}
async function enterReceiver(p){
 await dismissBoardTour(p,false);await p.locator('.CommunicationSupportPanel').getByRole('button',{name:'接收理解',exact:true}).click();
 if(await p.getByRole('dialog',{name:'双向沟通 · 第一次使用'}).isVisible())await completeCommunicationOnboarding(p,false);
 await expect(receiver(p).locator('#receiver-input')).toBeVisible();
}
async function manage(p){await dismissBoardTour(p,false);const panel=p.locator('.CommunicationSupportPanel');await openCaregiverTools(panel,false);await panel.getByRole('button',{name:'常用语与历史',exact:true}).click();}
async function review(w,text){
 if(text!==undefined)await w.locator('#receiver-input').fill(text);
 await w.getByRole('button',{name:/^(匹配图片|生成图片序列)$/}).click();
 await expect(w.locator('.CommunicationSupportPanel__results')).toBeVisible();
 const missing=w.locator('.CommunicationSupportPanel__matchRow:has(.CommunicationSupportPanel__status--miss)').getByRole('button',{name:'保留文字',exact:true});
 for(let i=0;i<25;i++){const activated=await missing.evaluateAll(ns=>{if(!ns.length)return false;ns[0].click();return true;});if(!activated)break;}
 expect(await missing.count()).toBe(0);
}
async function imagesLoaded(locator){await expect(locator.first()).toBeVisible();expect(await locator.count()).toBeGreaterThan(0);await expect.poll(()=>locator.evaluateAll(ns=>ns.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);}
async function imageDecodeEvidence(locator){await imagesLoaded(locator);return locator.evaluateAll(async ns=>Promise.all(ns.map(async i=>{await i.decode();return{srcKind:i.currentSrc.split(':')[0],width:i.naturalWidth,height:i.naturalHeight,complete:i.complete};})));}
async function privatePixels(p,src){
 expect(src.startsWith('data:image/')).toBe(true);
 return p.evaluate(async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);const pixels=x.getImageData(0,0,c.width,c.height).data;const digest=await globalThis.crypto.subtle.digest('SHA-256',pixels);return{width:c.width,height:c.height,pixelSha256:Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('')};},src);
}
async function start(p,text){await manager(p).getByRole('button',{name:'准备常用表达',exact:true}).click();await prep(p).getByRole('button',{name:'我想回家',exact:true}).click();await review(prep(p),text);}
async function doubleClick(locator){await locator.evaluate(n=>{n.click();n.click();});}
async function save(p,name='确认存为常用语'){await doubleClick(prep(p).getByRole('button',{name,exact:true}));await expect(prep(p)).not.toBeVisible();}
async function upload(p,items){await manager(p).locator('input[type=file]').first().setInputFiles({name:'synthetic-import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'cboard-communication-saved-phrases',version:1,phrases:items}))});await expect(manager(p).getByRole('group',{name:'常用语导入预览'})).toBeVisible();}

test('receiver manual segment replay, repair/cancel/reconfirm and changed-picture fallback survive real offline browser restart',async({},info)=>{
 const h=createPersistentBrowserHarness();let proof={passed:false,steps:[]};
 try{
  let p=await open(h);await enterReceiver(p);const raw='我今晚不回家吃饭，明早七点半回家';const revised='我不回家吃饭，明早回家';
  await review(receiver(p),raw);await receiver(p).getByRole('button',{name:'全屏展示',exact:true}).click();
  await expect(display(p).locator('.CommunicationSupportPanel__originalText')).toHaveText(raw);
  const original=(await read(p,'receiver_records')).find(x=>x.recordStatus==='confirmed');
  checkpoint('receiver-display-diagnostic',{original,images:await receiver(p).locator('img').evaluateAll(ns=>ns.map(i=>({src:i.currentSrc||i.src,complete:i.complete,width:i.naturalWidth}))),text:await display(p).innerText()});
  await display(p).locator('img').first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
  proof.coldDisplay={imageCount:await display(p).locator('img').count(),cacheState:await p.evaluate(async output=>Promise.all(output.filter(x=>x.image).map(async x=>({image:x.image,cached:Boolean(await caches.match(x.image))}))),original.output)};
  checkpoint('receiver-cold-display-cache',proof.coldDisplay);
  expect.soft(proof.coldDisplay.imageCount,'Matched public pictures must be displayed on the fresh local build').toBeGreaterThan(0);
  if(proof.coldDisplay.imageCount)proof.initialDecodedImages=await imageDecodeEvidence(display(p).locator('img'));
  const count=(await calls(p)).length;await display(p).getByRole('button',{name:'按原文分段阅读'}).click();
  await expect(display(p)).toContainText('第 1 / 2 段');await display(p).getByRole('button',{name:'下一段',exact:true}).click();
  await expect(display(p)).toContainText('第 2 / 2 段');expect((await calls(p)).length).toBe(count);
  await display(p).getByRole('button',{name:'再说一次',exact:true}).click();
  await expect.poll(async()=>(await calls(p)).at(-1)?.text).toBe('明早七点半回家');
  proof.steps.push('matching-original-and-active-segment-replay');
  await display(p).getByRole('button',{name:'没明白',exact:true}).click();
  await receiver(p).getByRole('button',{name:'重新展示原记录，不新增历史'}).click();
  expect((await read(p,'receiver_records')).filter(x=>x.recordStatus==='confirmed')).toHaveLength(1);
  await display(p).getByRole('button',{name:'没明白',exact:true}).click();
  await receiver(p).getByRole('button',{name:'我换个说法',exact:true}).click();await receiver(p).locator('#receiver-input').fill(revised);
  const repair=(await read(p,'receiver_records')).find(x=>x.recordStatus==='draft');expect(repair.repairOfRecordId).toBe(original.id);
  await waitForProductionServiceWorker(p);await h.close();p=await open(h,true);await enterReceiver(p);
  await expect(receiver(p).locator('#receiver-input')).toHaveValue(revised);expect(await calls(p)).toEqual([]);
  expect((await read(p,'receiver_records')).find(x=>x.id===repair.id)).toEqual(repair);
  await receiver(p).getByRole('button',{name:'取消修改并返回原记录'}).click();await expect(receiver(p).locator('#receiver-input')).toHaveValue(raw);
  expect((await read(p,'receiver_records')).find(x=>x.id===original.id)).toMatchObject({inputText:original.inputText,output:original.output});
  proof.steps.push('repair-draft-real-offline-process-restart-and-cancel');
  await receiver(p).getByRole('button',{name:'我换个说法',exact:true}).click();await review(receiver(p),revised);
  await doubleClick(receiver(p).getByRole('button',{name:'全屏展示',exact:true}));
  let confirmed=(await read(p,'receiver_records')).filter(x=>x.recordStatus==='confirmed');expect(confirmed).toHaveLength(2);
  const changed=confirmed.find(x=>x.id!==original.id);expect(changed.repairOfRecordId).toBe(original.id);
  await expect(display(p).locator('.CommunicationSupportPanel__originalText')).toHaveText(revised);
  if(proof.coldDisplay.imageCount)proof.offlineDecodedImages=await imageDecodeEvidence(display(p).locator('img'));
  await display(p).getByRole('button',{name:'没明白',exact:true}).click();await receiver(p).getByRole('button',{name:'调整图片',exact:true}).click();
  await receiver(p).locator('.CommunicationSupportPanel__matchRow').first().getByRole('button',{name:'换图',exact:true}).click();
  await p.getByPlaceholder('搜索标签或同义词').fill('我');await p.locator('.CommunicationSupportPanel__swapOption').first().click();
  await receiver(p).locator('.CommunicationSupportPanel__matchRow').first().getByRole('button',{name:'右移',exact:true}).click();
  await receiver(p).getByRole('button',{name:'全屏展示',exact:true}).click();
  await expect(display(p).getByRole('button',{name:'按原文分段阅读'})).toBeDisabled();await expect(display(p)).toContainText('图片与原文暂时无法可靠分段');
  confirmed=(await read(p,'receiver_records')).filter(x=>x.recordStatus==='confirmed');expect(confirmed).toHaveLength(3);
  expect(confirmed.find(x=>x.id===original.id).output).toEqual(original.output);
  proof.repairedDisplayImageCount=await display(p).locator('img').count();
  await display(p).getByRole('button',{name:'明白了',exact:true}).click();
  await expect(receiver(p).getByRole('region',{name:'误解修复'})).toHaveCount(0);
  await p.screenshot({path:info.outputPath('receiver-finished.png'),fullPage:true});
  proof.steps.push('double-confirm-no-duplicate','picture-swap-order-fallback-original-preserved');h.assertNoPrivateOrAiRequests();proof={...proof,passed:proof.coldDisplay.imageCount>0,original,repair,confirmed};
 }catch(error){proof={...proof,passed:false,error:error.message};throw error;}finally{if(h.getPage())await h.getPage().screenshot({path:info.outputPath('receiver-final-state.png'),fullPage:true}).catch(()=>{});await h.close();h.saveEvidence('core-receiver.json',proof);}
});

test('favorite preparation edit copy classify import replay load delete undo and independent offline restart',async({},info)=>{
 const h=createPersistentBrowserHarness();let proof={passed:false,steps:[]};
 try{
  let p=await open(h);await enterReceiver(p);await receiver(p).locator('#receiver-input').fill('合成保护原接收对话');
  await receiver(p).getByRole('button',{name:'返回图板',exact:true}).click();const protectedReceiver=await read(p,'receiver_records');await manage(p);
  await start(p,'我想喝水');await save(p);let list=await phrases(p);expect(list).toHaveLength(1);const initial=list[0];
  await row(p,initial.id).getByRole('button',{name:'修改这条',exact:true}).click();await prep(p).locator('#receiver-input').fill('我不想喝水');
  await prep(p).getByRole('button',{name:'取消准备',exact:true}).click();expect(await phrases(p)).toEqual(list);
  await prep(p).getByRole('button',{name:'稍后继续',exact:true}).first().click();
  await row(p,initial.id).getByRole('button',{name:'修改这条',exact:true}).click();await review(prep(p),'我不想喝水');
  const draft=await read(p,'phrase_preparation');await waitForProductionServiceWorker(p);await h.close();p=await open(h,true);await manage(p);
  await manager(p).getByRole('button',{name:'准备常用表达',exact:true}).click();await prep(p).getByRole('button',{name:'继续准备',exact:true}).click();
  await expect(prep(p).locator('#receiver-input')).toHaveValue('我不想喝水');
  const resumedDraft=await read(p,'phrase_preparation');expect(Object.keys(resumedDraft)).toEqual(Object.keys(draft));
  for(const key of Object.keys(draft)){const {updatedAt:oldStamp,...oldSemantic}=draft[key];const {updatedAt:newStamp,...newSemantic}=resumedDraft[key];expect(newSemantic).toEqual(oldSemantic);expect(newStamp).toBeGreaterThanOrEqual(oldStamp);}
  expect(await calls(p)).toEqual([]);
  await save(p,'确认更新这条常用语');list=await phrases(p);expect(list).toHaveLength(1);expect(list[0]).toMatchObject({id:initial.id,sentence:'我不想喝水',createdAt:initial.createdAt});const edited=list[0];
  proof.steps.push('create-double-save','edit-cancel','edit-draft-offline-process-restart','update-same-id');
  await row(p,initial.id).getByRole('button',{name:'以此准备新句',exact:true}).click();await review(prep(p),'请给我温水');await save(p,'确认另存为新常用语');
  list=await phrases(p);expect(list).toHaveLength(2);expect(list.find(x=>x.id===initial.id)).toEqual(edited);
  await row(p,initial.id).getByRole('button',{name:/^情境：/}).click();await manager(p).getByRole('textbox',{name:'生活情境',exact:true}).fill('合成散步');
  await manager(p).getByRole('button',{name:'取消',exact:true}).click();expect((await phrases(p)).find(x=>x.id===initial.id)).toEqual(edited);
  await row(p,initial.id).getByRole('button',{name:/^情境：/}).click();await manager(p).getByRole('textbox',{name:'生活情境',exact:true}).fill('合成散步');await doubleClick(manager(p).getByRole('button',{name:'保存情境',exact:true}));
  expect((await phrases(p)).find(x=>x.id===initial.id).lifeContext).toBe('合成散步');
  const filter=manager(p).getByRole('group',{name:'生活情境筛选'});await filter.getByRole('button',{name:'吃饭',exact:true}).click();await expect(row(p,initial.id)).toHaveCount(0);
  await filter.getByRole('button',{name:'合成散步',exact:true}).click();await expect(row(p,initial.id)).toBeVisible();await filter.getByRole('button',{name:'全部',exact:true}).click();
  const beforeImport=await phrases(p);const imported={id:'synthetic-imported-phrase',sentence:'合成导入这句话',lifeContext:'聊天',createdAt:10,usageCount:0,output:[]};
  await upload(p,[imported]);expect(await phrases(p)).toEqual(beforeImport);await manager(p).getByRole('button',{name:'取消导入',exact:true}).click();expect(await phrases(p)).toEqual(beforeImport);
  await upload(p,[imported]);await doubleClick(manager(p).getByRole('button',{name:'确认整批导入',exact:true}));expect(await phrases(p)).toHaveLength(3);
  await row(p,imported.id).waitFor({state:'visible',timeout:5000}).catch(()=>{});
  proof.importImmediate={state:await read(p,'favorite_state_v1'),ui:await manager(p).innerText(),importedRowVisible:await row(p,imported.id).isVisible()};checkpoint('import-immediate-diagnostic',proof.importImmediate);
  expect.soft(proof.importImmediate.importedRowVisible,'Committed import must immediately be visible without restart').toBe(true);
  if(!proof.importImmediate.importedRowVisible){await h.close();p=await open(h,true);await manage(p);await expect(row(p,imported.id)).toBeVisible();proof.steps.push('import-required-browser-restart-to-refresh-ui');}
  proof.steps.push('copy-new-id','classify-cancel-and-save-filter','import-preview-zero-write-cancel-double-confirm');
  await row(p,initial.id).getByRole('button',{name:'查看整句',exact:true}).click();const overlay=p.locator('[role=dialog][aria-labelledby=communication-playback-sentence]');
  await expect(overlay).toContainText(edited.sentence);expect(await calls(p)).toEqual([]);
  await overlay.getByRole('button',{name:'播报整句',exact:true}).click();await expect.poll(async()=>(await calls(p)).at(-1)?.text).toBe(edited.sentence);
  await overlay.getByRole('button',{name:'返回',exact:true}).click();await manage(p);
  await row(p,imported.id).getByRole('button',{name:'重用',exact:true}).click();await expect(p.locator('.CommunicationSupportPanel')).toContainText(imported.sentence);await manage(p);
  const beforeDelete=await phrases(p);for(const item of beforeDelete)await row(p,item.id).getByRole('button',{name:'删除',exact:true}).click();expect(await phrases(p)).toEqual([]);
  proof.deleteImmediate={storage:await phrases(p),ui:await manager(p).innerText(),remainingRows:(await Promise.all(beforeDelete.map(item=>row(p,item.id).isVisible()))).filter(Boolean).length};checkpoint('delete-immediate-diagnostic',proof.deleteImmediate);
  expect.soft(proof.deleteImmediate.remainingRows,'Deleted favorites must immediately disappear from UI').toBe(0);
  for(let i=0;i<beforeDelete.length;i++)await undo(p).click();const restored=await phrases(p);expect(restored).toHaveLength(3);
  for(const old of beforeDelete){const item=restored.find(x=>x.sentence===old.sentence);expect(item.id).not.toBe(old.id);expect(item.output).toEqual(old.output);expect(item.lifeContext).toBe(old.lifeContext);}
  proof.undoImmediate={state:await read(p,'favorite_state_v1'),ui:await manager(p).innerText(),newIdsVisible:await Promise.all(restored.map(x=>row(p,x.id).isVisible()))};checkpoint('undo-immediate-diagnostic',proof.undoImmediate);
  expect.soft(proof.undoImmediate.newIdsVisible.every(Boolean),'Restored favorites with new IDs must immediately be visible').toBe(true);
  const state=await read(p,'favorite_state_v1');await h.close();p=await open(h,true);await manage(p);expect(await read(p,'favorite_state_v1')).toEqual(state);await expect(undo(p)).toBeDisabled();expect(await calls(p)).toEqual([]);
  expect(await read(p,'receiver_records')).toEqual(protectedReceiver);await p.screenshot({path:info.outputPath('favorites-restored.png'),fullPage:true});
  proof.steps.push('silent-view-and-exact-explicit-replay','text-only-load','delete-all-continuous-undo','favorite-state-offline-process-restart-undo-cleared');
  h.assertNoPrivateOrAiRequests();proof={...proof,passed:proof.importImmediate.importedRowVisible&&proof.deleteImmediate.remainingRows===0&&proof.undoImmediate.newIdsVisible.every(Boolean),initial,edited,restored,protectedReceiverUnchanged:true};
 }catch(error){proof={...proof,passed:false,error:error.message};throw error;}finally{if(h.getPage())await h.getPage().screenshot({path:info.outputPath('favorites-final-state.png'),fullPage:true}).catch(()=>{});await h.close();h.saveEvidence('core-favorites.json',proof);}
});

test('namesake private images reviewed into preparation and favorite preserve selected identity across offline process restarts',async({},info)=>{
 const h=createPersistentBrowserHarness();let proof={passed:false,steps:[]};
 try{
  let p=await open(h);await enterReceiver(p);await receiver(p).getByRole('button',{name:'返回图板',exact:true}).click();await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
  const gallery=manager(p).locator('.PersonalImageManager');await gallery.getByRole('button',{name:'创建个人板',exact:true}).click();
  await expect(gallery.locator('.PersonalImageManager__privacy')).toContainText('已创建个人板');
  for(const color of ['#345899','#896345']){
   const uri=await p.evaluate(color=>{const c=document.createElement('canvas');c.width=40;c.height=40;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,40,40);return c.toDataURL('image/png');},color);
   const people=gallery.locator('[aria-label="人物全名与照片"]');await people.locator('.MuiTextField-root').filter({has:p.getByText('全名',{exact:true})}).locator('input').fill('欧阳明澈');
   await people.locator('input[type=file]').setInputFiles({name:'synthetic-square.png',mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
   await people.getByRole('button',{name:'保存人物',exact:true}).click();
   await expect(people.locator('.MuiTextField-root').filter({has:p.getByText('全名',{exact:true})}).locator('input')).toHaveValue('');
   await expect(gallery.locator('.PersonalImageManager__privacy')).toContainText('人物已保存');
  }
  await manager(p).getByRole('button',{name:/常用语（/}).click();await manager(p).getByRole('button',{name:'准备常用表达',exact:true}).click();await prep(p).getByRole('button',{name:'我想回家',exact:true}).click();
  const text='欧阳明澈今晚不回家吃饭';await prep(p).locator('#receiver-input').fill(text);await prep(p).getByRole('button',{name:'匹配图片',exact:true}).click();
  const choices=prep(p).locator('[aria-label="确认欧阳明澈指谁"]');await expect(choices.getByRole('button')).toHaveCount(2);
  const candidateSources=await choices.getByRole('button').locator('img').evaluateAll(ns=>ns.map(i=>i.currentSrc||i.src));expect(candidateSources).toHaveLength(2);expect(candidateSources[0]).not.toBe(candidateSources[1]);
  const selectedSource=candidateSources[1],selectedPixels=await privatePixels(p,selectedSource);
  await choices.getByRole('button').nth(1).click();
  await expect(choices).toHaveCount(0);
  const missing=prep(p).locator('.CommunicationSupportPanel__matchRow:has(.CommunicationSupportPanel__status--miss)').getByRole('button',{name:'保留文字',exact:true});for(let i=0;i<25;i++){const activated=await missing.evaluateAll(ns=>{if(!ns.length)return false;ns[0].click();return true;});if(!activated)break;}
  await prep(p).getByRole('textbox',{name:'生活情境',exact:true}).fill('饭后散步');const before=Object.values(await read(p,'phrase_preparation'))[0];
  const selectedPerson=before.output.find(x=>x.label==='欧阳明澈');expect(selectedPerson.personId).toBeTruthy();expect(selectedPerson.image).toBe(selectedSource);
  await waitForProductionServiceWorker(p);await h.close();p=await open(h,true);await manage(p);await manager(p).getByRole('button',{name:'准备常用表达',exact:true}).click();await prep(p).getByRole('button',{name:'继续准备',exact:true}).click();
  const resumed=Object.values(await read(p,'phrase_preparation'))[0];expect(resumed).toMatchObject({inputText:before.inputText,lifeContext:before.lifeContext,output:before.output,pictogramSequence:before.pictogramSequence});expect(await calls(p)).toEqual([]);
  await imagesLoaded(prep(p).locator('.CommunicationSupportPanel__results img'));expect(await privatePixels(p,resumed.output.find(x=>x.personId===selectedPerson.personId).image)).toEqual(selectedPixels);
  await save(p);const saved=await read(p,'favorite_state_v1');expect(saved.phrases).toHaveLength(1);expect(saved.phrases[0].output).toEqual(before.output);
  await h.close();p=await open(h,true);await manage(p);expect(await read(p,'favorite_state_v1')).toEqual(saved);
  await row(p,saved.phrases[0].id).getByRole('button',{name:'查看整句',exact:true}).click();expect(await calls(p)).toEqual([]);
  const shown=p.locator('[aria-labelledby=communication-playback-sentence] img');await imagesLoaded(shown);expect(await shown.evaluateAll((ns,src)=>ns.some(i=>i.currentSrc===src&&i.complete&&i.naturalWidth>0),selectedSource)).toBe(true);
  expect(await privatePixels(p,selectedPerson.image)).toEqual(selectedPixels);await p.screenshot({path:info.outputPath('namesake-offline-favorite.png'),fullPage:true});
  h.assertNoPrivateOrAiRequests();proof={passed:true,steps:['two-product-uploaded-geometric-namesakes','explicit-second-person-choice','preparation-offline-process-restart','reviewed-save','favorite-offline-process-restart','decoded-private-images-silent-view'],selectedPersonId:selectedPerson.personId,selectedPixels,before,saved};
 }catch(error){proof={...proof,passed:false,error:error.message};throw error;}finally{if(h.getPage())await h.getPage().screenshot({path:info.outputPath('namesake-final-state.png'),fullPage:true}).catch(()=>{});await h.close();h.saveEvidence('core-namesake.json',proof);}
});

test('source gallery card deletion preserves reviewed favorite identity and decoded image after independent offline restart',async({},info)=>{
 const h=createPersistentBrowserHarness();let proof={passed:false,steps:[]};
 try{
  let p=await open(h);await enterReceiver(p);await receiver(p).getByRole('button',{name:'返回图板',exact:true}).click();await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
  let gallery=manager(p).locator('.PersonalImageManager');await gallery.getByRole('button',{name:'创建个人板',exact:true}).click();await expect(gallery.locator('.PersonalImageManager__privacy')).toContainText('已创建个人板');
  let people=gallery.locator('[aria-label="人物全名与照片"]');const personName='合成林安';
  const sourceInput=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=48;c.height=48;const x=c.getContext('2d');x.fillStyle='#31477b';x.fillRect(0,0,48,48);x.fillStyle='#e4b86d';x.fillRect(12,12,24,24);return c.toDataURL('image/png');});
  await people.locator('.MuiTextField-root').filter({has:p.getByText('全名',{exact:true})}).locator('input').fill(personName);
  await people.locator('input[type=file]').setInputFiles({name:'synthetic-source-square.png',mimeType:'image/png',buffer:Buffer.from(sourceInput.split(',')[1],'base64')});
  await people.getByRole('button',{name:'保存人物',exact:true}).click();await expect(gallery.locator('.PersonalImageManager__privacy')).toContainText('人物已保存');
  await expect(people.locator('.MuiTextField-root').filter({has:p.getByText('全名',{exact:true})}).locator('input')).toHaveValue('');
  const options=await people.locator('select').first().locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,label:n.textContent})));
  const personId=options.find(x=>x.label.includes(personName)).value;await people.locator('select').first().selectOption(personId);
  const boardId=await people.locator('select').nth(1).inputValue();const boardName=await people.locator('select').nth(1).locator('option:checked').innerText();
  const savedSource=await people.locator('img[alt="本人照片预览"]').getAttribute('src');const expectedPixels=await privatePixels(p,savedSource);
  proof.source={personId,boardId,boardName,personName,expectedPixels};proof.steps.push('actual-product-uploaded-geometric-person-card');
  await manager(p).getByRole('button',{name:/常用语（/}).click();await start(p,personName+'想喝水');
  const prepared=Object.values(await read(p,'phrase_preparation'))[0];const snapshotPerson=prepared.output.find(x=>x.personId===personId);
  expect(snapshotPerson).toMatchObject({id:personId,personId,label:personName,image:savedSource});await save(p);
  const before=await read(p,'favorite_state_v1');expect(before.phrases).toHaveLength(1);expect(before.phrases[0].output).toEqual(prepared.output);const favoriteId=before.phrases[0].id;
  await row(p,favoriteId).getByRole('button',{name:'查看整句',exact:true}).click();const overlay=()=>p.locator('[aria-labelledby=communication-playback-sentence]');
  await imagesLoaded(overlay().locator('img'));expect(await overlay().locator('img').evaluateAll((ns,src)=>ns.some(i=>i.currentSrc===src&&i.complete&&i.naturalWidth>0),savedSource)).toBe(true);expect(await calls(p)).toEqual([]);
  await overlay().getByRole('button',{name:'返回',exact:true}).click();
  proof.steps.push('reviewed-product-favorite-save-and-visible-private-snapshot');
  for(let i=0;i<4;i++)await p.getByRole('button',{name:/^(Unlock|解锁)$/}).click();
  const proceed=p.getByRole('button',{name:/Continue editing|继续编辑/});if(await proceed.isVisible())await proceed.click();await dismissBoardTour(p,false);
  await p.locator('#boards-button').click();await p.locator('#boards-menu .CommunicatorToolbar__menuitem').filter({hasText:boardName}).first().click();
  const sourceTile=()=>p.locator('button.Tile',{hasText:personName});await expect(sourceTile()).toBeVisible();expect(new URL(p.url()).pathname).toBe('/board/'+boardId);
  await p.getByRole('button',{name:'edit-board-tiles',exact:true}).click();await sourceTile().click();
  const deleteSelected=()=>p.getByRole('button',{name:/^(Delete selected tiles|删除选中的瓷块|删除选中的图卡)$/});await deleteSelected().click();
  await p.getByRole('dialog').getByRole('button',{name:/^(Cancel|取消)$/}).click();await expect(sourceTile()).toBeVisible();expect(await read(p,'favorite_state_v1')).toEqual(before);
  await deleteSelected().click();await p.getByRole('dialog').getByRole('button',{name:/^(Delete|删除)$/}).click();await expect(sourceTile()).toHaveCount(0);
  expect(await read(p,'favorite_state_v1')).toEqual(before);proof.steps.push('native-source-delete-cancel-preserved','native-source-delete-confirmed-favorite-unchanged');
  await p.screenshot({path:info.outputPath('source-deleted.png'),fullPage:true});await h.close();p=await open(h,true);await manage(p);
  expect(await read(p,'favorite_state_v1')).toEqual(before);await manager(p).getByRole('button',{name:/个人图片/}).click();gallery=manager(p).locator('.PersonalImageManager');people=gallery.locator('[aria-label="人物全名与照片"]');
  const survivingPeople=await people.locator('select').first().locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,label:n.textContent})));
  expect(survivingPeople.some(x=>x.value===personId)).toBe(false);proof.sourceAbsentFromGalleryAfterRestart=true;
  await manager(p).getByRole('button',{name:/常用语（/}).click();await expect(row(p,favoriteId)).toBeVisible();await row(p,favoriteId).getByRole('button',{name:'查看整句',exact:true}).click();
  const decoded=await imageDecodeEvidence(overlay().locator('img'));expect(await overlay().locator('img').evaluateAll((ns,src)=>ns.some(i=>i.currentSrc===src&&i.complete&&i.naturalWidth>0),savedSource)).toBe(true);
  const after=await read(p,'favorite_state_v1');const afterPerson=after.phrases[0].output.find(x=>x.personId===personId);expect(afterPerson).toEqual(snapshotPerson);expect(await privatePixels(p,afterPerson.image)).toEqual(expectedPixels);expect(await calls(p)).toEqual([]);
  await p.screenshot({path:info.outputPath('deleted-source-offline-favorite.png'),fullPage:true});proof.steps.push('independent-offline-process-source-stays-deleted','favorite-person-id-image-snapshot-decoded-pixels-preserved-silent');
  h.assertNoPrivateOrAiRequests();proof={...proof,passed:true,before,after,snapshotPerson,offlineDecodedImages:decoded,scope:'One favorite with a private person snapshot; history and in-progress draft references are not claimed.'};
 }catch(error){proof={...proof,passed:false,error:error.message};throw error;}finally{if(h.getPage())await h.getPage().screenshot({path:info.outputPath('source-deletion-final-state.png'),fullPage:true}).catch(()=>{});await h.close();h.saveEvidence('core-source-deletion.json',proof);}
});
