import fs from 'fs';
import {test,expect} from '../../../fork-cboard/cboard/node_modules/@playwright/test';
import {installBrowserTtsHarness,dismissBoardTour} from '../../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
test('Windows WebKit secure loopback capabilities and bundled image decode',async()=>{
 const h=createPersistentBrowserHarness();let capabilities;
 try{const{page}=await h.open({installPage:installBrowserTtsHarness});await page.goto('/board/root');await dismissBoardTour(page,false);
 await expect(page.getByRole('heading',{name:'图语家双向沟通'})).toBeVisible();
 capabilities=await page.evaluate(async()=>({ua:navigator.userAgent,secureContext:isSecureContext,serviceWorker:'serviceWorker' in navigator,caches:'caches' in window,indexedDB:'indexedDB' in window,images:await Promise.all([...document.images].map(async i=>{try{await i.decode();return {src:i.getAttribute('src'),ok:true,width:i.naturalWidth};}catch(e){return {src:i.getAttribute('src'),ok:false,error:e.message};}}))}));
 expect(capabilities.images.length).toBeGreaterThan(0);expect(capabilities.images.every(i=>i.ok)).toBe(true);
 await page.screenshot({path:__dirname+'/webkit-home.png',fullPage:true});h.assertNoPrivateOrAiRequests();
 }finally{await h.close();h.saveEvidence('capabilities.json',{capabilities});}
});
