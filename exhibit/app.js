/* Paper-kit game adapter. Reuses the existing cache lifecycle unchanged.
 * Human interpretation/confirmation; no scoring, timer, account or telemetry.
 */
(() => {
  'use strict';
  const data=window.BOOTH_DATA, $=id=>document.getElementById(id);
  const byId=new Map(data.examples.map(x=>[x.id,x]));
  let current=0, stage='match', own=null, active=null, interpretation=null, done=false;
  let pairings=new Map(), pictureOrder=[],wordOrder=[],pictureFailure=false,epoch=0;
  let registration=null,applyingUpdate=false;
  const status=(text,ready=false)=>{$('cache-status').textContent=text;$('cache-status').dataset.ready=String(ready);};
  function shuffled(items){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
  const ids=()=>data.groups[current].exampleIds;
  function show(next,focus=true){stage=next;for(const key of ['match','choose','communicate'])$(key+'-stage').hidden=key!==next;$('step-status').textContent=data.groups[current].title+' / 四组 · '+({match:'配一配',choose:'表达者选句',communicate:'传达与确认'})[next];if(focus)$(next+'-heading').focus();}
  function syncButtons(){
    $('check-pairs').disabled=pairings.size!==3||pictureFailure;
    $('to-choose').disabled=pictureFailure;
    $('handoff').disabled=own===null||pictureFailure;
    for(const id of ['confirm','deny','options','repeat'])$(id).disabled=pictureFailure||done;
  }
  function sequence(container,id){
    const generation=epoch;
    container.style.setProperty('--picture-count',byId.get(id).pictures.length);
    byId.get(id).pictures.forEach((p,i)=>{
      if(i){const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='→';arrow.setAttribute('aria-hidden','true');container.append(arrow);}
      const img=document.createElement('img');img.className='picture';img.src=p.src;img.alt='图卡 '+(i+1);img.draggable=false;
      img.addEventListener('error',()=>{if(generation!==epoch)return;pictureFailure=true;syncButtons();$('feedback').textContent=$('match-feedback').textContent='图片未完整加载，请联网检查资源后重新开始这一组。';status('图片缺失，暂不能保证离线展示。');});container.append(img);
    });
  }
  function refreshPairLabels(){
    Array.from($('picture-cards').children).forEach((button,i)=>{
      const id=pictureOrder[i], label=pairings.has(id)?byId.get(pairings.get(id)).text:'点选这张图片卡';
      button.setAttribute('aria-pressed',String(active===id));button.querySelector('.pair-label').textContent=label;
    });syncButtons();
  }
  function matchScreen(focus=true){
    epoch++;pictureFailure=false;own=null;interpretation=null;done=false;pairings=new Map();active=null;
    pictureOrder=shuffled(ids());wordOrder=shuffled(ids());
    // Avoid accidental identical position order while preserving original image sequence.
    if(wordOrder.every((id,i)=>id===pictureOrder[i]))wordOrder.push(wordOrder.shift());
    for(const id of ['picture-cards','word-cards','own-choices','pictures','repair-options'])$(id).replaceChildren();
    $('repair-options').hidden=true;$('feedback').textContent='';$('match-feedback').textContent='先点一张图片卡，再选文字。';
    pictureOrder.forEach((id,i)=>{const b=document.createElement('button');b.className='picture-card';b.setAttribute('aria-label','图片卡 '+(i+1));
      const row=document.createElement('span');row.className='sequence';sequence(row,id);const label=document.createElement('span');label.className='pair-label';b.append(row,label);
      b.addEventListener('click',()=>{active=id;refreshPairLabels();$('match-feedback').textContent='为选中的图片卡选择一句话。';});$('picture-cards').append(b);});
    wordOrder.forEach(id=>{const b=document.createElement('button');b.textContent=byId.get(id).text;b.addEventListener('click',()=>{
      if(active===null){$('match-feedback').textContent='请先点选一张图片卡。';return;}
      for(const [key,value] of pairings)if(value===id)pairings.delete(key);
      pairings.set(active,id);refreshPairLabels();$('match-feedback').textContent='已放好文字，可以继续配对或改选。';
    });$('word-cards').append(b);});refreshPairLabels();show('match',focus);
  }
  function selectGroup(index,focus=true){current=index;Array.from($('examples').children).forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));matchScreen(focus);}
  function choose(){
    own=null;interpretation=null;done=false;$('own-choices').replaceChildren();$('repair-options').replaceChildren();$('repair-options').hidden=true;$('pictures').replaceChildren();
    ids().forEach(id=>{const b=document.createElement('button');b.textContent=byId.get(id).text;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{own=id;Array.from($('own-choices').children).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));syncButtons();});$('own-choices').append(b);});syncButtons();show('choose');
  }
  data.groups.forEach((g,i)=>{const b=document.createElement('button');b.textContent=g.title;b.addEventListener('click',()=>selectGroup(i));$('examples').append(b);});
  $('check-pairs').addEventListener('click',()=>{
    if(pairings.size!==3||pictureFailure)return;
    const lines=pictureOrder.map((id,i)=>'图片卡 '+(i+1)+' 的原输入是“'+byId.get(id).text+'”。');
    $('match-feedback').textContent=lines.join('\n')+'\n先听彼此怎么理解；原句不是图片唯一的合法解释。';
  });
  $('to-choose').addEventListener('click',choose);$('back-match').addEventListener('click',()=>matchScreen());
  $('handoff').addEventListener('click',()=>{
    if(own===null||pictureFailure)return;epoch++;$('pictures').replaceChildren();sequence($('pictures'),own);
    // Remove earlier answers from the rendered document before passing the device.
    for(const id of ['own-choices','picture-cards','word-cards','match-feedback'])$(id).replaceChildren();
    $('feedback').textContent='文字已收起。请伙伴先复述，再由表达者选择“是”或“不”。';syncButtons();show('communicate');
  });
  $('confirm').addEventListener('click',()=>{
    if(done||pictureFailure||stage!=='communicate')return;done=true;
    $('feedback').textContent=interpretation===null?'这次沟通已由表达者确认。可以交换角色，再来一轮。':'表达者已确认：“'+byId.get(interpretation).text+'”。'+(interpretation===own?'':'与最初练习句不同，以表达者此刻确认的意思为准。');
    $('repair-options').hidden=true;syncButtons();
  });
  $('deny').addEventListener('click',()=>{interpretation=null;$('repair-options').hidden=true;$('feedback').textContent='还不是这个意思。请伙伴换一种说法，或由表达者选择“给我选项”。';});
  $('repeat').addEventListener('click',()=>{$('feedback').textContent='请伙伴把刚才的理解再说一次，慢一点，然后等待表达者确认。';});
  $('options').addEventListener('click',()=>{
    $('repair-options').replaceChildren();$('repair-options').hidden=false;
    shuffled(ids()).forEach(id=>{const b=document.createElement('button');b.textContent=byId.get(id).text;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{interpretation=id;Array.from($('repair-options').children).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('feedback').textContent='请伙伴复述“'+byId.get(id).text+'”，再由表达者确认。';});$('repair-options').append(b);});
    const other=document.createElement('button');other.textContent='这些都不是';other.addEventListener('click',()=>{interpretation=null;$('repair-options').hidden=true;$('feedback').textContent='可以说话、指图或用手势补充。请伙伴重新复述，等表达者确认。';});$('repair-options').append(other);
    $('feedback').textContent='选项只是帮助，可以改选，也可以说“这些都不是”。';
  });
  $('change-phrase').addEventListener('click',choose);$('next').addEventListener('click',()=>selectGroup((current+1)%data.groups.length));$('restart').addEventListener('click',()=>matchScreen());
  $('version').textContent='资源版本 '+data.version+'；纸卡来源运行时间 '+data.runAt+'。';
  const seen=new Set();data.examples.flatMap(x=>x.pictures).forEach(p=>{const a=p.attribution;if(!a||seen.has(a.sourceUrl))return;seen.add(a.sourceUrl);const li=document.createElement('li');li.textContent=[a.name,a.author,a.license].filter(Boolean).join(' · ')+' ';if(/^https:\/\//.test(a.sourceUrl)){const link=document.createElement('a');link.href=a.sourceUrl;link.textContent='原始来源';link.rel='noreferrer';li.append(link);}$('credits').append(li);});
  async function audit() {
    if(!registration || !registration.active || !navigator.serviceWorker.controller){status('资源正在下载或页面尚未由展台缓存接管，请稍后再检查。');return;}
    const worker=navigator.serviceWorker.controller;
    if(worker.scriptURL!==new URL('service-worker.js',location.href).href){status('当前缓存尚未切换为展台版本，请联网刷新后再检查。');return;}
    status('正在逐项校验离线资源…');
    try {
      const result=await new Promise((resolve,reject)=>{
        const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('校验超时，请重试'));},15000);
        channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};
        worker.postMessage({type:'BOOTH_AUDIT',version:data.version},[channel.port2]);
      });
      if(!result.ok)throw Error(result.error);
      status('离线资源已核验 · '+result.count+' 项 · 请再完成断网关闭重开测试。',true);
    } catch(e){status('离线尚未就绪：'+e.message+'。请联网后重试。');}
  }
  function showUpdate(){if(registration.waiting){$('update').hidden=false;}}
  async function prepare() {
    if(!window.isSecureContext||!('serviceWorker' in navigator)){status('当前地址不能安装离线缓存。请使用 HTTPS 部署地址；本地文件只能查看页面。');return;}
    try {
      if(!registration){
        registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});
        navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate)location.reload();else audit();});
        registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(worker)worker.addEventListener('statechange',()=>{
          if(worker.state==='installed'){showUpdate();audit();}
          if(worker.state==='redundant')status('新资源下载失败，原版缓存保留。联网后重试检查。');
        });});
      }
      showUpdate();await audit();
      if(navigator.onLine)registration.update().catch(()=>{});
    } catch(e){status('离线准备失败，请确认联网及浏览器存储可用后重试。');}
  }
  $('prepare').addEventListener('click',prepare);
  $('update').addEventListener('click',()=>{if(registration&&registration.waiting){applyingUpdate=true;registration.waiting.postMessage({type:'BOOTH_ACTIVATE_UPDATE'});}});
  window.addEventListener('online',audit);window.addEventListener('offline',audit);
  selectGroup(0,false);prepare();
})();
