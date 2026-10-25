import {test} from '../../../fork-cboard/cboard/node_modules/@playwright/test';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
const modern=require('C:/Users/lightcolor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('existing Playwright 1.62.1 WebKit 26.5 cache persistence minimum comparison',async()=>{
 const h=createPersistentBrowserHarness({browserType:modern.webkit});const checks=[];let browser;
 async function check(p,mode){return p.evaluate(async mode=>{const cache=await caches.open('minimal-'+mode);const key='/synthetic-'+mode+'.txt';await cache.put(key,new Response('synthetic cache probe'));const response=await cache.match(key);return{mode,secureContext:isSecureContext,controller:!!navigator.serviceWorker.controller,keys:(await cache.keys()).map(r=>r.url),found:!!response,body:response?await response.text():null};},mode);}
 try{const{context,page}=await h.open();await page.goto('/manifest.json');checks.push(await check(page,'persistent-route-enabled'));await context.unroute('**/*');checks.push(await check(page,'persistent-route-disabled'));await h.close();
 browser=await modern.webkit.launch({headless:true});const ephemeral=await browser.newContext();await ephemeral.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4208'?route.continue():route.abort('blockedbyclient'));const p=await ephemeral.newPage();await p.goto('http://127.0.0.1:4208/manifest.json');checks.push(await check(p,'ephemeral-route-enabled'));await ephemeral.unroute('**/*');checks.push(await check(p,'ephemeral-route-disabled'));await browser.close();browser=null;h.assertNoPrivateOrAiRequests();
 }finally{await browser?.close();await h.close();h.saveEvidence('new-runtime-cache.json',{playwright:'1.62.1',webkit:'26.5',revision:'2336',checks});}
});
