'use strict';
// Tests the retained harness lifecycle against a synthetic local page, not CBoard.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(process.argv[2]);
const { createPersistentBrowserHarness } = require(path.join(root,
  'outputs/tuyujia-expression-draft-20261020/persistent-browser-harness.cjs'));
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Synthetic profile rebuild</title>');
});
(async () => {
  await new Promise((resolve, reject) => {server.once('error',reject);server.listen(4197,'127.0.0.1',resolve);});
  const h = createPersistentBrowserHarness({baseURL:'http://127.0.0.1:4197'});
  try {
    let { page } = await h.open();
    await page.goto('http://127.0.0.1:4197');
    await page.evaluate(() => localStorage.setItem('retention-smoke','synthetic-only'));
    await h.close();
    ({ page } = await h.open());
    await page.goto('http://127.0.0.1:4197');
    assert.equal(await page.evaluate(() => localStorage.getItem('retention-smoke')),'synthetic-only');
    await h.close();
    h.assertNoPrivateOrAiRequests();
    assert(h.evidence.processes.every(p=>p.exited));
    fs.writeFileSync(path.join(root,'rebuild-smoke.json'),JSON.stringify({status:'passed',scope:'retained-harness-new-profile-two-process-localStorage',productAcceptance:false,downloads:0,processCount:h.evidence.processes.length},null,2));
    const profile=path.resolve(h.profile);
    assert(path.basename(profile).startsWith('tuyujia-expression-draft-'));
    assert(fs.readFileSync(path.join(profile,'.synthetic-acceptance-owner'),'utf8')===h.evidence.fixtureMarker);
    fs.rmSync(profile,{recursive:true});
    console.log('PASS: fresh profile rebuilt; persisted across two exited browser processes; own smoke profile removed');
  } finally {await h.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
