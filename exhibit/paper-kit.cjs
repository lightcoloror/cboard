'use strict';
// Replay the exact hash-verified project outputs used by the paper kits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
module.exports=function paperKit(root,destination){
  const examples=[],groups=[],assets=new Map(),sourceReceipts=[];
  for(const day of ['2026-10-12','2026-10-13']){
    const dir=path.join(root,'deliverables','tuyujia-carnival-'+day);
    const selectionBytes=fs.readFileSync(path.join(dir,'打印稿选句记录.json'));
    const selection=JSON.parse(selectionBytes);
    const bytes=fs.readFileSync(path.join(dir,'日常例句运行记录.json'));
    if(hash(bytes)!==selection.sourceRecordSha256)throw Error('PAPER_SOURCE_DRIFT');
    const source=JSON.parse(bytes);
    if(!source.noManualSequenceChanges||selection.manualSequenceEdits)throw Error('UNVERIFIED_PAPER_SEQUENCE');
    if(JSON.stringify(selection.groups.flat())!==JSON.stringify(selection.selectedInputs)||selection.groups.some(g=>g.length!==3))throw Error('INVALID_PAPER_GROUPS');
    for(const texts of selection.groups){
      const ids=[];
      for(const text of texts){
        const row=source.candidates.find(x=>x.inputText===text);
        if(!row||!row.complete||row.missingTokens.length)throw Error('INCOMPLETE_PAPER_EXAMPLE');
        ids.push(String(examples.length));examples.push(row);
        for(const picture of row.output){
          const a=source.assets.find(a=>a.image===picture.image);
          if(!a)throw Error('ASSET_NOT_RECORDED');
          const src=path.resolve(dir,a.artifactPath),dest=path.resolve(destination,a.artifactPath);
          if(!src.startsWith(dir+path.sep)||!dest.startsWith(destination+path.sep))throw Error('ASSET_ESCAPE');
          const body=fs.readFileSync(src);
          if(hash(body)!==a.sha256||(assets.has(a.image)&&assets.get(a.image).sha256!==a.sha256))throw Error('ASSET_DRIFT');
          fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);
          assets.set(a.image,{image:a.image,artifactPath:a.artifactPath,sha256:a.sha256,bytes:body.length});
        }
      }
      groups.push({id:String(groups.length),title:'第 '+(groups.length+1)+' 组',exampleIds:ids});
    }
    sourceReceipts.push({date:day,runAt:source.runAt,sourceRecordSha256:hash(bytes),selectionSha256:hash(selectionBytes),sourceFiles:source.sourceFiles});
  }
  if(examples.length!==12||new Set(examples.map(x=>x.inputText)).size!==12)throw Error('EXPECTED_TWELVE_UNIQUE_EXAMPLES');
  const receipt={schema:'tuyujia-paper-kit-replay.v1',runAt:sourceReceipts.at(-1).runAt,
    evidenceType:'replay-of-hash-verified-local-project-outputs-used-by-paper-kits',
    noManualSequenceChanges:true,sourceFiles:sourceReceipts.flatMap(s=>s.sourceFiles),sourceReceipts,
    groups,examples,assets:[...assets.values()]};
  fs.writeFileSync(path.join(destination,'project-run-results.json'),JSON.stringify(receipt,null,2));
  return receipt;
};
