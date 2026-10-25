/*
 * Production-app acceptance helper; creates no browser until open() is called.
 * Reuses the repository Playwright runtime and existing speech/UI helpers.
 * A persistent, isolated profile survives an actual Chromium process shutdown.
 * This is stronger than a new tab, but is not a device restart.
 */
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('../../fork-cboard/cboard/node_modules/@playwright/test');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const stageRoot = __dirname;
const safeOrigins = new Set([
  'http://127.0.0.1:4197',
  'http://127.0.0.1:4198',
  'https://app.tuyujia.com.cn'
]);

async function browserProcessId(context, isolatedProfile) {
  const browser = context.browser();
  if (browser) {
    const cdp = await browser.newBrowserCDPSession();
    try {
      const result = await cdp.send('SystemInfo.getProcessInfo');
      const entry = result.processInfo.find(item => item.type === 'browser');
      const id = Number(entry?.id);
      assert(Number.isInteger(id), 'Browser process ID could not be observed');
      return id;
    } finally {
      await cdp.detach();
    }
  }
  // Playwright 1.54 persistent contexts can have browser() === null.
  // Read only the main Chrome process for this exact owned user-data directory.
  assert(process.platform === 'win32' && isolatedProfile,
    'Persistent browser PID observation is unavailable');
  const escaped = isolatedProfile.replace(/'/g, "''");
  const script = `$ProgressPreference='SilentlyContinue'; $target='${escaped}'; $items=@(Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($target) -and $_.CommandLine -notmatch '--type=' } | Select-Object -ExpandProperty ProcessId); ConvertTo-Json -InputObject $items -Compress`;
  const output = execFileSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const ids = JSON.parse(output.trim());
  assert(Array.isArray(ids) && ids.length === 1 && Number.isInteger(ids[0]),
    'Exactly one isolated main Chrome process must be observable');
  return ids[0];
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitUntilExited(pid) {
  for (let i = 0; i < 100; i += 1) {
    if (!processAlive(pid)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Browser process remained alive after closing isolated context');
}

async function snapshotStorage(page, keyPrefixes = ['cboard_communication_']) {
  const values = await page.evaluate(prefixes =>
    Object.fromEntries(Object.keys(localStorage).sort()
      .filter(key => prefixes.some(prefix => key.startsWith(prefix)))
      .map(key => [key, localStorage.getItem(key)])), keyPrefixes);
  return {
    values,
    hashes: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key, { sha256: digest(value || ''), bytes: Buffer.byteLength(value || '') }
    ]))
  };
}

function createPersistentBrowserHarness(options = {}) {
  const baseURL = options.baseURL || process.env.EXPRESSION_BASE_URL ||
    'http://127.0.0.1:4198';
  const origin = new URL(baseURL).origin;
  assert(safeOrigins.has(origin), `Unapproved acceptance origin: ${origin}`);
  const fixtureMarker = `tuyujia-expression-draft-${crypto.randomUUID()}`;
  // Keep user profiles untouched; never attach to an existing browser.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyujia-expression-draft-'));
  const markerFile = path.join(profile, '.synthetic-acceptance-owner');
  fs.writeFileSync(markerFile, fixtureMarker, { flag: 'wx' });
  const evidence = {
    scope: 'isolated-synthetic-production-app',
    profile, fixtureMarker, origin, processes: [], requests: [], violations: [],
    pageErrors: [],
    externalModelsCalled: false,
    physicalDeviceTested: false
  };
  const sensitiveMarkers = options.sensitiveMarkers || [
    '合成林安', '欧阳明澈', 'synthetic-person-a', 'synthetic-person-b'
  ];
  let context = null;
  let page = null;
  let generation = 0;

  function classify(request) {
    const url = new URL(request.url());
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    let decoded = url.href;
    try { decoded = decodeURIComponent(decoded); } catch (_) {}
    const body = request.postData() || '';
    const containsPrivate = isHttp && (sensitiveMarkers.some(value =>
      decoded.includes(value) || body.includes(value)) ||
      /data:image|blob:synthetic|private-gallery|wxfile:/i.test(decoded + body));
    const aiOrCharge = isHttp && /\/api\/(?:gpt|billing|charge)(?:\/|$)/.test(url.pathname);
    return { url, body, containsPrivate, aiOrCharge, isHttp };
  }

  async function open({ offline = false, installPage } = {}) {
    assert(!context, 'Close previous isolated browser before opening another');
    assert(fs.readFileSync(markerFile, 'utf8') === fixtureMarker);
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      headless: true,
      locale: options.locale || 'zh-CN',
      baseURL: origin,
      viewport: { width: 1400, height: 1000 },
      serviceWorkers: 'allow',
      acceptDownloads: false
    });
    generation += 1;
    const pid = await browserProcessId(context, profile);
    assert(!evidence.processes.some(previous => previous.pid === pid),
      'A fresh browser process was not observed');
    evidence.processes.push({
      generation, pid, startedAt: new Date().toISOString(), offline
    });
    context.on('request', request => {
      const { url, body, containsPrivate, aiOrCharge, isHttp } = classify(request);
      if (!isHttp) return;
      // Keep synthetic body contents out of reports. No headers/tokens recorded.
      const entry = {
        generation, method: request.method(), origin: url.origin,
        path: url.pathname, bodySha256: body ? digest(body) : null,
        containsPrivate, aiOrCharge
      };
      evidence.requests.push(entry);
      if (containsPrivate || aiOrCharge) evidence.violations.push(entry);
    });
    await context.route('**/*', route => {
      const { url, containsPrivate } = classify(route.request());
      if (url.origin !== origin || url.pathname.startsWith('/api/') ||
          containsPrivate) return route.abort('blockedbyclient');
      return route.continue();
    });
    if (offline) await context.setOffline(true);
    page = context.pages()[0] || await context.newPage();
    page.on('pageerror', error => evidence.pageErrors.push({
      generation, message: error.message
    }));
    if (installPage) await installPage(page, context);
    return { context, page, pid, generation };
  }

  async function close() {
    if (!context) return;
    const current = evidence.processes[evidence.processes.length - 1];
    await context.close();
    if (current) {
      await waitUntilExited(current.pid);
      current.exited = true;
      current.exitedAt = new Date().toISOString();
    }
    page = null;
    context = null;
  }

  function saveEvidence(name = 'browser-process-restart-evidence.json', extra = {}) {
    assert(path.basename(name) === name && name.endsWith('.json'));
    const qualifier = origin === 'https://app.tuyujia.com.cn' ? 'production' : 'local';
    const rootName = `${qualifier}-${name}`;
    const output = fs.existsSync(path.join(stageRoot, rootName))
      ? rootName.replace(/\.json$/, `-${Date.now()}.json`) : rootName;
    const result = { ...evidence, ...extra, evidenceFile: output };
    fs.writeFileSync(path.join(stageRoot, output), JSON.stringify(result, null, 2),
      { flag: 'wx' });
    return result;
  }

  function assertNoPrivateOrAiRequests() {
    assert.deepEqual(evidence.violations, [],
      'Private data or AI/charge request attempted during local draft flow');
    assert.deepEqual(evidence.pageErrors, [],
      'A production app page threw during the browser process sequence');
  }

  return { open, close, saveEvidence, assertNoPrivateOrAiRequests, getPage: () => page,
    evidence, baseURL: origin, profile };
}

module.exports = {
  createPersistentBrowserHarness, snapshotStorage, browserProcessId, digest
};
