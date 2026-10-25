const {defineConfig}=require('../../../fork-cboard/cboard/node_modules/@playwright/test');
const run=process.env.MODERN_RUN||'modern-offline';
module.exports=defineConfig({testDir:__dirname,testMatch:['modern-offline.spec.js'],timeout:120000,workers:1,retries:0,reporter:[['list'],['json',{outputFile:__dirname+'/'+run+'-report.json'}]],outputDir:__dirname+'/'+run+'-artifacts',use:{trace:'retain-on-failure',screenshot:'only-on-failure'}});
