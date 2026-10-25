const {defineConfig}=require('../../fork-cboard/cboard/node_modules/@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:'audit.spec.js',timeout:180000,workers:1,retries:0,outputDir:__dirname+'/artifacts',reporter:[['list'],['json',{outputFile:__dirname+'/report.json'}]]});
