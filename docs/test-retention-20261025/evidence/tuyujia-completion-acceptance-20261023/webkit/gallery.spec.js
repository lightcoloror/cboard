import fs from 'fs';
import {test,expect} from '../../../fork-cboard/cboard/node_modules/@playwright/test';
import {dismissBoardTour,openCaregiverTools,installBrowserTtsHarness,completeCommunicationOnboarding,waitForProductionServiceWorker} from '../../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
import {Cboard} from '../../../fork-cboard/cboard/tests/page-objects/cboard';
const manager=p=>p.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
async function manage(p){await dismissBoardTour(p,false);const panel=p.locator('.CommunicationSupportPanel');await openCaregiverTools(panel,false);await panel.getByRole('button',{name:'常用语与历史',exact:true}).click();}
async function picture(p){return p.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL('image/png');});}
async function open(h,offline=false){const{page:p}=await h.open({offline,installPage:installBrowserTtsHarness});p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(30000);await p.goto('/board/root',{waitUntil:'domcontentloaded'});await dismissBoardTour(p,false);return p;}
test('new local photo saved through product, decoded after independent online browser restart',async()=>{
 const h=createPersistentBrowserHarness();let proof={};
 try{
  let p=await open(h);await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
  const g=manager(p).locator('.PersonalImageManager');await g.getByRole('button',{name:'创建个人板',exact:true}).click();
  const person=g.locator('[aria-label="人物全名与照片"]');const uri=await picture(p);
  await person.locator('.MuiTextField-root').filter({has:p.getByText('全名',{exact:true})}).locator('input').fill('合成林安');
  await person.locator('input[type=file]').setInputFiles({name:'synthetic-local.png',mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
  await expect(person.locator('img[alt="本人照片预览"]')).toBeVisible();await person.getByRole('button',{name:'保存人物',exact:true}).click();
  await expect(g.getByRole('status')).toContainText('人物已保存');
  proof.buttons=await p.getByRole('button').allTextContents();
  const options=await person.locator('select').first().locator('option').evaluateAll(ns=>ns.map(n=>({text:n.textContent,value:n.value})));
  proof.options=options;const id=options.find(x=>x.text.includes('合成林安')).value;
  await person.locator('select').first().selectOption(id);
  proof.before=await person.locator('img[alt="本人照片预览"]').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}));
  await waitForProductionServiceWorker(p);await h.close();p=await open(h,false);proof.restartOffline=false;await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
  const restored=manager(p).locator('[aria-label="人物全名与照片"]');await restored.locator('select').first().selectOption(id);
  await expect(restored.locator('img[alt="本人照片预览"]')).toBeVisible();
  proof.after=await restored.locator('img[alt="本人照片预览"]').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}));
  expect(proof.after).toEqual(proof.before);expect(proof.after.width).toBeGreaterThan(0);
  expect(await p.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  await p.screenshot({path:__dirname+'/local-photo-online-restart.png'});h.assertNoPrivateOrAiRequests();proof.passed=true;
 }finally{await h.close();h.saveEvidence('local-photo-restart.json',proof);}
});

test('CBoard card and folder-link deletion requires confirmation; cancel preserves content',async()=>{
 const h=createPersistentBrowserHarness();let proof={};
 try{
  const p=await open(h);proof.step='opened';const c=new Cboard(p);
  for(let i=0;i<4;i++){await p.getByRole('button',{name:/^(Unlock|解锁)$/}).click();}
  const proceed=p.getByRole('button',{name:/Continue editing|继续编辑/});if(await proceed.isVisible())await proceed.click();
  await dismissBoardTour(p,false);
  async function create(label,folder=false){await p.getByRole('button',{name:/^(Add Tile|添加瓷块|添加图卡)$/}).click();await p.locator('input#label').fill(label);if(folder)await p.getByRole('radio',{name:/^(Folder|文件夹)$/}).click();await p.locator('button#save-button').click();await expect(p.locator('input#label')).toBeHidden();}
  await create('Synthetic card');proof.step='card-created';await create('Synthetic folder',true);
  await expect(p.locator('input#label')).toBeHidden();
  const folder=c.getTileByLabel('Synthetic folder');await expect(folder).toBeVisible();
  // A folder is a navigation card: deleting this card must not delete its target board.
  await folder.click();await p.waitForURL(url=>url.pathname!=='/board/root');const folderUrl=p.url();await create('Synthetic child');
  await p.goBack();await dismissBoardTour(p,false);proof.step='folder-child-created';
  await p.getByRole('button',{name:'edit-board-tiles',exact:true}).click();
  await c.getTileByLabel('Synthetic card').click();await c.getTileByLabel('Synthetic folder').click();
  await p.getByRole('button',{name:/^(Delete selected tiles|删除选中的瓷块|删除选中的图卡)$/}).click();
  const modal=p.getByRole('dialog');
  await modal.getByRole('button',{name:/^(Cancel|取消)$/}).click();
  await expect(c.getTileByLabel('Synthetic card')).toBeVisible();await expect(folder).toBeVisible();
  await p.getByRole('button',{name:/^(Delete selected tiles|删除选中的瓷块|删除选中的图卡)$/}).click();
  await modal.getByRole('button',{name:/^(Delete|删除)$/}).click();
  await expect(c.getTileByLabel('Synthetic card')).toHaveCount(0);await expect(folder).toHaveCount(0);
  await p.goto(folderUrl,{waitUntil:'domcontentloaded'});await expect(c.getTileByLabel('Synthetic child')).toBeVisible();
  proof.folderUrl=folderUrl;proof.childPreserved=true;proof.cancelPreserved=true;
  await waitForProductionServiceWorker(p);await h.close();
  const resumed=await open(h,false);proof.restartOffline=false;await expect(new Cboard(resumed).getTileByLabel('Synthetic card')).toHaveCount(0);
  await resumed.goto(folderUrl,{waitUntil:'domcontentloaded'});await expect(new Cboard(resumed).getTileByLabel('Synthetic child')).toBeVisible();
  h.assertNoPrivateOrAiRequests();proof.passed=true;proof.deletionUndoOffered=false;
 }catch(error){const p=h.getPage();if(p&&!p.isClosed()){proof.text=await p.locator('body').innerText().catch(()=>null);await p.screenshot({path:__dirname+'/delete-debug.png'}).catch(()=>{});}throw error;
 }finally{await h.close();h.saveEvidence('card-folder-delete.json',proof);}
});
