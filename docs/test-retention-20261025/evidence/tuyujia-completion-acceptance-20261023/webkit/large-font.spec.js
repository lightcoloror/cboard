import fs from 'fs';
import {test,expect} from '../../../fork-cboard/cboard/node_modules/@playwright/test';
import {installBrowserTtsHarness,dismissBoardTour} from '../../../fork-cboard/cboard/tests/offline/helpers/communicationSupport';
import {createPersistentBrowserHarness} from './persistent-browser-harness.cjs';
test('200 percent computed text enlargement on narrow and tablet WebKit viewports',async()=>{
 const h=createPersistentBrowserHarness();const measurements=[];
 try{const{page}=await h.open({installPage:installBrowserTtsHarness});await page.goto('/board/root');await dismissBoardTour(page,false);
 await page.getByRole('button',{name:'是',exact:true}).click();const welcome=page.getByRole('dialog',{name:'双向沟通 · 第一次使用'});if(await welcome.isVisible())await welcome.getByRole('button',{name:'开始使用',exact:true}).click();await page.getByRole('button',{name:'不',exact:true}).click();
 // Synthetic text enlargement only. This does not emulate OS accessibility text settings.
 await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.CommunicationSupportPanel *,.SymbolOutput *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));const values=nodes.map(e=>({e,font:parseFloat(getComputedStyle(e).fontSize),line:parseFloat(getComputedStyle(e).lineHeight)}));for(const {e,font,line}of values){e.style.setProperty('font-size',font*2+'px','important');if(Number.isFinite(line))e.style.setProperty('line-height',line*2+'px','important');}});
 for(const width of [390,768,1024]){await page.setViewportSize({width,height:1024});await page.getByRole('button',{name:'清空',exact:true}).scrollIntoViewIfNeeded();
 const result=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.CommunicationSupportPanel__sequenceActions button,.SymbolOutput button')].filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent||e.getAttribute('aria-label'),left:r.left,right:r.right,width:r.width,height:r.height,font:getComputedStyle(e).fontSize,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};})}));measurements.push(result);await page.screenshot({path:__dirname+`/large-font-${width}.png`,fullPage:true});
 for(const control of result.controls){expect.soft(control.left,control.label).toBeGreaterThanOrEqual(-1);expect.soft(control.right,control.label).toBeLessThanOrEqual(width+1);expect.soft(control.scrollWidth,control.label).toBeLessThanOrEqual(control.clientWidth+2);}
 }
 await page.getByRole('button',{name:'清空',exact:true}).click();await page.getByRole('button',{name:'撤销删除',exact:true}).click();await expect(page.locator('.SymbolOutput__value .Symbol__label')).toHaveText(['是','不']);h.assertNoPrivateOrAiRequests();
 }finally{fs.writeFileSync(__dirname+'/large-font-measurements.json',JSON.stringify(measurements,null,2));await h.close();h.saveEvidence('large-font.json',{measurements,scale:2,method:'computed text font-size and line-height doubled; not native iOS accessibility'});}
});
