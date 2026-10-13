'use strict';
const assert=require('node:assert/strict');
const {scoreConstraints,scorePictureEvidence,estimateCost,summarize,spans}=require('./scoreCommunicationEvaluation.cjs');
let checks=0;function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('multiple acceptable family boundaries',()=>{
 const r={text:'请帮我的女儿',constraints:[{text:'我的女儿',alternatives:[['我的女儿'],['我','的','女儿']]}]};
 for(const tokens of [['请','帮','我的女儿'],['请','帮','我','的','女儿']])assert.equal(scoreConstraints(r,tokens).granularityPass,true);
 assert.equal(scoreConstraints(r,['请帮我的女儿']).granularityPass,false);
});
test('negation moved or removed is not compensated by good granularity',()=>{
 const r={text:'我不想吃饭',constraints:[{text:'吃饭',alternatives:[['吃饭']]}]};
 for(const t of [['我','想','吃饭'],['我','想','不','吃饭']])assert.equal(scoreConstraints(r,t).granularityPass,false);
});
test('repeated expressions evaluated by position',()=>{
 const r={text:'吃饭吃饭',constraints:[{text:'吃饭',alternatives:[['吃饭']]}]};
 assert.deepEqual(scoreConstraints(r,['吃饭','吃','饭']).constraints.map(x=>x.pass),[true,false]);
});
test('nested object names do not contradict longer protected phrases',()=>{
 const r={text:'眼镜盒不是眼镜',constraints:[{text:'眼镜盒',alternatives:[['眼镜盒']]},{text:'眼镜',alternatives:[['眼镜']]}]};
 assert.equal(scoreConstraints(r,['眼镜盒','不是','眼镜']).granularityPass,true);
});
test('emoji offsets use code points',()=>assert.deepEqual(spans(['🙂','我']),[{text:'🙂',start:0,end:1},{text:'我',start:1,end:2}]));
test('unknown billing is unknown, never free',()=>{assert.equal(estimateCost({},{}),null);assert.equal(estimateCost({prompt_tokens:10,completion_tokens:2},{input:null,output:null}),null)});
test('cache pricing and failure costs',()=>{
 assert.equal(estimateCost({prompt_tokens:100,completion_tokens:10,prompt_cache_hit_tokens:50},{input:2,output:4,cache:1}),.00019);
 const s=summarize([{sourcePreserved:true,granularityPass:true,estimatedCny:1,latencyMs:10},{sourcePreserved:false,granularityPass:false,estimatedCny:2,latencyMs:30000}]);
 assert.equal(s.requests,2);assert.equal(s.costPerGranularityPassCny,3);assert.equal(s.p95AllAttemptMs,30000);
});
test('unmeasured constraints do not become a pass',()=>assert.equal(scoreConstraints({text:'我'},['我']).granularityPass,false));
test('pictures for a substring cannot stand for a different compound',()=>{
 const item=(token,label)=>({token,label,image:'actual.png',verifiedPictureCandidate:true,imageDecision:'label_equal'});
 const result=scorePictureEvidence({text:'眼镜盒不是眼镜'},[item('眼镜','眼镜'),{token:'盒不是',imageDecision:'text_fallback'},item('眼镜','眼镜')],true);
 assert.equal(result.knownMeaningErrors,1);assert.equal(result.verifiedCharacters,2);
});
test('critical negations tracked by occurrence not substring bag',()=>{
 const result=scorePictureEvidence({text:'不是不想',critical:['不']},[{token:'不是'},{token:'不'},{token:'想'}],true);
 assert.deepEqual(result.critical.map(c=>c.treatment.map(i=>i.token)),[['不是'],['不']]);
});
test('unverified pixels and invalid source never count as verified coverage',()=>{
 const items=[{token:'水',image:'water.png',imageDecision:'label_equal',verifiedPictureCandidate:false}];
 assert.equal(scorePictureEvidence({text:'水'},items,true).verifiedCharacters,0);
 assert.equal(scorePictureEvidence({text:'水'},[{...items[0],verifiedPictureCandidate:true}],false).verifiedCharacters,0);
 assert.equal(scorePictureEvidence({text:'水'},items,true).meaningReviewPending,true);
});
test('keeping the whole sentence as text is not a picture solution',()=>{
 const e=scorePictureEvidence({text:'我不回家'},[{token:'我不回家',imageDecision:'text_fallback'}],true);
 assert.equal(e.layoutSourcePreserved,true);assert.equal(e.semanticGuardStatus,'all_text_fallback_not_picture_solution');
});
test('even sample median uses both central observations',()=>{
 assert.equal(summarize([{latencyMs:1000},{latencyMs:2000},{latencyMs:3000},{latencyMs:4000}]).medianAllAttemptMs,2500);
});
test('punctuation loss is rejected but distinguished from lexical change',()=>{
 const r=scoreConstraints({text:'不要，吃药'},['不要','吃药']);
 assert.equal(r.sourcePreserved,false);assert.equal(r.sourceMismatchKind,'punctuation_only');
 assert.equal(scoreConstraints({text:'不要吃药'},['要','吃药']).sourceMismatchKind,'content_changed');
});
console.log(JSON.stringify({passed:checks}));
