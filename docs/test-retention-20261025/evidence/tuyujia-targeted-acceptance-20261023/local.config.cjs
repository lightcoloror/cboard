const {defineConfig}=require('../../fork-cboard/cboard/node_modules/@playwright/test');
const path=require('path');
module.exports=defineConfig({testDir:__dirname,testMatch:['gallery.spec.js','repair.spec.js'],timeout:120000,workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:__dirname+'/'+(process.env.EVIDENCE_RUN||'baseline')+'-report.json'}]],
 outputDir:__dirname+'/'+(process.env.EVIDENCE_RUN||'baseline')+'-artifacts',
 webServer:process.env.EXPRESSION_BASE_URL?undefined:{command:'"C:/Program Files/nodejs/node.exe" scripts/serve-offline-build.mjs',
 cwd:path.resolve(__dirname,'../../fork-cboard/cboard'),
 env:{PLAYWRIGHT_OFFLINE_HOST:'127.0.0.1',PLAYWRIGHT_OFFLINE_PORT:'4198',PLAYWRIGHT_OFFLINE_BUILD_PATH:process.env.REPAIR_BUILD_PATH||'.local-build-20261022-onsite-ui-repair-v2'},
 url:'http://127.0.0.1:4198',reuseExistingServer:false}});
