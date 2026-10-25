import fs from 'fs';
import {test,expect} from '../../fork-cboard/cboard/node_modules/@playwright/test';
import {dismissBoardTour,openCaregiverTools,installBrowserTtsHarness,completeCommunicationOnboarding,waitForProductionServiceWorker} from '../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
import {Cboard} from '../../fork-cboard/cboard/tests/page-objects/cboard';
const manager=p=>p.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
async function manage(p){await dismissBoardTour(p,false);const panel=p.locator('.CommunicationSupportPanel');await openCaregiverTools(panel,false);await panel.getByRole('button',{name:'常用语与历史',exact:true}).click();}
async function picture(p){return p.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL('image/png');});}
async function open(h,offline=false){const{page:p}=await h.open({offline,installPage:installBrowserTtsHarness});p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(30000);await p.goto('/board/root',{waitUntil:'domcontentloaded'});await dismissBoardTour(p,false);return p;}
test('BASELINE: rejected IndexedDB write still reports person saved',async()=>{
 const h=createPersistentBrowserHarness();let proof={};
 try{
  let p=await open(h);await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
  const g=manager(p).locator('.PersonalImageManager');await g.getByRole('button',{name:'创建个人板',exact:true}).click();
  const person=g.locator('[aria-label="人物全名与照片"]');const uri=await picture(p);
  await person.locator('.MuiTextField-root').filter({has:p.getByText('全名',{exact:true})}).locator('input').fill('合成林安');
  await person.locator('input[type=file]').setInputFiles({name:'synthetic-local.png',mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
  await expect(person.locator('img[alt="本人照片预览"]')).toBeVisible();
  await p.evaluate(()=>{window.__galleryWritesBlocked=0;const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='persist:root'&&String(value).includes('合成林安')){window.__galleryWritesBlocked++;throw new DOMException('synthetic full disk','QuotaExceededError');}return original.apply(this,arguments);};});
  await person.getByRole('button',{name:'保存人物',exact:true}).click();
  await expect.poll(()=>p.evaluate(()=>window.__galleryWritesBlocked)).toBeGreaterThan(0);
  proof.blockedWrites=await p.evaluate(()=>window.__galleryWritesBlocked);

  await expect(g.getByRole('status')).toContainText('人物已保存');
  proof.buttons=await p.getByRole('button').allTextContents();
  const options=await person.locator('select').first().locator('option').evaluateAll(ns=>ns.map(n=>({text:n.textContent,value:n.value})));
  proof.options=options;const id=options.find(x=>x.text.includes('合成林安')).value;
  await person.locator('select').first().selectOption(id);
  proof.before=await person.locator('img[alt="本人照片预览"]').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}));
  await waitForProductionServiceWorker(p);await h.close();p=await open(h,true);await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
  const restored=manager(p).locator('[aria-label="人物全名与照片"]');proof.restoredOptions=await restored.locator('select').first().locator('option').allTextContents();
  expect(proof.restoredOptions.some(x=>x.includes('合成林安'))).toBe(false);
  proof.falseSuccessReproduced=true;proof.passed=true;return;
  await restored.locator('select').first().selectOption(id);
  await expect(restored.locator('img[alt="本人照片预览"]')).toBeVisible();
  proof.after=await restored.locator('img[alt="本人照片预览"]').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}));
  expect(proof.after).toEqual(proof.before);expect(proof.after.width).toBeGreaterThan(0);
  expect(await p.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
  await p.screenshot({path:__dirname+'/local-photo-offline.png'});h.assertNoPrivateOrAiRequests();proof.passed=true;
 }finally{await h.close();h.saveEvidence('gallery-false-success-baseline.json',proof);}
});

