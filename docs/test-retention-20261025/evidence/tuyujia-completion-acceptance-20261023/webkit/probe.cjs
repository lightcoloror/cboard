const fs = require('fs');
const {webkit} = require('../../../fork-cboard/cboard/node_modules/@playwright/test');
process.env.PLAYWRIGHT_BROWSERS_PATH = __dirname + '/browser-cache';
(async()=>{let browser; try {browser=await webkit.launch({headless:true}); const page=await browser.newPage(); await page.goto('data:text/html,probe'); const result=await page.evaluate(()=>({ua:navigator.userAgent,serviceWorker:'serviceWorker' in navigator,caches:'caches' in window})); console.log(JSON.stringify({version:browser.version(),...result}));fs.writeFileSync(__dirname+'/probe.json',JSON.stringify({version:browser.version(),...result},null,2));}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
