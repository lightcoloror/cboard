import { expect, test } from '@playwright/test';
import { blockRemoteHttpRequests, completeCommunicationOnboarding, dismissBoardTour,
  installBrowserTtsHarness, openCaregiverTools, openPatientExpression, waitForProductionServiceWorker } from './helpers/communicationSupport';

const starters = ['我想喝水','我不想吃饭','我要刷牙','请帮我洗手','我想出门','我想回家','我想休息','请安静一点','我不舒服','请再说一遍','我想聊一会儿','我不同意'];
const contexts = ['吃饭','吃饭','洗漱','洗漱','出门','出门','休息','休息','就医','就医','聊天','聊天'];
const read = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(`cboard_communication_${key}`) || 'null'), key);
const prepare = page => page.getByRole('dialog', { name: /^准备常用表达/ });
const manage = page => page.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
async function review(page) {
  await prepare(page).getByRole('button', { name: '匹配图片', exact: true }).click();
  await expect(prepare(page).locator('.CommunicationSupportPanel__results')).toBeVisible();
  const missing = prepare(page).getByRole('button', { name: '保留文字', exact: true });
  while (await missing.count()) await missing.first().click();
}
async function openPreparation(page) { await manage(page).getByRole('button', { name: '准备常用表达', exact: true }).click(); }

test('12 starters, edited private people, cancel, duplicate, failure and offline reopen use existing review safely', async ({ page, context }, info) => {
  test.setTimeout(240000);
  const requests = [], errors = [];
  context.on('request', req => {
    if (!['GET','HEAD'].includes(req.method()) || /\/api\//.test(req.url()) || /^https?:/.test(req.url()) && !req.url().startsWith('http://127.0.0.1:4197/'))
      requests.push({url:req.url(), method:req.method(), body:req.postData() || ''});
  });
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/api/**', route => route.abort('internetdisconnected'));
  await blockRemoteHttpRequests(page); await installBrowserTtsHarness(page);
  await page.goto('/board/root'); await dismissBoardTour(page, false);
  const panel = page.locator('.CommunicationSupportPanel');
  await panel.getByRole('button', {name:'接收理解',exact:true}).click(); await completeCommunicationOnboarding(page,false);
  const receiver = page.getByRole('dialog', {name:/接收理解/});
  await receiver.locator('#receiver-input').fill('原对话不应被覆盖');
  await receiver.getByRole('button',{name:'返回图板',exact:true}).click();
  const original = await read(page,'receiver_records');
  await expect(page.locator('.SymbolOutput')).toHaveCount(1);
  const outputBefore = await page.locator('.SymbolOutput__value').allTextContents();
  await openCaregiverTools(panel,false);
  await panel.getByRole('button',{name:'常用语与历史',exact:true}).click();
  for (let i=0;i<starters.length;i++) {
    await openPreparation(page);
    await expect(prepare(page).locator('#receiver-input')).toHaveCount(0);
    await prepare(page).getByRole('button',{name:starters[i],exact:true}).click();
    await expect(prepare(page).locator('#receiver-input')).toHaveValue(starters[i]);
    await expect(prepare(page).getByText('最近历史',{exact:true})).toHaveCount(0);
    await expect(prepare(page).getByText('粤语输入与转图卡',{exact:true})).toHaveCount(0);
    await expect(prepare(page).locator('.CommunicationSupportPanel__results')).toHaveCount(0);
    await review(page);
    await prepare(page).getByRole('button',{name:'确认存为常用语',exact:true}).evaluate(node => { node.click(); node.click(); });
    await expect(manage(page).locator('.CommunicationSupportPanel__managementList')).toContainText(starters[i]);
    const items = await read(page,'saved_phrases');
    expect(items).toHaveLength(i+1); expect(items.find(item=>item.sentence===starters[i]).lifeContext).toBe(contexts[i]);
  }
  const beforeDuplicate = await read(page,'saved_phrases');
  await openPreparation(page); await prepare(page).getByRole('button',{name:starters[0],exact:true}).click();
  await review(page); await prepare(page).getByRole('button',{name:'确认存为常用语',exact:true}).click();
  await expect(prepare(page)).toContainText('相同文字已收藏');
  expect(await read(page,'saved_phrases')).toEqual(beforeDuplicate);
  await prepare(page).getByRole('button',{name:'取消准备',exact:true}).click();
  await prepare(page).getByRole('button',{name:'稍后继续',exact:true}).first().click();
  // Add two synthetic people with the same full name through the existing gallery.
  await manage(page).getByRole('button',{name:/个人图片/}).click();
  const gallery = manage(page).locator('.PersonalImageManager');
  await gallery.getByRole('button',{name:'创建个人板',exact:true}).click();
  const photos = [];
  for (const color of ['#345899','#896345']) {
    const uri = await page.evaluate(color=>{const c=document.createElement('canvas');c.width=80;c.height=80;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,80,80);x.fillStyle='white';x.fillRect(20,20,40,40);return c.toDataURL('image/png');},color); photos.push(uri);
    const people = gallery.locator('[aria-label="人物全名与照片"]');
    await people.locator('.MuiTextField-root').filter({has:page.getByText('全名',{exact:true})}).locator('input').fill('欧阳明澈');
    await people.locator('input[type=file]').setInputFiles({name:`synthetic-${color.slice(1)}.png`,mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
    await people.getByRole('button',{name:'保存人物',exact:true}).click();
    await expect(gallery.getByRole('status')).toContainText('人物已保存');
  }
  await manage(page).getByRole('button',{name:/常用语（/}).click();
  await openPreparation(page); await prepare(page).getByRole('button',{name:'我想回家',exact:true}).click(); await review(page);
  const text = '欧阳明澈今晚不回家吃饭';
  await prepare(page).locator('#receiver-input').fill(text);
  await expect(prepare(page).locator('.CommunicationSupportPanel__results')).toHaveCount(0);
  await prepare(page).getByRole('textbox',{name:'生活情境',exact:true}).fill('饭后散步');
  await prepare(page).getByRole('button',{name:'匹配图片',exact:true}).click();
  const peopleChoices=prepare(page).locator('[aria-label="确认欧阳明澈指谁"]');
  await expect(peopleChoices.getByRole('button')).toHaveCount(2);
  await peopleChoices.getByRole('button').nth(1).click();
  let missing=prepare(page).getByRole('button',{name:'保留文字',exact:true});
  while(await missing.count()) await missing.first().click();
  const draft = Object.values(await read(page,'phrase_preparation'))[0];
  expect(draft.output.some(item=>item.image?.startsWith('data:image'))).toBe(true);
  await prepare(page).getByRole('button',{name:'稍后继续',exact:true}).first().click();
  await openPreparation(page); await expect(prepare(page)).toContainText('已有准备草稿');
  await prepare(page).getByRole('button',{name:'继续准备',exact:true}).click();
  await expect(prepare(page).locator('#receiver-input')).toHaveValue(text);
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.__restoreStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(key,value){if(key==='cboard_communication_saved_phrases')throw new Error('synthetic storage full');return original.call(this,key,value)};});
  await prepare(page).getByRole('button',{name:'确认存为常用语',exact:true}).click();
  await expect(prepare(page)).toContainText('保存失败');
  expect(await read(page,'saved_phrases')).toEqual(beforeDuplicate);
  await page.evaluate(()=>window.__restoreStorage());
  await waitForProductionServiceWorker(page); await context.setOffline(true); await page.close();
  page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message)); await installBrowserTtsHarness(page);
  const response=await page.goto('/board/root'); expect(response.fromServiceWorker()).toBe(true);
  await dismissBoardTour(page,false); await openCaregiverTools(page.locator('.CommunicationSupportPanel'),false);
  await page.locator('.CommunicationSupportPanel').getByRole('button',{name:'常用语与历史',exact:true}).click();
  await openPreparation(page); await prepare(page).getByRole('button',{name:'继续准备',exact:true}).click();
  await expect(prepare(page).locator('#receiver-input')).toHaveValue(text);
  await expect(prepare(page).getByRole('textbox',{name:'生活情境',exact:true})).toHaveValue('饭后散步');
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  const pictures=prepare(page).locator('.CommunicationSupportPanel__results img');
  await expect.poll(()=>pictures.evaluateAll(nodes=>nodes.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
  await page.screenshot({path:info.outputPath('offline-prepared-review.png'),fullPage:true});
  await prepare(page).getByRole('button',{name:'确认存为常用语',exact:true}).click();
  await expect(manage(page).locator('.CommunicationSupportPanel__managementList')).toContainText(text);
  const final = await read(page,'saved_phrases'); expect(final).toHaveLength(13);
  expect(final[0].sentence).toBe(text); expect(final[0].lifeContext).toBe('饭后散步');
  expect(final[0].output.find(item=>item.label==='欧阳明澈').image).toBe(draft.output.find(item=>item.label==='欧阳明澈').image);
  expect(await read(page,'receiver_records')).toEqual(original);
  expect(await read(page,'history')).toEqual([]);
  expect(await page.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  expect(requests.some(req=>/generate|resegment|billing|charge/i.test(req.url))).toBe(false);
  expect(requests.some(req=>(decodeURIComponent(req.url)+req.body).includes('欧阳明澈')||req.body.includes('data:image')||photos.some(photo=>req.body.includes(photo.split(',')[1])))).toBe(false);
  expect(await page.locator('.SymbolOutput__value').allTextContents()).toEqual(outputBefore);
  await manage(page).getByRole('button',{name:'返回沟通',exact:true}).click();
  await openPatientExpression(page.locator('.CommunicationSupportPanel'),false);
  const expression=page.locator('#communication-expression-panel');
  await expression.getByRole('group',{name:'生活情境筛选'}).getByRole('button',{name:'饭后散步',exact:true}).click();
  await expression.locator('.CommunicationSupportPanel__savedList').getByRole('button',{name:'一键播报',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__cboardTtsHarness.calls.at(-1)?.text)).toBe(text);
  await page.locator('[role=dialog][aria-labelledby=communication-playback-sentence]').getByRole('button',{name:'返回',exact:true}).click();
  expect(errors).toEqual([]);
  await info.attach('preparation-evidence',{body:JSON.stringify({starterCount:12,favoriteCount:13,originalRecordUnchanged:true,offlineNewTab:true,syntheticPeople:true,noAutomaticSpeech:true,explicitReplayExactText:true,outputUnchanged:true,outputBefore,requests,errors},null,2),contentType:'application/json'});
});
