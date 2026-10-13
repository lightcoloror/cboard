'use strict';

// Evaluation glue only. Product matching stays in the existing shared core.
// Unicode spans, multiple acceptable granularities and distinct failure axes.
const { boundaryScore } = require('./evaluateCommunicationSegmentation.cjs');
function spans(tokens) {
  let pos=0;
  return tokens.map(text=>{const start=pos;pos+=Array.from(text).length;return {text,start,end:pos};});
}
function occurrences(text, needle) {
  const chars=Array.from(text), term=Array.from(needle), result=[];
  for(let start=0;start<=chars.length-term.length;start++)
    if(chars.slice(start,start+term.length).join('')===needle)result.push({start,end:start+term.length});
  return result;
}
function scoreConstraints(ref,tokens) {
  const valid=Array.isArray(tokens)&&tokens.length>0&&tokens.every(t=>typeof t==='string'&&t.length>0);
  const sourcePreserved=valid&&tokens.join('')===ref.text;
  // Reuse the earlier structured-adaptation diagnostic; punctuation loss is
  // still rejected but is not misreported as proven lexical meaning reversal.
  const sourceMismatchKind=sourcePreserved?null:!valid?'no_valid_structure':tokens.join('').replace(/\p{P}/gu,'')===ref.text.replace(/\p{P}/gu,'')?'punctuation_only':'content_changed';
  const actual=valid?spans(tokens):[];
  const rules=(ref.constraints||[]).flatMap(rule=>occurrences(ref.text,rule.text).map(span=>({...span,...rule})));
  // A separate 眼镜 occurrence is tested; the substring inside 眼镜盒 is not
  // simultaneously required to have incompatible boundaries.
  const checks=rules.filter(r=>!rules.some(other=>other.text!==r.text&&other.start<=r.start&&other.end>=r.end&&(other.end-other.start)>(r.end-r.start))).map(rule=>{
    const slice=actual.filter(s=>s.start>=rule.start&&s.end<=rule.end);
    const aligned=slice.length>0&&slice[0].start===rule.start&&slice.at(-1).end===rule.end;
    const pass=sourcePreserved&&aligned&&rule.alternatives.some(a=>JSON.stringify(a)===JSON.stringify(slice.map(s=>s.text)));
    return {text:rule.text,start:rule.start,end:rule.end,actual:slice.map(s=>s.text),allowed:rule.alternatives,pass};
  });
  return {sourcePreserved:!!sourcePreserved,sourceMismatchKind,constraints:checks,granularityMeasured:checks.length>0,
    granularityStatus:!checks.length?'not_annotated':sourcePreserved&&checks.every(c=>c.pass)?'pass':'constraint_difference',
    granularityPass:!!sourcePreserved&&checks.length>0&&checks.every(c=>c.pass),
    criticalTextPreserved:!!sourcePreserved, // Necessary condition, NOT a semantic comprehension score.
    referenceBoundaryF1:valid&&ref.referenceTokens?boundaryScore(tokens,ref.referenceTokens).f1:null};
}
function estimateCost(usage,rate) {
  if(!usage||!rate||![usage.prompt_tokens,usage.completion_tokens,rate.input,rate.output].every(n=>Number.isFinite(n)&&n>=0))return null;
  const cached=usage.prompt_cache_hit_tokens??usage.prompt_tokens_details?.cached_tokens??0;
  if(!Number.isFinite(cached)||cached<0||cached>usage.prompt_tokens||cached&&!Number.isFinite(rate.cache))return null;
  return ((usage.prompt_tokens-cached)*rate.input+cached*(rate.cache??0)+usage.completion_tokens*rate.output)/1e6;
}
function quantile(values,q) {
  const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;
  return a[Math.max(0,Math.ceil(q*a.length)-1)]; // Empirical nearest-rank; small-N is explicitly reported.
}
function median(values) {
  const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;
  const middle=Math.floor(a.length/2);return a.length%2?a[middle]:(a[middle-1]+a[middle])/2;
}
function scorePictureEvidence(ref, items, sourcePreserved) {
  const meaningful=s=>Array.from(s.replace(/[\s\p{P}]/gu,'')).length;
  const actual=spans(items.map(i=>i.token)).map((s,n)=>({...s,...items[n]}));
  const layoutSourcePreserved=!!sourcePreserved&&actual.map(i=>i.token).join('')===ref.text;
  // Evaluate images at their source span: the 眼镜 inside 眼镜盒 must not be
  // confused with the separate 眼镜 later in the same sentence.
  const compounds={开心果:['开心','水果','苹果'],眼镜盒:['眼镜'],助听器:['耳朵']};
  const errors=actual.filter(i=>i.imageDecision==='mismatch').map(i=>({token:i.token,start:i.start,end:i.end,reason:i.reason}));
  for(const [term,forbidden] of Object.entries(compounds))for(const unit of occurrences(ref.text,term)){
    for(const i of actual)if(i.image&&i.start>=unit.start&&i.end<=unit.end&&forbidden.includes(i.label))
      if(!errors.some(e=>e.start===i.start&&e.end===i.end))errors.push({token:i.token,start:i.start,end:i.end,reason:term+'被局部词义图片替代'});
  }
  const verified=i=>layoutSourcePreserved&&i.verifiedPictureCandidate&&!errors.some(e=>e.start===i.start&&e.end===i.end);
  const uncertain=actual.filter(i=>i.image&&!verified(i)&&!errors.some(e=>e.start===i.start&&e.end===i.end));
  const allTextFallback=actual.length>0&&actual.every(i=>!i.image);
  const totalCharacters=meaningful(ref.text),verifiedCharacters=actual.reduce((n,i)=>n+(verified(i)?meaningful(i.token):0),0);
  const critical=(ref.critical||[]).flatMap(text=>occurrences(ref.text,text).map(unit=>({text,...unit,sourcePreserved:!!sourcePreserved,
    treatment:actual.filter(i=>i.start<unit.end&&i.end>unit.start).map(i=>({token:i.token,start:i.start,end:i.end,label:i.label,decision:i.imageDecision,pixelStatus:i.pixelStatus||null}))})));
  return {layoutSourcePreserved,allTextFallback,knownMeaningErrors:errors.length,meaningErrors:errors,meaningReviewPending:uncertain.length>0,
    semanticGuardStatus:!layoutSourcePreserved?'source_changed':errors.length?'known_image_meaning_error':allTextFallback?'all_text_fallback_not_picture_solution':uncertain.length?'needs_picture_review':'no_known_error_not_clinical_pass',
    critical,verifiedCharacters,totalCharacters,verifiedCharacterCoverage:totalCharacters?verifiedCharacters/totalCharacters:0,
    textFallbackCharacters:layoutSourcePreserved?actual.filter(i=>i.imageDecision==='text_fallback').reduce((n,i)=>n+meaningful(i.token),0):0};
}
function summarize(rows) {
  const known=rows.filter(r=>Number.isFinite(r.estimatedCny));
  return {requests:rows.length,transport:rows.filter(r=>r.transportOk).length,structure:rows.filter(r=>r.structureOk).length,
    source:rows.filter(r=>r.sourcePreserved).length,granularity:rows.filter(r=>r.granularityPass).length,
    punctuationOnlyDifferences:rows.filter(r=>r.sourceMismatchKind==='punctuation_only').length,
    contentDifferences:rows.filter(r=>r.sourceMismatchKind==='content_changed').length,
    constraintPass:rows.flatMap(r=>r.constraints||[]).filter(c=>c.pass).length,constraintTotal:rows.flatMap(r=>r.constraints||[]).length,
    medianAllAttemptMs:median(rows.map(r=>r.latencyMs)),p95AllAttemptMs:quantile(rows.map(r=>r.latencyMs),.95),
    medianValidSourceMs:median(rows.filter(r=>r.sourcePreserved).map(r=>r.latencyMs)),
    knownEstimatedCny:known.reduce((s,r)=>s+r.estimatedCny,0),unknownCostRequests:rows.length-known.length,
    totalEstimatedCny:known.length===rows.length?known.reduce((s,r)=>s+r.estimatedCny,0):null,
    // Cost of all attempts, including failures, divided by usable engineering outputs.
    costPerGranularityPassCny:known.length===rows.length&&rows.some(r=>r.granularityPass)?known.reduce((s,r)=>s+r.estimatedCny,0)/rows.filter(r=>r.granularityPass).length:null,
    p95Scope:'empirical observed sample only; includes failures when elapsed time recorded, not a population SLA'};
}
module.exports={spans,occurrences,scoreConstraints,scorePictureEvidence,estimateCost,quantile,median,summarize};
