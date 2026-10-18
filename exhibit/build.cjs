'use strict';
// Intent: real project examples + existing sw-precache, isolated from accounts.
// Evidence: source/output/asset hashes; no manually authored conversion output.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const destination = path.resolve(process.env.BOOTH_OUT || path.join(root,'outputs/tuyujia-exhibit-game-20261013/site'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
if (!destination.startsWith(path.join(root,'outputs') + path.sep)) throw Error('ISOLATED_OUTPUT_REQUIRED');
fs.mkdirSync(destination,{recursive:true});
const exporter = path.join(__dirname,'paper-kit.cjs');
const receipt = require(exporter)(root,destination);
const version = hash(JSON.stringify({source:receipt.sourceFiles,examples:receipt.examples,runAt:receipt.runAt,
  builder:hash(fs.readFileSync(__filename)),
  filingIcon:hash(fs.readFileSync(path.join(__dirname,'../public/police-filing.png'))),
  ui:['index.html','app.js','style.css','sw-audit.js'].map(p=>hash(fs.readFileSync(path.join(__dirname,p))))})).slice(0,16);
const data = {version,runAt:receipt.runAt,groups:receipt.groups,examples:receipt.examples.map((r,i)=>({id:String(i),text:r.inputText,
  pictures:r.output.map(t=>({src:'project-assets/'+t.image.replace(/^\//,''),attribution:t.attribution||null}))}))};
fs.writeFileSync(path.join(destination,'data.js'),'window.BOOTH_DATA = '+JSON.stringify(data)+';\n');
for (const name of ['index.html','app.js','style.css','sw-audit.js']) fs.copyFileSync(path.join(__dirname,name),path.join(destination,name));
fs.copyFileSync(path.join(__dirname,'../public/police-filing.png'),path.join(destination,'police-filing.png'));
fs.copyFileSync(path.join(__dirname,'../LICENSE.txt'),path.join(destination,'LICENSE.txt'));
fs.copyFileSync(require.resolve('sw-precache/LICENSE'),path.join(destination,'sw-precache-LICENSE.txt'));
// Existing application icon only; no new drawn pictograms.
const iconSource=path.join(__dirname,'../public/images/pwa/ios/ios-appicon-180-180.png');
fs.copyFileSync(iconSource,path.join(destination,'icon.png'));
const manifest={name:'图语家 · 把意思配出来',short_name:'图语家展台',start_url:'./index.html',scope:'./',display:'standalone',background_color:'#f6f4ed',theme_color:'#16675d'};
manifest.icons=[{src:'icon.png',sizes:'180x180',type:'image/png'}];
fs.writeFileSync(path.join(destination,'manifest.webmanifest'),JSON.stringify(manifest,null,2));
const attribution=[...new Map(data.examples.flatMap(x=>x.pictures).filter(x=>x.attribution).map(x=>[x.src,x.attribution])).entries()];
fs.writeFileSync(path.join(destination,'素材来源与许可.json'),JSON.stringify({project:'CBoard / 图语家',codeLicense:'GPL-3.0-only',swPrecacheLicense:'Apache-2.0',pictures:attribution},null,2));
const files=['index.html','app.js','style.css','data.js','sw-audit.js','manifest.webmanifest','project-run-results.json','LICENSE.txt','sw-precache-LICENSE.txt','素材来源与许可.json','police-filing.png',
 ...receipt.assets.map(a=>a.artifactPath),...(fs.existsSync(path.join(destination,'icon.png'))?['icon.png']:[])];
const resources={version,files:files.map(url=>({url,sha256:hash(fs.readFileSync(path.join(destination,url)))}))};
fs.writeFileSync(path.join(destination,'resources.json'),JSON.stringify(resources));
// Reuse upstream template with one guarded verification hook. A 200 HTML error
// page or corrupt image must fail installation, leaving the previous worker live.
const templateSource=require.resolve('sw-precache/service-worker.tmpl');
const originalTemplate=fs.readFileSync(templateSource,'utf8');
const hook='return cleanResponse(response).then(function(responseToCache) {';
if(originalTemplate.split(hook).length!==2)throw Error('UPSTREAM_TEMPLATE_REVIEW_REQUIRED');
const expected=Object.fromEntries(files.concat('resources.json').map(f=>[f,hash(fs.readFileSync(path.join(destination,f)))]));
const template=originalTemplate.replace(hook,'return boothVerify(request.url, response).then(cleanResponse).then(function(responseToCache) {')+
  '\nvar boothExpectedHashes = '+JSON.stringify(expected)+';\n';
const templateFile=path.join(path.dirname(destination),'sw-precache-verified.tmpl');
fs.writeFileSync(templateFile,template);
require('sw-precache').write(path.join(destination,'service-worker.js'),{
  cacheId:'tuyujia-booth',staticFileGlobs:files.concat('resources.json').map(f=>path.join(destination,f).replaceAll('\\','/')),
  stripPrefix:destination.replaceAll('\\','/')+'/',skipWaiting:false,clientsClaim:true,
  directoryIndex:'index.html',importScripts:['sw-audit.js'],
  maximumFileSizeToCacheInBytes:8*1024*1024,templateFilePath:templateFile,logger:()=>{}
}).then(()=>{
  fs.writeFileSync(path.join(path.dirname(destination),'build-receipt.json'),JSON.stringify({version,destination,
    examples:data.examples.map(x=>({text:x.text,pictures:x.pictures.length})),resourceCount:files.length+1,
    bytes:files.concat('resources.json','service-worker.js').reduce((n,f)=>n+fs.statSync(path.join(destination,f)).size,0),
    exporterSha256:hash(fs.readFileSync(exporter)),upstreamSwTemplateSha256:hash(originalTemplate),
    noManualSequenceChanges:true},null,2));
  console.log('BOOTH_BUILD_OK',version);
});
