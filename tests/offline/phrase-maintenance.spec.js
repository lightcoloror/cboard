import { expect, test } from '@playwright/test';
import { blockRemoteHttpRequests, completeCommunicationOnboarding, dismissBoardTour,
  installBrowserTtsHarness, openCaregiverTools, waitForProductionServiceWorker } from './helpers/communicationSupport';

const read = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(`cboard_communication_${key}`) || 'null'), key);
const prep = page => page.getByRole('dialog', {name:/^准备常用表达/});
const manage = page => page.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
const phrase = (id, sentence) => ({id, sentence, lifeContext:'吃饭', createdAt:10, updatedAt:10, lastUsedAt:10, usageCount:2,
  output:[{id:`text-${id}`,label:sentence,vocalization:sentence,image:'',textOnly:true}]});
async function management(page) {
  await dismissBoardTour(page,false);
  const panel=page.locator('.CommunicationSupportPanel');
  await openCaregiverTools(panel,false);
  await panel.getByRole('button',{name:'常用语与历史',exact:true}).click();
}
async function setup(page, context, favorites) {
  const requests=[], errors=[];
  context.on('request',req=>{
    if(!['GET','HEAD'].includes(req.method())||/\/api\//.test(req.url())||/^https?:/.test(req.url())&&!req.url().startsWith('http://127.0.0.1:4197/'))
      requests.push({url:req.url(),body:req.postData()||''});
  });
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/api/**',route=>route.abort('internetdisconnected'));
  await blockRemoteHttpRequests(page); await installBrowserTtsHarness(page);
  await page.goto('/board/root'); await dismissBoardTour(page,false);
  await page.locator('.CommunicationSupportPanel').getByRole('button',{name:'接收理解',exact:true}).click();
  await completeCommunicationOnboarding(page,false);
  const receiver=page.getByRole('dialog',{name:/接收理解/});
  await receiver.locator('#receiver-input').fill('原对话保持不变');
  await receiver.getByRole('button',{name:'返回图板',exact:true}).click();
  await page.evaluate(items=>localStorage.setItem('cboard_communication_saved_phrases',JSON.stringify(items)),favorites);
  await page.reload(); await management(page);
  return {requests,errors,records:await read(page,'receiver_records'),history:await read(page,'history')};
}
async function review(page,text) {
  if(text!==undefined) await prep(page).locator('#receiver-input').fill(text);
  await prep(page).getByRole('button',{name:'匹配图片',exact:true}).click();
  await expect(prep(page).locator('.CommunicationSupportPanel__results')).toBeVisible();
  const missing=prep(page).getByRole('button',{name:'保留文字',exact:true});
  while(await missing.count()) await missing.first().click();
}
async function openEdit(page,id,copy=false) {
  await manage(page).locator(`#saved-phrase-${id}`).getByRole('button',{name:copy?'以此准备新句':'修改这条',exact:true}).click();
  await expect(prep(page).locator('#receiver-input')).toBeVisible();
}
async function upload(page,phrases) {
  const input={format:'cboard-communication-saved-phrases',version:1,phrases};
  await manage(page).locator('input[type=file]').first().setInputFiles({name:'synthetic-phrases.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
  await expect(manage(page).getByRole('group',{name:'常用语导入预览'})).toBeVisible();
}

test('edit, copy, conflict, cleanup failure and offline resume protect original records',async({page,context},info)=>{
  const audit=await setup(page,context,[phrase('original','我想喝水')]);
  const before=await read(page,'saved_phrases');
  await openEdit(page,'original');
  await expect(prep(page)).toContainText('原图没有可靠文字位置');
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  await prep(page).locator('#receiver-input').fill('我不想喝水');
  await expect(prep(page).getByRole('button',{name:'确认更新这条常用语',exact:true})).toHaveCount(0);
  await prep(page).getByRole('button',{name:'取消准备',exact:true}).click();
  expect(await read(page,'saved_phrases')).toEqual(before);
  await prep(page).getByRole('button',{name:'稍后继续',exact:true}).first().click();
  await openEdit(page,'original'); await review(page,'我不想喝水');
  await prep(page).getByRole('button',{name:'稍后继续',exact:true}).first().click();
  await waitForProductionServiceWorker(page); await context.setOffline(true); await page.close();
  page=await context.newPage(); await installBrowserTtsHarness(page);
  const response=await page.goto('/board/root'); expect(response.fromServiceWorker()).toBe(true);
  await management(page); await manage(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
  await prep(page).getByRole('button',{name:'继续准备',exact:true}).click();
  await expect(prep(page).locator('#receiver-input')).toHaveValue('我不想喝水');
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  const pending=await read(page,'phrase_preparation');
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.__restoreStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(key,value){if(key==='cboard_communication_phrase_preparation')throw new Error('synthetic cleanup full');return original.call(this,key,value)};});
  await prep(page).getByRole('button',{name:'确认更新这条常用语',exact:true}).evaluate(node=>{node.click();node.click();});
  await expect(manage(page)).toContainText('我不想喝水');
  await page.evaluate(()=>window.__restoreStorage());
  expect(await read(page,'phrase_preparation')).toEqual(pending);
  await manage(page).getByRole('button',{name:'准备常用表达',exact:true}).click();
  await prep(page).getByRole('button',{name:'继续准备',exact:true}).click();
  await prep(page).getByRole('button',{name:'确认更新这条常用语',exact:true}).click();
  await expect(manage(page)).toBeVisible();
  const edited=await read(page,'saved_phrases');
  expect(edited).toHaveLength(1); expect(edited[0]).toMatchObject({id:'original',sentence:'我不想喝水',createdAt:10,usageCount:2});
  await openEdit(page,'original',true); await review(page,'请给我温水');
  await prep(page).getByRole('button',{name:'确认另存为新常用语',exact:true}).evaluate(node=>{node.click();node.click();});
  await expect(manage(page)).toBeVisible();
  let items=await read(page,'saved_phrases'); expect(items).toHaveLength(2);
  expect(items.find(item=>item.id==='original')).toEqual(edited[0]);
  await openEdit(page,'original'); await review(page,'请帮我拿水杯');
  await page.evaluate(()=>{const key='cboard_communication_saved_phrases';const list=JSON.parse(localStorage.getItem(key));list.find(x=>x.id==='original').sentence='另一处改过的原句';localStorage.setItem(key,JSON.stringify(list));});
  await prep(page).getByRole('button',{name:'确认更新这条常用语',exact:true}).click();
  await expect(prep(page)).toContainText('原收藏已变化');
  await prep(page).getByRole('button',{name:'改为另存新句',exact:true}).click();
  await prep(page).getByRole('button',{name:'确认另存为新常用语',exact:true}).click();
  await expect(manage(page)).toBeVisible();
  items=await read(page,'saved_phrases'); expect(items).toHaveLength(3);
  expect(items.find(item=>item.id==='original').sentence).toBe('另一处改过的原句');
  expect(await read(page,'receiver_records')).toEqual(audit.records); expect(await read(page,'history')).toEqual(audit.history);
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  expect(audit.requests.some(req=>/generate|resegment|billing|charge/i.test(req.url)||/data:image|原对话保持不变/.test(req.body))).toBe(false);
  expect(audit.errors).toEqual([]);
  await expect(manage(page).locator('..')).toHaveCSS('opacity','1');
  await page.screenshot({path:info.outputPath('edited-copied-conflict.png'),fullPage:true});
  await info.attach('maintenance-evidence',{body:JSON.stringify({...audit,offlineNewTab:true,editCopyCancel:true,cleanupFailureRetry:true,conflictNoOverwrite:true,finalFavoriteCount:items.length},null,2),contentType:'application/json'});
});

test('import preview is zero-write until confirmation; capacity, stale preview and write failure preserve old list',async({page,context},info)=>{
  const old=Array.from({length:99},(_,i)=>phrase(`old-${i}`,`合成旧句${i}`));
  const audit=await setup(page,context,old);
  await upload(page,[phrase('new-a','合成新增甲'),phrase('new-b','合成新增乙')]);
  await expect(manage(page)).toContainText('容量不足');
  await expect(manage(page).getByRole('button',{name:'确认整批导入',exact:true})).toBeDisabled();
  expect(await read(page,'saved_phrases')).toEqual(old);
  await manage(page).getByRole('button',{name:'取消导入',exact:true}).click();
  await upload(page,[phrase('new-a','合成新增甲'),phrase('old-0','不能覆盖'),phrase('different-id','合成旧句1'),null]);
  const preview=manage(page).getByRole('group',{name:'常用语导入预览'});
  await expect(preview).toContainText('预计新增 1 条；重复 2 条；无效 1 条');
  expect(await read(page,'saved_phrases')).toEqual(old);
  await page.evaluate(()=>{const key='cboard_communication_saved_phrases';const items=JSON.parse(localStorage.getItem(key));items[0].usageCount+=1;localStorage.setItem(key,JSON.stringify(items));});
  await manage(page).getByRole('button',{name:'确认整批导入',exact:true}).click();
  await expect(manage(page)).toContainText('预览已刷新');
  expect(await read(page,'saved_phrases')).toHaveLength(99);
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.__restoreStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(key,value){if(key==='cboard_communication_saved_phrases')throw new Error('synthetic storage full');return original.call(this,key,value)};});
  await manage(page).getByRole('button',{name:'确认整批导入',exact:true}).click();
  await expect(manage(page)).toContainText('保存失败'); expect(await read(page,'saved_phrases')).toHaveLength(99);
  await page.evaluate(()=>window.__restoreStorage());
  await manage(page).getByRole('button',{name:'确认整批导入',exact:true}).evaluate(node=>{node.click();node.click();});
  await expect(manage(page)).toContainText('已导入 1 条');
  const final=await read(page,'saved_phrases'); expect(final).toHaveLength(100);
  expect(final.filter(item=>item.id.startsWith('old-')).map(item=>item.id).sort()).toEqual(old.map(item=>item.id).sort());
  await upload(page,[phrase('new-b','合成新增乙')]); await expect(manage(page)).toContainText('容量不足');
  expect(await read(page,'saved_phrases')).toEqual(final);
  await upload(page,[{...phrase('private-import','合成人物欧阳明澈'),output:[{id:'unavailable-person',label:'欧阳明澈',personId:'unavailable-person',image:'https://example.invalid/private.png'}]}]);
  await expect(manage(page).getByRole('group',{name:'常用语导入预览'})).toContainText('缺少图片 1 个');
  expect(audit.requests.some(req=>req.url.includes('example.invalid')||req.body.includes('欧阳明澈'))).toBe(false);
  await manage(page).locator('input[type=file]').first().setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  await expect(manage(page)).toContainText('不是合法的 JSON');
  await expect(manage(page).getByRole('button',{name:'确认整批导入',exact:true})).toBeDisabled();
  expect(await read(page,'saved_phrases')).toEqual(final);
  expect(await read(page,'receiver_records')).toEqual(audit.records); expect(await read(page,'history')).toEqual(audit.history);
  expect(audit.errors).toEqual([]);
  await page.screenshot({path:info.outputPath('capacity-preview-zero-write.png'),fullPage:true});
  await info.attach('import-evidence',{body:JSON.stringify({...audit,oldCount:99,finalCount:100,stalePreviewReconfirmed:true,writeFailureRetried:true,capacityZeroWrite:true},null,2),contentType:'application/json'});
});
