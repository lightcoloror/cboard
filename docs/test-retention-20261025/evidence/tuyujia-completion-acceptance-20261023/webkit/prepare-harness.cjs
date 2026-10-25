const fs=require('fs'), path=require('path');
const source=path.resolve(__dirname,'../../tuyujia-targeted-acceptance-20261023');
let h=fs.readFileSync(path.join(source,'persistent-browser-harness.cjs'),'utf8');
h=h.replaceAll('../../fork-cboard/','../../../fork-cboard/').replace('const { chromium }','const { webkit }').replace('chromium.launchPersistentContext','webkit.launchPersistentContext').replace("channel: 'chrome',",'').replaceAll('http://127.0.0.1:4198','http://127.0.0.1:4208').replace("path.join(os.tmpdir(), 'tuyujia-expression-draft-')","path.join(__dirname, 'synthetic-profile-')");
h=h.replace(/  const browser = context.browser\(\);[\s\S]*?  \/\/ Playwright 1.54/, '  // Playwright 1.54');
h=h.replaceAll("name = 'chrome.exe'","name = 'Playwright.exe'").replaceAll('main Chrome','main WebKit').replaceAll('actual Chromium','actual WebKit');
fs.writeFileSync(path.join(__dirname,'persistent-browser-harness.cjs'),h);
for(const file of ['repair.spec.js','gallery.spec.js']) {
 let body=fs.readFileSync(path.join(source,file),'utf8').replaceAll('../../fork-cboard/','../../../fork-cboard/');
 fs.writeFileSync(path.join(__dirname,file),body);
}
