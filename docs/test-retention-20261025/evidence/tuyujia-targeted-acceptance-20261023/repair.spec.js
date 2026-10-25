import fs from 'fs';
import {test,expect} from '../../fork-cboard/cboard/node_modules/@playwright/test';
import {installBrowserTtsHarness,dismissBoardTour} from '../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';

test('production candidate: visible undo, preserved sequence and responsive repair controls',async()=>{
 const h=createPersistentBrowserHarness({});
 try{
  const {page}=await h.open({installPage:installBrowserTtsHarness});
  await page.goto('/board/root');await dismissBoardTour(page,false);
  await page.getByRole('button',{name:'是',exact:true}).click();
  const welcome=page.getByRole('dialog',{name:'双向沟通 · 第一次使用'});
  if(await welcome.isVisible())await welcome.getByRole('button',{name:'开始使用',exact:true}).click();
  await page.getByRole('button',{name:'不',exact:true}).click();
  const labels=page.locator('.SymbolOutput__value .Symbol__label');
  const clear=page.getByRole('button',{name:'清空',exact:true});
  const undo=page.getByRole('button',{name:'撤销删除',exact:true});
  await expect(clear).toHaveText('清空');
  await clear.click();await expect(labels).toHaveCount(0);await expect(undo).toHaveText('撤销删除');
  await undo.click();await expect(labels).toHaveText(['是','不']);
  await page.getByRole('button',{name:'退格',exact:true}).click();await clear.click();
  await undo.click();await expect(labels).toHaveText(['是']);await undo.click();await expect(labels).toHaveText(['是','不']);
  await page.getByRole('button',{name:'食物',exact:true}).click();
  await expect(page.locator('.CommunicationSupportPanel__sectionHeader').filter({hasText:'当前板'})).toContainText('当前板：食物');
  // Force only the local cache lookup to miss. The displayed packaged images
  // remain real build assets; no network or provider fallback is supplied.
  await page.evaluate(()=>{window.__originalCacheMatch=caches.match.bind(caches);caches.match=async()=>undefined;});
  await page.getByRole('button',{name:'重新检查',exact:true}).first().click();
  await expect(page.locator('.CommunicationSupportPanel__imageRepair').first()).toContainText('尚未核验到离线缓存');
  await expect(page.locator('.CommunicationSupportPanel__imageRepair').first()).not.toContainText('本机图片缺失');
  const results=[];
  for(const width of [1400,1024,768,390]){
   await page.setViewportSize({width,height:1024});
   const bounds=await page.evaluate(()=>{
    const scope=document.querySelector('.CommunicationSupportPanel');
    const buttons=[...scope.querySelectorAll('.CommunicationSupportPanel__sequenceActions button')].map(b=>{
     const r=b.getBoundingClientRect();return {label:b.textContent,left:r.left,right:r.right,width:r.width};});
    const notice=scope.querySelector('.CommunicationSupportPanel__draftStatus').getBoundingClientRect();
    const grid=scope.querySelector('.CommunicationSupportPanel__content').getBoundingClientRect();
    return {width:innerWidth,buttons,noticeWidth:notice.width,gridWidth:grid.width};
   });
   expect(bounds.noticeWidth).toBeGreaterThan(bounds.gridWidth-4);
   for(const b of bounds.buttons){expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);}
   await page.screenshot({path:__dirname+`/repair-${width}.png`,fullPage:true});results.push(bounds);
  }
  fs.writeFileSync(__dirname+'/repair-layout-results.json',JSON.stringify(results,null,2));
  await page.setViewportSize({width:768,height:1024});
  await page.getByRole('button',{name:'向左移动这张图片',exact:true}).nth(1).click();
  await expect(labels).toHaveText(['不','是']);
  await page.getByRole('button',{name:'向右移动这张图片',exact:true}).first().click();
  await expect(labels).toHaveText(['是','不']);
  // Verify that the new 'not cached' status cannot mask corrupt bytes, and
  // that only a locally read, decoded response earns offline-ready status.
  await page.evaluate(async()=>{
   const cache=await caches.open('tuyujia-onsite-local-check');
   const src=document.querySelector('.CommunicationSupportPanel__sequenceImage').src;
   await cache.put(src,new Response('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>',{headers:{'Content-Type':'image/svg+xml'}}));
   caches.match=key=>cache.match(key);
   window.__onsiteCachedImage=src;
  });
  await page.getByRole('button',{name:'重新检查',exact:true}).first().click();
  await expect(page.locator('.CommunicationSupportPanel__imageRepair').first()).toContainText('图片已核验可离线使用');
  await page.evaluate(async()=>{
   const cache=await caches.open('tuyujia-onsite-local-check');
   await cache.put(window.__onsiteCachedImage,new Response('broken synthetic bytes',{headers:{'Content-Type':'image/svg+xml'}}));
  });
  // A fresh editing snapshot triggers the existing local recheck without a
  // network repair. Moving twice also leaves the expression unchanged.
  await page.getByRole('button',{name:'向左移动这张图片',exact:true}).nth(1).click();
  await page.getByRole('button',{name:'向右移动这张图片',exact:true}).first().click();
  await expect(page.locator('.CommunicationSupportPanel__imageRepair').first()).toContainText('本机图片无法解码');
  await expect(labels).toHaveText(['是','不']);
  // Restoration of normal local checks must not initiate a fetch or model call.
  await page.evaluate(()=>{caches.match=window.__originalCacheMatch;});
  h.assertNoPrivateOrAiRequests();
 }finally{await h.close();h.saveEvidence('onsite-repair.json');}
});

