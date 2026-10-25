import fs from 'fs';
import path from 'path';
import {test,expect} from '../../fork-cboard/cboard/node_modules/@playwright/test';
import {installBrowserTtsHarness,dismissBoardTour} from '../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
const root=__dirname;
async function snapshot(page,name){
 await page.screenshot({path:path.join(root,name+'.png'),fullPage:true});
 const data=await page.evaluate(()=>({url:location.href,text:document.body.innerText,buttons:Array.from(document.querySelectorAll('button')).map(b=>({text:b.innerText,aria:b.getAttribute('aria-label'),title:b.title,disabled:b.disabled,rect:{x:b.getBoundingClientRect().x,y:b.getBoundingClientRect().y,w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}})),scripts:Array.from(document.scripts).map(s=>s.src)}));
 fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(data,null,2));return data;
}
test('inspect current fresh browser navigation and output controls',async()=>{
 const h=createPersistentBrowserHarness({baseURL:'https://app.tuyujia.com.cn'});
 try{
  const {page}=await h.open({installPage:installBrowserTtsHarness});
  page.setDefaultTimeout(15000);await page.goto('/board/root');
  await expect(page.locator('button').first()).toBeVisible();
  await snapshot(page,'01-fresh');await dismissBoardTour(page,false);
  await snapshot(page,'02-board');
  await page.getByRole('button',{name:'是',exact:true}).click();
  await snapshot(page,'02b-first-click');
  const welcome=page.getByRole('dialog',{name:'双向沟通 · 第一次使用'});
  if(await welcome.isVisible()) await welcome.getByRole('button',{name:'开始使用',exact:true}).click();
  await page.getByRole('button',{name:/^(不|否|no)$/}).click();
  await snapshot(page,'03-selected');
  fs.writeFileSync(path.join(root,'selected-dom.html'),await page.content());
  const clear=page.getByRole('button',{name:/^(Clear|清空|清除)$/});
  await clear.click();await snapshot(page,'04-cleared');
  fs.writeFileSync(path.join(root,'cleared-dom.html'),await page.content());
  const undo=page.getByRole('button',{name:/^(撤销删除|Undo deletion)$/});
  await expect(undo).toBeVisible();await undo.click();
  await expect(page.locator('.SymbolOutput__value')).toHaveCount(2);
  await expect(page.locator('.SymbolOutput__value .Symbol__label')).toHaveText(['是','不']);
  await snapshot(page,'05-undo-clear');
  await page.getByRole('button',{name:'Backspace',exact:true}).click();
  await clear.click();await undo.click();
  await expect(page.locator('.SymbolOutput__value')).toHaveCount(1);
  await undo.click();await expect(page.locator('.SymbolOutput__value')).toHaveCount(2);
  await expect(page.locator('.SymbolOutput__value .Symbol__label')).toHaveText(['是','不']);
  await snapshot(page,'06-continuous-undo');
  await page.getByRole('button',{name:'食物',exact:true}).click();
  await snapshot(page,'07-food');
  await page.setViewportSize({width:768,height:1024});await snapshot(page,'08-tablet');
  if(await page.getByRole('button',{name:'患者表达',exact:true}).isVisible()) await page.getByRole('button',{name:'患者表达',exact:true}).click();
  await snapshot(page,'09-expression');
  await page.getByRole('button',{name:'重新检查',exact:true}).first().click();
  await snapshot(page,'10-after-cache-check');
  const metrics=await page.evaluate(async()=>({
    viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    swControlled:!!navigator.serviceWorker.controller,cacheNames:await caches.keys(),
    images:await Promise.all(Array.from(document.querySelectorAll('.SymbolOutput img, .CommunicationSupportPanel img')).map(async i=>({
      src:i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight,
      cached:!!(await caches.match(i.src)),rect:{x:i.getBoundingClientRect().x,w:i.getBoundingClientRect().width}
    }))),
    overflowButtons:Array.from(document.querySelectorAll('button')).filter(b=>{
      const r=b.getBoundingClientRect();return r.width&&r.x+r.width>innerWidth+1;
    }).map(b=>({text:b.innerText,aria:b.getAttribute('aria-label'),right:b.getBoundingClientRect().right}))
  }));fs.writeFileSync(path.join(root,'layout-cache-metrics.json'),JSON.stringify(metrics,null,2));
 }finally{await h.close();h.saveEvidence('navigation-audit.json');}
});
