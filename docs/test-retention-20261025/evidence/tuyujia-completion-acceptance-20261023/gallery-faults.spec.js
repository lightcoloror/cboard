import fs from 'fs';
import {test,expect} from '../../fork-cboard/cboard/node_modules/@playwright/test';
import {dismissBoardTour,openCaregiverTools,installBrowserTtsHarness,completeCommunicationOnboarding,waitForProductionServiceWorker} from '../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
import {Cboard} from '../../fork-cboard/cboard/tests/page-objects/cboard';
const manager=p=>p.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
async function manage(p){await dismissBoardTour(p,false);const panel=p.locator('.CommunicationSupportPanel');await openCaregiverTools(panel,false);await panel.getByRole('button',{name:'常用语与历史',exact:true}).click();}
async function picture(p){return p.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL('image/png');});}
async function open(h,offline=false){const{page:p}=await h.open({offline,installPage:installBrowserTtsHarness});p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(30000);await p.goto('/board/root',{waitUntil:'domcontentloaded'});await dismissBoardTour(p,false);return p;}

for (const mode of ['throw-write','silent-write','lost-readback']) {
 test(`gallery ${mode}: no false success, stable retry and offline process reopen`,async()=>{
  const h=createPersistentBrowserHarness();const proof={mode};
  try {
   let p=await open(h);await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
   const g=manager(p).locator('.PersonalImageManager');await g.getByRole('button',{name:'创建个人板',exact:true}).click();
   await expect(g.locator('.PersonalImageManager__privacy')).toContainText('已创建个人板');
   const person=g.locator('[aria-label="人物全名与照片"]');const uri=await picture(p);
   const name=person.locator('.MuiTextField-root').filter({has:p.getByText('全名',{exact:true})}).locator('input');
   await name.fill('合成林安');
   await person.locator('input[type=file]').setInputFiles({name:'synthetic-local.png',mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
   await expect(person.locator('img[alt="本人照片预览"]')).toBeVisible();
   await p.evaluate(async mode=>{
    const read=()=>new Promise((resolve,reject)=>{const req=indexedDB.open('cboard');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const get=db.transaction('cboard_store').objectStore('cboard_store').get('persist:root');get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};});
    const before=await read();window.__galleryFault={mode,writes:0,reads:0};
    const put=IDBObjectStore.prototype.put,get=IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.put=function(value,key){const f=window.__galleryFault;
     if(f.mode&&key==='persist:root'&&String(value).includes('合成林安')) {f.writes++;if(f.mode==='throw-write')throw new DOMException('synthetic quota full','QuotaExceededError');if(f.mode==='silent-write')return put.call(this,before,key);}
     return put.apply(this,arguments);};
    IDBObjectStore.prototype.get=function(key){const f=window.__galleryFault;if(f.mode==='lost-readback'&&key==='persist:root'&&f.writes){f.reads++;throw new Error('synthetic lost readback');}return get.apply(this,arguments);};
   },mode);
   await person.getByRole('button',{name:'保存人物',exact:true}).evaluate(n=>{n.click();n.click();});
   await expect(g.locator('.PersonalImageManager__privacy')).toContainText('人物保存失败');
   await expect(name).toHaveValue('合成林安');await expect(person.locator('img[alt="本人照片预览"]')).toBeVisible();
   proof.fault=await p.evaluate(()=>window.__galleryFault);expect(proof.fault.writes).toBeGreaterThan(0);
   proof.attemptedOptions=await person.locator('select').first().locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));
   const attempted=proof.attemptedOptions.filter(x=>x.text.includes('合成林安'));expect(attempted).toHaveLength(1);
   await p.evaluate(()=>window.__galleryFault.mode='');
   await g.getByRole('button',{name:'重试保存',exact:true}).click();
   await expect(g.locator('.PersonalImageManager__privacy')).toContainText('人物已保存');await expect(name).toHaveValue('');
   proof.savedOptions=await person.locator('select').first().locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));
   expect(proof.savedOptions.filter(x=>x.text.includes('合成林安'))).toEqual(attempted);
   await person.locator('select').first().selectOption(attempted[0].value);
   proof.before=await person.locator('img[alt="本人照片预览"]').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}));
   await waitForProductionServiceWorker(p);await h.close();p=await open(h,true);await manage(p);await manager(p).getByRole('button',{name:/个人图片/}).click();
   const restored=manager(p).locator('[aria-label="人物全名与照片"]');await restored.locator('select').first().selectOption(attempted[0].value);
   proof.after=await restored.locator('img[alt="本人照片预览"]').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}));
   expect(proof.after).toEqual(proof.before);expect(proof.after.width).toBeGreaterThan(0);
   expect(await p.evaluate(()=>window.__cboardTtsHarness.calls)).toEqual([]);
   await p.screenshot({path:__dirname+`/gallery-${mode}-offline.png`});h.assertNoPrivateOrAiRequests();proof.passed=true;
  }finally{await h.close();h.saveEvidence(`gallery-${mode}.json`,proof);}
 });
}
