'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../../../outputs/tuyujia-ipad-booth-20261012/site');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const scope='http://127.0.0.1:18778/exhibit/';
function storage(){const stores=new Map();return {stores,async open(name){if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);return {
  async keys(){return [...m.keys()].map(x=>new Request(x));},async match(x){return m.get(typeof x==='string'?x:x.url)?.clone();},
  async put(x,r){m.set(typeof x==='string'?x:x.url,r.clone());},async delete(x){return m.delete(typeof x==='string'?x:x.url);}
};}};}
function worker(caches,{offline=false,fail='',corrupt='',source=read('service-worker.js')}={}){
  const events={},calls=[];let skips=0,claims=0;
  const context=vm.createContext({URL,Request,Response,Map,Set,Promise,Uint8Array,crypto:webcrypto,caches,console,
    self:{location:new URL('service-worker.js',scope),registration:{scope},clients:{claim:async()=>{claims++;}},skipWaiting:async()=>{skips++;},addEventListener:(n,f)=>(events[n]??=[]).push(f)},
    fetch:async request=>{const url=new URL(typeof request==='string'?request:request.url);calls.push(url.href);assert.equal(url.origin,new URL(scope).origin);
      if(offline)throw Error('OFFLINE');const f=decodeURIComponent(url.pathname.slice(new URL(scope).pathname.length));
      if(f===fail)return new Response('missing',{status:404});
      return new Response(f===corrupt?'incorrect bytes':fs.readFileSync(path.join(root,f)),{status:200});},
    importScripts:(...files)=>files.forEach(f=>vm.runInContext(read(f),context))});
  vm.runInContext(source,context);
  async function dispatch(type,extras={}){const promises=[];let response;const event={waitUntil:p=>promises.push(p),respondWith:p=>response=p,...extras};(events[type]||[]).forEach(f=>f(event));await Promise.all(promises);return response;}
  return {context,calls,dispatch,get skips(){return skips;},get claims(){return claims;},
    async audit(version=JSON.parse(read('resources.json')).version){let result;await dispatch('message',{data:{type:'BOOTH_AUDIT',version},ports:[{postMessage:x=>result=x}]});return result;}};
}
function ui(){const dom=new JSDOM(read('index.html'),{url:scope,runScripts:'outside-only'});dom.window.eval(read('data.js'));dom.window.eval(read('app.js'));return dom;}
test('package sequences are unmodified actual runtime output and all bytes match source',()=>{
  const data={};vm.runInNewContext(read('data.js'),{window:data});const original=JSON.parse(read('project-run-results.json'));
  assert.equal(original.noManualSequenceChanges,true);
  original.examples.forEach((x,i)=>assert.deepEqual(Array.from(data.BOOTH_DATA.examples[i].pictures,p=>p.src),x.output.map(p=>'project-assets/'+p.image.replace(/^\//,''))));
  for(const a of original.assets)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,a.artifactPath))).digest('hex'),a.sha256);
});
test('all groups support selection, human confirmation and reselection without captions',()=>{
  const dom=ui(),d=dom.window.document;
  for(let i=0;i<3;i++){
    d.querySelectorAll('#examples button')[i].click();assert.equal(d.querySelector('#confirm').disabled,true);
    assert.equal(d.querySelector('#pictures').textContent,'');
    d.querySelectorAll('#choices button')[i].click();assert.equal(d.querySelector('#confirm').disabled,false);
    d.querySelector('#confirm').click();assert.match(d.querySelector('#feedback').textContent,/表达者已确认/);
    d.querySelector('#retry').click();assert.equal(d.querySelector('#confirm').disabled,true);
  }
  d.querySelectorAll('#choices button')[0].click();d.querySelector('#confirm').click();assert.match(d.querySelector('#feedback').textContent,/以表达者确认的意思为准/);
  assert.equal(dom.window.localStorage.length,0);assert.match(d.querySelector('#cache-status').textContent,/不能安装离线缓存/);dom.window.close();
});
test('missing image disables confirmation and produces actionable error',()=>{const dom=ui(),d=dom.window.document;d.querySelector('#pictures img').dispatchEvent(new dom.window.Event('error'));d.querySelector('#choices button').click();assert.equal(d.querySelector('#confirm').disabled,true);assert.match(d.querySelector('#feedback').textContent,/图片未完整加载/);dom.window.close();});
test('example mode selects actual sentence output and switching back clears confirmation',()=>{
  const dom=ui(),d=dom.window.document;d.querySelector('#example-mode').click();
  assert.equal(d.querySelector('#meaning-section').hidden,true);
  d.querySelectorAll('#examples button')[2].click();
  assert.equal(d.querySelectorAll('#pictures img').length,dom.window.BOOTH_DATA.examples[2].pictures.length);
  assert.equal(d.querySelectorAll('#examples button')[2].textContent,'请叫家人');
  d.querySelector('#pair-mode').click();assert.equal(d.querySelector('#meaning-section').hidden,false);assert.equal(d.querySelector('#confirm').disabled,true);dom.window.close();
});
test('generated worker installs all resources, audits bytes, and serves after offline worker restart',async()=>{
  const caches=storage(),first=worker(caches);await first.dispatch('install');await first.dispatch('activate');assert.equal((await first.audit()).ok,true);assert.equal(first.skips,0);assert.equal(first.claims,1);
  const restarted=worker(caches,{offline:true});
  for(const f of JSON.parse(read('resources.json')).files){const res=await restarted.dispatch('fetch',{request:new Request(new URL(f.url,scope))});assert.equal(res.status,200);assert.equal(createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex'),f.sha256);}
  assert.equal((await restarted.audit()).ok,true);assert.equal(restarted.calls.length,0);
  const home=await restarted.dispatch('fetch',{request:new Request(scope)});assert.match(await home.text(),/把意思配出来/);
});
test('audit rejects missing, corrupt and wrong-version caches; unrelated cache stays intact',async()=>{
  const caches=storage(),w=worker(caches);await w.dispatch('install');const privateCache=await caches.open('private-user-cache');await privateCache.put(scope+'private',new Response('untouched'));await w.dispatch('activate');
  assert.equal((await w.audit('wrong')).ok,false);const own=await caches.open(w.context.cacheName);const keys=await own.keys();const key=keys.find(x=>x.url.includes('/app.js?'));await own.put(key,new Response('bad'));assert.match((await w.audit()).error,/校验失败/);await own.delete(key);assert.match((await w.audit()).error,/资源缺失/);assert.equal(await (await privateCache.match(scope+'private')).text(),'untouched');
});
test('404 and 200-but-corrupt update fail install and preserve original offline cache',async()=>{
  for(const mode of ['fail','corrupt']){
    const caches=storage(),old=worker(caches);await old.dispatch('install');await old.dispatch('activate');
    const newer=read('service-worker.js').replace(/(\["app.js",\s*")[^"]+/, '$1different-revision');
    assert.notEqual(newer,read('service-worker.js'));
    const update=worker(caches,{source:newer,[mode]:'app.js'});await assert.rejects(update.dispatch('install'));assert.equal(update.skips,0);
    const offline=worker(caches,{offline:true});assert.equal((await offline.audit()).ok,true);
  }
});
test('worker only activates requested installed update and does not intercept APIs',async()=>{
  const w=worker(storage());await w.dispatch('install');await w.dispatch('message',{data:{type:'BOOTH_ACTIVATE_UPDATE'}});assert.equal(w.skips,1);
  assert.equal(await w.dispatch('fetch',{request:new Request(new URL('/api/private',scope))}),undefined);
});
