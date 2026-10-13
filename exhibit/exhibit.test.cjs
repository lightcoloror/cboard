'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const {JSDOM}=require('jsdom');
const root=path.resolve(process.env.BOOTH_OUT||path.join(__dirname,'../../../outputs/tuyujia-exhibit-game-20261013/site'));
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

function click(d,id){d.getElementById(id).click();}
function handoff(dom,group=0,phrase=0){const d=dom.window.document;d.querySelectorAll('#examples button')[group].click();click(d,'to-choose');d.querySelectorAll('#own-choices button')[phrase].click();click(d,'handoff');return d;}
test('all four paper groups and twelve exact phrases are present; old rejected phrase is excluded',()=>{
  const dom=ui(),data=dom.window.BOOTH_DATA;
  assert.equal(data.groups.length,4);assert.equal(data.examples.length,12);
  assert.deepEqual(Array.from(data.groups,g=>Array.from(g.exampleIds,id=>data.examples.find(x=>x.id===id).text)),[
    ['我想喝水','我想上厕所','我肚子痛'],['我想休息','帮帮我','我想看电视'],
    ['我想吃苹果','我想吃面包','我想出去'],['我头痛','我牙痛','我热']]);
  assert(!data.examples.some(x=>x.text==='请叫家人'));dom.window.close();
});
test('pairing is editable one-to-one, independent of position, and needs no correct score to continue',()=>{
  const dom=ui(),d=dom.window.document;
  const pictures=[...d.querySelectorAll('#picture-cards button')],words=[...d.querySelectorAll('#word-cards button')];
  assert.equal(pictures.length,3);assert.equal(words.length,3);
  assert(pictures.every(b=>!words.some(w=>b.textContent.includes(w.textContent))));
  words[0].click();assert.match(d.querySelector('#match-feedback').textContent,/先点选/);
  for(let i=0;i<3;i++){pictures[i].click();words[i].click();}
  assert.equal(d.querySelector('#check-pairs').disabled,false);click(d,'check-pairs');
  assert.match(d.querySelector('#match-feedback').textContent,/不是图片唯一/);
  pictures[0].click();words[1].click();assert.equal(d.querySelector('#check-pairs').disabled,true);
  assert.equal(pictures[1].querySelector('.pair-label').textContent,'点选这张图片卡');
  click(d,'to-choose');assert.equal(d.querySelector('#choose-stage').hidden,false);dom.window.close();
});
test('all 12 phrases can be passed with no answer visible, then confirmed only by the human',()=>{
  const dom=ui(),d=dom.window.document;
  for(let g=0;g<4;g++)for(let i=0;i<3;i++){
    handoff(dom,g,i);assert.equal(d.querySelector('#communicate-stage').hidden,false);
    assert.equal(d.querySelector('#own-choices').children.length,0);assert.equal(d.querySelector('#word-cards').children.length,0);
    assert.equal(d.querySelector('#picture-cards').children.length,0);assert.equal(d.querySelector('#repair-options').hidden,true);
    assert(!dom.window.BOOTH_DATA.examples.some(x=>d.querySelector('#communicate-stage').textContent.includes(x.text)));
    const id=dom.window.BOOTH_DATA.groups[g].exampleIds[i],expected=dom.window.BOOTH_DATA.examples.find(x=>x.id===id);
    assert.equal(d.querySelectorAll('#pictures img').length,expected.pictures.length);
    assert.equal(d.querySelector('#confirm').disabled,false);click(d,'confirm');
    assert.match(d.querySelector('#feedback').textContent,/由表达者确认/);assert.equal(d.querySelector('#confirm').disabled,true);
  }
  assert.equal(dom.window.localStorage.length,0);dom.window.close();
});
test('denial, repeat, other interpretations and none-of-these do not force preset meaning',()=>{
  const dom=ui(),d=handoff(dom,2,0);click(d,'deny');assert.match(d.querySelector('#feedback').textContent,/还不是/);
  click(d,'repeat');assert.match(d.querySelector('#feedback').textContent,/再说一次/);
  click(d,'options');assert.equal(d.querySelectorAll('#repair-options button').length,4);
  [...d.querySelectorAll('#repair-options button')].find(b=>b.textContent==='这些都不是').click();
  assert.match(d.querySelector('#feedback').textContent,/手势补充/);
  click(d,'options');[...d.querySelectorAll('#repair-options button')].find(b=>b.textContent==='我想吃面包').click();
  click(d,'confirm');assert.match(d.querySelector('#feedback').textContent,/表达者已确认：“我想吃面包”/);
  assert.match(d.querySelector('#feedback').textContent,/以表达者此刻确认/);
  click(d,'next');assert.equal(d.querySelector('#match-stage').hidden,false);assert.match(d.querySelector('#step-status').textContent,/第 4 组/);dom.window.close();
});
test('missing images block passing and confirmation; restart recovers and stale image events cannot poison new round',()=>{
  const dom=ui(),d=dom.window.document,stale=d.querySelector('#picture-cards img');
  stale.dispatchEvent(new dom.window.Event('error'));assert.equal(d.querySelector('#to-choose').disabled,true);
  d.querySelectorAll('#examples button')[1].click();stale.dispatchEvent(new dom.window.Event('error'));
  assert.equal(d.querySelector('#to-choose').disabled,false);
  handoff(dom,1,0);d.querySelector('#pictures img').dispatchEvent(new dom.window.Event('error'));
  assert.equal(d.querySelector('#confirm').disabled,true);assert.match(d.querySelector('#feedback').textContent,/未完整加载/);
  click(d,'restart');assert.equal(d.querySelector('#to-choose').disabled,false);dom.window.close();
});
test('changing groups or phrases clears prior choices and reload starts a fresh game without stored audience data',()=>{
  const dom=ui(),d=handoff(dom,3,2);click(d,'options');click(d,'change-phrase');
  assert.equal(d.querySelector('#repair-options').children.length,0);assert.equal(d.querySelector('#handoff').disabled,true);
  click(d,'back-match');assert.equal(d.querySelectorAll('#picture-cards button').length,3);
  assert.equal(d.querySelector('#check-pairs').disabled,true);dom.window.close();
  const fresh=ui();assert.equal(fresh.window.document.querySelector('#match-stage').hidden,false);assert.equal(fresh.window.localStorage.length,0);fresh.window.close();
});
