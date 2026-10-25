import {test} from '../../../fork-cboard/cboard/node_modules/@playwright/test';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
test('isolate cache API with inert local JSON document and no application worker',async()=>{
 const h=createPersistentBrowserHarness();const checks=[];
 try{const{context,page}=await h.open();await page.goto('/manifest.json');
 async function check(mode){return page.evaluate(async mode=>{const cache=await caches.open('isolated-'+mode);const key='/synthetic-'+mode+'.txt';await cache.put(key,new Response('synthetic'));return {mode,controller:!!navigator.serviceWorker.controller,keys:(await cache.keys()).map(r=>r.url),found:!!(await cache.match(key))};},mode);}
 checks.push(await check('route-enabled'));
 // Inert JSON document only; no production scripts, worker, API, or outbound resources exist here.
 await context.unroute('**/*');checks.push(await check('route-disabled'));
 h.assertNoPrivateOrAiRequests();
 }finally{await h.close();h.saveEvidence('cache-isolation.json',{checks});}
});
