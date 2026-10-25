'use strict';
const path = require('node:path');
const { defineConfig } = require('../../../fork-cboard/cboard/node_modules/@playwright/test');
const suffix = process.env.EXPRESSION_ACCEPTANCE_LABEL ? '-'+process.env.EXPRESSION_ACCEPTANCE_LABEL : '';
const production = process.env.EXPRESSION_BASE_URL === 'https://app.tuyujia.com.cn';
if (!process.env.EXPRESSION_WEB_INVENTORY || !process.env.EXPRESSION_BUILD_PATH) throw Error('Explicit candidate inventory/build required');
module.exports = defineConfig({
 testDir:__dirname,testMatch:'core.spec.js',timeout:240000,expect:{timeout:18000},workers:1,retries:0,
 outputDir:path.join(__dirname,'browser-artifacts'+suffix),
 reporter:[['list'],['json',{outputFile:path.join(__dirname,'browser-report'+suffix+'.json')}]],
 webServer:production ? undefined : {command:'"C:/Program Files/nodejs/node.exe" scripts/serve-offline-build.mjs',
  cwd:path.resolve(__dirname,'../../../fork-cboard/cboard'),
  env:{PLAYWRIGHT_OFFLINE_HOST:'127.0.0.1',PLAYWRIGHT_OFFLINE_PORT:'4209',PLAYWRIGHT_OFFLINE_BUILD_PATH:process.env.EXPRESSION_BUILD_PATH},
  url:'http://127.0.0.1:4209',reuseExistingServer:false}
});
