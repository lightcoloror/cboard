'use strict';
// User-authorized temporary loopback server; static candidate only.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../outputs/tuyujia-ipad-booth-20261012');
const site=path.join(root,'site'),stop=path.join(root,'stop-preview');
if(fs.existsSync(stop))throw Error('STALE_STOP_MARKER');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1:18778');
    if(!url.pathname.startsWith('/exhibit/')){res.writeHead(404);res.end();return;}
    const name=decodeURIComponent(url.pathname.slice('/exhibit/'.length))||'index.html';
    const file=path.resolve(site,name);
    if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('NOT_FOUND');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:fs.readFileSync(file));
  }catch{res.writeHead(404);res.end('not found');}
});
server.listen(18778,'127.0.0.1',()=>{
  fs.writeFileSync(path.join(root,'preview-start.json'),JSON.stringify({pid:process.pid,host:'127.0.0.1',port:18778,startedAt:new Date().toISOString()}));
  console.log('PREVIEW_READY');
});
const watch=setInterval(()=>{if(fs.existsSync(stop)){clearInterval(watch);server.close(()=>process.exit(0));}},250);
setTimeout(()=>{clearInterval(watch);server.close(()=>process.exit(0));},850000).unref();
