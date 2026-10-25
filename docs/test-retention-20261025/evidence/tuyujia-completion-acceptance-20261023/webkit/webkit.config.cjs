const {defineConfig}=require('../../../fork-cboard/cboard/node_modules/@playwright/test');
const path=require('path');
module.exports=defineConfig({testDir:__dirname,testMatch:['capabilities.spec.js','repair.spec.js','repair-decoder.spec.js','gallery.spec.js','large-font.spec.js','offline-layers.spec.js','cache-roundtrip.spec.js','cache-isolation.spec.js','new-runtime-cache.spec.js'],timeout:120000,workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:__dirname+'/'+(process.env.EVIDENCE_RUN||'webkit')+'-report.json'}]],
 outputDir:__dirname+'/'+(process.env.EVIDENCE_RUN||'webkit')+'-artifacts',
 use:{screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'"C:/Program Files/nodejs/node.exe" scripts/serve-offline-build.mjs',cwd:path.resolve(__dirname,'../../../fork-cboard/cboard'),
 env:{PLAYWRIGHT_OFFLINE_HOST:'127.0.0.1',PLAYWRIGHT_OFFLINE_PORT:'4208',PLAYWRIGHT_OFFLINE_BUILD_PATH:'.local-build-20261023-targeted-ui-v2'},
 url:'http://127.0.0.1:4208',reuseExistingServer:false}});
