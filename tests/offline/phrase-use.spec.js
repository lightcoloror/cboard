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

const row=(page,id)=>manage(page).locator(`#saved-phrase-${id}`);
const overlay=page=>page.locator('[role=dialog][aria-labelledby=communication-playback-sentence]');
const undo=page=>manage(page).getByRole('button',{name:'撤销上次删除的常用语',exact:true});
const geometry='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" fill="green"/></svg>');
test('long saved sequences remain reachable from first picture to return button',async({page,context},info)=>{
  const item={...phrase('long','我今晚七点半不回家吃饭。请告诉合成林安，我明早八点回来。'),output:
    Array.from({length:20},(_,i)=>({id:'repeated',label:`合成图卡${i+1}`,image:geometry,personId:`synthetic-${i}`}))};
  await setup(page,context,[item]);
  await row(page,'long').getByRole('button',{name:'查看整句',exact:true}).click();
  await page.setViewportSize({width:375,height:812});
  const screen=overlay(page).locator('.CommunicationSupportPanel__playbackScreen');
  await screen.evaluate(n=>{n.scrollTop=0;});
  const first=await overlay(page).locator('figure').first().boundingBox();
  const frame=await screen.boundingBox();
  expect(first.y).toBeGreaterThanOrEqual(frame.y);
  await expect(overlay(page).locator('figure')).toHaveCount(20);
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  await overlay(page).getByRole('button',{name:'返回',exact:true}).scrollIntoViewIfNeeded();
  await expect(overlay(page).getByRole('button',{name:'返回',exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath('long-sequence-return.png'),fullPage:true});
});
test('search, full silent view, exact replay/load, repeated identities and text-only',async({page,context},info)=>{
  const favorites=Array.from({length:8},(_,i)=>phrase(`item-${i}`,`合成常用句${i}`));
  const identity={...phrase('identity','合成林安今晚七点半不回家吃饭'),lifeContext:'出门',output:[
    {id:'same',label:'合成林安',personId:'synthetic-a',image:geometry},
    {id:'same',label:'合成林安',personId:'synthetic-b',image:geometry},
    {id:'missing',label:'七点半',image:''}]};
  const text={...phrase('text','我今晚不回家吃饭'),lifeContext:'出门',output:[]};
  const audit=await setup(page,context,[...favorites,identity,text]);
  await manage(page).getByLabel('搜索常用语原句').fill('常用句7');
  await expect(row(page,'item-7')).toBeVisible();await expect(row(page,'item-6')).toHaveCount(0);
  await manage(page).getByRole('group',{name:'生活情境筛选'}).getByRole('button',{name:'出门',exact:true}).click();
  await expect(row(page,'item-7')).toHaveCount(0);
  await manage(page).getByLabel('搜索常用语原句').fill('合成林安');
  await row(page,'identity').getByRole('button',{name:'查看整句',exact:true}).click();
  await expect(overlay(page)).toContainText(identity.sentence);
  await expect(overlay(page).locator('figure')).toHaveCount(3);
  await expect(overlay(page)).toContainText('图片不可用');
  for (const viewport of [{width:375,height:812},{width:1600,height:1400}]) {
    await page.setViewportSize(viewport);
    const box = await overlay(page).locator('.CommunicationSupportPanel__playbackMissing').evaluate(node => {
      const range=document.createRange();range.selectNodeContents(node);
      const content=range.getBoundingClientRect(),frame=node.getBoundingClientRect();
      return {contained:content.top>=frame.top&&content.bottom<=frame.bottom&&content.left>=frame.left&&content.right<=frame.right,
        scrollFits:node.scrollHeight<=node.clientHeight+1};
    });
    expect(box).toEqual({contained:true,scrollFits:true});
  }
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  expect((await read(page,'saved_phrases')).find(x=>x.id==='identity').usageCount).toBe(2);
  await overlay(page).getByRole('button',{name:'播报整句',exact:true}).evaluate(n=>{n.click();n.click();});
  await expect(overlay(page)).toContainText('播报完成');
  await overlay(page).getByRole('button',{name:'播报整句',exact:true}).click();
  await expect(overlay(page)).toContainText('播报完成');
  expect((await read(page,'saved_phrases')).find(x=>x.id==='identity').usageCount).toBe(3);
  expect((await page.evaluate(()=>window.__cboardTtsHarness.calls)).map(x=>x.text)).toEqual([identity.sentence,identity.sentence]);
  await page.screenshot({path:info.outputPath('whole-phrase-private-synthetic.png'),fullPage:true});
  await overlay(page).getByRole('button',{name:'返回',exact:true}).click();await management(page);
  await row(page,'identity').getByRole('button',{name:'重用',exact:true}).evaluate(n=>{n.click();n.click();});
  const panel=page.locator('.CommunicationSupportPanel');
  await expect(panel).toContainText(identity.sentence);
  expect((await read(page,'saved_phrases')).find(x=>x.id==='identity').usageCount).toBe(4);
  await management(page);
  await row(page,'text').getByRole('button',{name:'查看整句',exact:true}).click();
  await expect(overlay(page)).toContainText(text.sentence);await expect(overlay(page).locator('figure')).toHaveCount(0);
  await overlay(page).getByRole('button',{name:'返回',exact:true}).click();await management(page);
  await row(page,'text').getByRole('button',{name:'重用',exact:true}).click();
  await expect(panel).toContainText(text.sentence);
  expect(await read(page,'history')).toEqual(audit.history);expect(await read(page,'receiver_records')).toEqual(audit.records);
  expect(audit.errors).toEqual([]);
  expect(audit.requests.some(r=>/generate|resegment|billing|charge/.test(r.url)||/合成林安|data:image/.test(r.body))).toBe(false);
  await info.attach('phrase-use-evidence',{body:JSON.stringify(audit,null,2),contentType:'application/json'});
});

test('offline deletion, continuous undo, write failure retry and reopening preserve other data',async({page,context},info)=>{
  const favorites=['甲','乙','丙'].map((name,i)=>({...phrase(`delete-${i}`,`合成原句${name}`),
    output:[{id:'same',label:`合成姓名${name}`,personId:`synthetic-${i}`,image:geometry}]}));
  const audit=await setup(page,context,favorites);
  await waitForProductionServiceWorker(page);
  await management(page);
  await context.setOffline(true);
  for(const item of favorites) await row(page,item.id).getByRole('button',{name:'删除',exact:true}).click();
  expect(await read(page,'saved_phrases')).toEqual([]);
  await expect(undo(page)).toHaveText(/3/);
  await manage(page).getByRole('button',{name:'返回沟通',exact:true}).click();await management(page);
  await expect(undo(page)).toHaveText(/3/);
  // Before-write failure leaves the undo item available.
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.__restoreStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(k,v){if(k==='cboard_communication_saved_phrases')throw Error('synthetic storage full');return original.call(this,k,v)};});
  await undo(page).click();await expect(manage(page)).toContainText('恢复未能完整保存');
  expect(await read(page,'saved_phrases')).toEqual([]);
  await page.evaluate(()=>window.__restoreStorage());
  // Simulate completion followed by lost acknowledgement; retry uses the same stable ID.
  await page.evaluate(()=>{const original=Storage.prototype.setItem;let failed=false;window.__restoreStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(k,v){original.call(this,k,v);if(k==='cboard_communication_saved_phrases'&&!failed){failed=true;throw Error('synthetic lost acknowledgement')}};});
  await undo(page).click();await expect(manage(page)).toContainText('恢复未能完整保存');
  await page.evaluate(()=>window.__restoreStorage());
  expect(await read(page,'saved_phrases')).toHaveLength(1);
  await undo(page).evaluate(n=>{n.click();n.click();});await expect(undo(page)).toHaveText(/2/);
  await undo(page).click();await undo(page).click();await expect(undo(page)).toBeDisabled();
  const restored=await read(page,'saved_phrases');expect(restored).toHaveLength(3);
  for(const old of favorites){
    const next=restored.find(x=>x.sentence===old.sentence);
    expect(next.id).not.toBe(old.id);expect(next.output).toEqual(old.output);
    expect(next).toMatchObject({lifeContext:old.lifeContext,createdAt:10,lastUsedAt:10,usageCount:2});
  }
  await row(page,restored[0].id).getByRole('button',{name:'删除',exact:true}).click();
  const persisted=await read(page,'saved_phrases'),url=page.url();
  const fresh=await context.newPage();await installBrowserTtsHarness(fresh);await page.close();
  await fresh.goto(url);await management(fresh);await expect(undo(fresh)).toBeDisabled();
  expect(await read(fresh,'saved_phrases')).toEqual(persisted);
  expect(await read(fresh,'history')).toEqual(audit.history);expect(await read(fresh,'receiver_records')).toEqual(audit.records);
  expect(audit.errors).toEqual([]);expect(audit.requests.some(r=>/generate|resegment|billing|charge/.test(r.url)||r.body.includes('data:image'))).toBe(false);
  await fresh.screenshot({path:info.outputPath('offline-reopen-undo-empty.png'),fullPage:true});
  await info.attach('undo-evidence',{body:JSON.stringify({...audit,restored,persisted,offlineNewTab:true},null,2),contentType:'application/json'});
});
