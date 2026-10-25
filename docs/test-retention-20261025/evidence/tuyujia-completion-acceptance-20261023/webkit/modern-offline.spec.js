import fs from 'fs';
import path from 'path';
import {spawn} from 'child_process';
import {once} from 'events';
import {test,expect} from '../../../fork-cboard/cboard/node_modules/@playwright/test';
import {installBrowserTtsHarness,dismissBoardTour,openCaregiverTools,waitForProductionServiceWorker} from '../../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
const modern=require('C:/Users/lightcolor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('modern WebKit production cache and photo restoration with owned origin stopped',async()=>{
 const h=createPersistentBrowserHarness({browserType:modern.webkit});const layers=[];const serverLog=[];let server,serverExited=false;let photo;
 async function stop(){if(!server||serverExited)return;const done=once(server,'exit');server.kill();await done;serverExited=true;}
 const manager=p=>p.locator('[role="dialog"][aria-labelledby="communication-management-title"]');
 async function manage(p){
  const skip=p.locator('[data-test-id="button-skip"]');
  // Preserve the existing helper's bounded wait: the tour mounts asynchronously.
  await skip.waitFor({state:'visible',timeout:2000}).catch(()=>{});
  if(await skip.isVisible()){await skip.click();await p.locator('.react-joyride__overlay').waitFor({state:'hidden'});}
  const panel=p.locator('.CommunicationSupportPanel');const toggle=panel.getByRole('button',{name:'照护工具'});
  if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  await panel.getByRole('button',{name:'常用语与历史',exact:true}).click();await manager(p).getByRole('button',{name:/个人图片/}).click();
 }
 async function probe(name,p,action){const r={name};try{const response=await action();await p.getByRole('heading',{name:'图语家双向沟通'}).waitFor({state:'visible',timeout:8000});r.loaded=true;r.fromServiceWorker=response?.fromServiceWorker();r.documentTitle=await p.title();r.images=await p.evaluate(async()=>Promise.all([...document.images].map(async i=>{try{await i.decode();return{src:i.getAttribute('src'),decoded:true,width:i.naturalWidth};}catch(e){return{src:i.getAttribute('src'),decoded:false,error:e.message};}})));}catch(e){r.loaded=false;r.error=e.message;}layers.push(r);return r;}
 try{
  const repo=path.resolve(__dirname,'../../../fork-cboard/cboard');server=spawn(process.execPath,[path.join(repo,'scripts/serve-offline-build.mjs')],{cwd:repo,env:{...process.env,PLAYWRIGHT_OFFLINE_HOST:'127.0.0.1',PLAYWRIGHT_OFFLINE_PORT:'4208',PLAYWRIGHT_OFFLINE_BUILD_PATH:process.env.WEBKIT_BUILD_PATH||'.local-build-20261023-targeted-ui-v2'},windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>serverLog.push(String(d)));server.stderr.on('data',d=>serverLog.push(String(d)));await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('owned server startup timeout')),10000);server.stdout.on('data',d=>{if(String(d).includes('listening')){clearTimeout(timer);resolve();}});server.once('error',reject);});
  let {context,page}=await h.open({installPage:installBrowserTtsHarness});page.setDefaultNavigationTimeout(15000);await page.goto('/board/root');await waitForProductionServiceWorker(page);await manage(page);
  const gallery=manager(page).locator('.PersonalImageManager');
  await gallery.getByRole('button',{name:'创建个人板',exact:true}).click();
  const person=gallery.locator('[aria-label="人物全名与照片"]');
  const uri=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL('image/png');});
  await person.locator('.MuiTextField-root').filter({has:page.getByText('全名',{exact:true})}).locator('input').fill('合成林安');
  await person.locator('input[type=file]').setInputFiles({name:'synthetic-local.png',mimeType:'image/png',buffer:Buffer.from(uri.split(',')[1],'base64')});
  await person.getByRole('button',{name:'保存人物',exact:true}).click();
  // v2 has a second status while durability is pending; await the specific success notice.
  await expect.poll(()=>gallery.locator('.PersonalImageManager__privacy').textContent()).toContain('人物已保存');
  await gallery.getByText('正在确认本机保存…',{exact:true}).waitFor({state:'hidden'});
  const options=await person.locator('select').first().locator('option').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,value:n.value})));
  const id=options.find(o=>o.text.includes('合成林安')).value;
  await person.locator('select').first().selectOption(id);
  photo={id,before:await person.locator('img[alt="本人照片预览"]').evaluate(async i=>{await i.decode();return{src:i.src,width:i.naturalWidth,height:i.naturalHeight,decoded:true};})};
  const preconditions=await page.evaluate(async()=>({controller:!!navigator.serviceWorker.controller,caches:await Promise.all((await caches.keys()).map(async name=>({name,count:(await(await caches.open(name)).keys()).length}))),indexCached:!!await caches.match('/index.html',{ignoreSearch:true})}));layers.push({name:'online-precondition',...preconditions});expect(preconditions.indexCached).toBe(true);
  if(process.env.MODERN_USE_OFFLINE_FLAG!=='0'){await context.setOffline(true);await probe('setOffline-same-page',page,()=>page.reload({waitUntil:'domcontentloaded'}));await context.setOffline(false);await page.goto('/board/root',{waitUntil:'domcontentloaded'});}else{layers.push({name:'setOffline-same-page',executed:false,reason:'isolated origin-stopped control; failed setOffline evidence retained in prior run'});await page.goto('/board/root',{waitUntil:'domcontentloaded'});}
  await stop();layers.push({name:'origin-stopped',serverPid:server.pid,serverExited,offlineEmulationFlag:false});
  const reload=await probe('origin-stopped-same-page',page,()=>page.reload({waitUntil:'domcontentloaded'}));expect(reload.loaded).toBe(true);expect(reload.fromServiceWorker).toBe(true);
  const newPage=await context.newPage();newPage.setDefaultNavigationTimeout(15000);await installBrowserTtsHarness(newPage);const fresh=await probe('origin-stopped-new-page-same-context',newPage,()=>newPage.goto('http://127.0.0.1:4208/board/root',{waitUntil:'domcontentloaded'}));expect(fresh.loaded).toBe(true);expect(fresh.fromServiceWorker).toBe(true);await h.close();
  ({context,page}=await h.open({installPage:installBrowserTtsHarness}));page.setDefaultNavigationTimeout(15000);const restart=await probe('origin-stopped-new-process',page,()=>page.goto('/board/root',{waitUntil:'domcontentloaded'}));expect(restart.loaded).toBe(true);expect(restart.fromServiceWorker).toBe(true);expect(restart.images.every(i=>i.decoded)).toBe(true);
  await manage(page);const restored=manager(page).locator('[aria-label="人物全名与照片"]');await restored.locator('select').first().selectOption(id);await restored.locator('img[alt="本人照片预览"]').waitFor({state:'visible'});photo.after=await restored.locator('img[alt="本人照片预览"]').evaluate(async i=>{await i.decode();return{src:i.src,width:i.naturalWidth,height:i.naturalHeight,decoded:true};});expect(photo.after).toEqual(photo.before);photo.passed=true;await page.screenshot({path:__dirname+'/'+(process.env.MODERN_RUN||'modern')+'-photo-origin-stopped-restart.png'});h.assertNoPrivateOrAiRequests();
 }finally{await h.close();await stop();fs.writeFileSync(__dirname+'/'+(process.env.MODERN_RUN||'modern')+'-server.log',serverLog.join(''));h.saveEvidence('modern-offline.json',{playwright:'1.62.1',webkit:'26.5',revision:'2336',buildPath:process.env.WEBKIT_BUILD_PATH||'.local-build-20261023-targeted-ui-v2',reportRun:process.env.MODERN_RUN||'modern-offline',layers,photo,serverExited,interpretation:'Origin-stopped checks leave offline emulation false and are server-unavailability tests, not system network-off or native iOS proof.'});}
});
