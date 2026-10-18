import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour
} from './helpers/communicationSupport';
import { persistAuthenticatedUser } from './helpers/authentication';

const RECORDS = 'cboard_communication_receiver_records';
const HISTORY = 'cboard_communication_history';

function v2Response(sourceText, tokens) {
  let cursor = 0;
  return {
    contractVersion: 2,
    sourceText,
    offsetUnit: 'unicode-code-point',
    requiresConfirmation: true,
    tokens,
    segments: tokens.map(surface => {
      const start = cursor;
      cursor += Array.from(surface).length;
      return { start, end: cursor, surface };
    })
  };
}

async function openReceiver(
  page,
  touch,
  authenticated = false,
  funding = true
) {
  await blockRemoteHttpRequests(page);
  await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
  await dismissBoardTour(page, touch);
  if (authenticated) {
    // This suite also runs the collaboration build. Its authenticated route
    // needs a synthetic patient context; serving index.html for an API request
    // would test a broken fixture rather than the segmentation workflow.
    const profile = {
      id: 'synthetic-segmentation-patient',
      familyId: 'synthetic-segmentation-family',
      relationship: { role: 'patient', defaultMode: 'expression' }
    };
    await page.route('**/api/care/**', route => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path === '/api/care/profiles') body = [profile];
      else if (path === '/api/care/context')
        body = { selectedProfileId: profile.id };
      else if (path.endsWith('/favorites')) body = { items: [] };
      else
        body = {
          ...profile,
          cursor: 1,
          permissions: ['read'],
          resources: []
        };
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body)
      });
    });
    await persistAuthenticatedUser(page, 'synthetic-segmentation-token', {
      locale: 'zh-CN'
    });
    if (funding) {
      // Synthetic selection for the real Axios funding interceptor. No real
      // account, grant, model or balance is accessed by this routed suite.
      await page.evaluate(() =>
        localStorage.setItem(
          'care-funding-v1:playwright-private-picture-user:synthetic-segmentation-patient',
          'synthetic-segmentation-funding'
        )
      );
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, touch);
  }
  // CareHome opens the panel immediately and may show its first-use overlay
  // before the receiver-mode button exists. Complete that same user flow first.
  if (authenticated) await completeCommunicationOnboarding(page, touch);
  const panel = page.locator('.CommunicationSupportPanel');
  await activate(panel.getByRole('button', { name: '接收理解' }), touch);
  if (!authenticated) await completeCommunicationOnboarding(page, touch);
  return page.getByRole('dialog', { name: '接收理解' });
}

const input = workspace =>
  workspace.getByRole('textbox', { name: '例如：想喝水、想要苹果、头疼' });
const editor = workspace =>
  workspace.getByRole('textbox', { name: '分词结果（可修改）' });
async function generate(workspace, touch, text) {
  await input(workspace).fill(text);
  await activate(
    workspace.getByRole('button', { name: '生成图片序列' }),
    touch
  );
  await expect(editor(workspace)).toBeVisible();
}
async function keepMissing(workspace, touch) {
  const keep = workspace.getByRole('button', { name: '保留文字', exact: true });
  while (await keep.count()) await activate(keep.first(), touch);
}
async function readRecords(page, key = RECORDS) {
  return page.evaluate(name => {
    const selection = localStorage.getItem(
      'care-selection-v1:playwright-private-picture-user'
    );
    if (selection) {
      const profile = JSON.parse(selection);
      const scope = [
        'playwright-private-picture-user',
        profile.familyId,
        profile.id
      ]
        .map(encodeURIComponent)
        .join(':');
      return JSON.parse(
        localStorage.getItem(`communication-v2:${scope}:${name}`) || '[]'
      );
    }
    return JSON.parse(localStorage.getItem(name) || '[]');
  }, key);
}

test('keeps female reference and whole opening actions after confirmation and network-free reload', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  let workspace = await openReceiver(page, touch);
  const raw = '她不想打开门';
  await generate(workspace, touch, raw);
  const row = token =>
    workspace
      .locator('.CommunicationSupportPanel__matchRow')
      .filter({
        has: page.locator('.CommunicationSupportPanel__token', {
          hasText: token
        })
      });
  await expect(row(/^她$/).locator('img')).toHaveAttribute(
    'src',
    /arasaac\/she\.png/
  );
  await expect(row(/^打开门$/).locator('img')).toHaveAttribute(
    'src',
    /open_door_2_,_to\.svg/
  );
  await expect(row(/^不$/)).toHaveCount(1);
  for (const token of [/^她$/, /^打开门$/]) {
    await expect
      .poll(() =>
        row(token)
          .locator('img')
          .evaluate(img => img.complete && img.naturalWidth > 0)
      )
      .toBe(true);
  }
  await keepMissing(workspace, touch);
  await activate(
    workspace.getByRole('button', { name: '全屏展示', exact: true }),
    touch
  );
  const record = (await readRecords(page)).find(
    item => item.recordStatus === 'confirmed'
  );
  expect(record.output.map(item => item.vocalization).join('')).toBe(raw);
  expect(record.pictogramSequence.map(item => item.originalToken)).toEqual([
    '她',
    '不',
    '想',
    '打开门'
  ]);
  // Local production-artifact bytes, not a phone or Service Worker test.
  await page.route('**/api/**', route => route.abort('internetdisconnected'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  workspace = page.getByRole('dialog', { name: '接收理解' });
  await expect(
    workspace.locator('.CommunicationSupportPanel__historyTitle')
  ).toContainText(raw);
  const restored = (await readRecords(page)).find(
    item => item.recordStatus === 'confirmed'
  );
  expect(restored.output.map(item => item.vocalization).join('')).toBe(raw);
  await generate(workspace, touch, '请打开罐头');
  await expect(row(/^打开罐头$/).locator('img')).toHaveAttribute(
    'src',
    /open_tin_,_to\.svg/
  );
  await generate(workspace, touch, '请打开窗户');
  await expect(
    row(/^打开$/).getByRole('button', { name: '保留文字', exact: true })
  ).toBeVisible();
});

test('keeps the need picture and reflexive text after confirmation and network-free reload', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  let workspace = await openReceiver(page, touch);
  const raw = '我要自己拿杯子';
  await generate(workspace, touch, raw);
  const need = workspace
    .locator('.CommunicationSupportPanel__matchRow')
    .filter({
      has: page.locator('.CommunicationSupportPanel__token', {
        hasText: /^要$/
      })
    });
  const picture = need.locator('img');
  await expect(picture).toHaveAttribute('src', /want_,_to\.svg/);
  await expect
    .poll(() => picture.evaluate(img => img.complete && img.naturalWidth > 0))
    .toBe(true);
  const reflexive = workspace
    .locator('.CommunicationSupportPanel__matchRow')
    .filter({
      has: page.locator('.CommunicationSupportPanel__token', {
        hasText: /^自己$/
      })
    });
  await expect(
    reflexive.getByRole('button', { name: '保留文字', exact: true })
  ).toBeVisible();
  await keepMissing(workspace, touch);
  await activate(
    workspace.getByRole('button', { name: '全屏展示', exact: true }),
    touch
  );
  const record = (await readRecords(page)).find(
    item => item.recordStatus === 'confirmed'
  );
  expect(
    record.pictogramSequence.find(item => item.originalToken === '自己')
      .textOnly
  ).toBe(true);
  expect(record.output.map(item => item.vocalization).join('')).toBe(raw);
  // Application bytes are served by the existing local artifact adapter.
  // This is not a Service Worker or phone-network test.
  await page.route('**/api/**', route => route.abort('internetdisconnected'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  workspace = page.getByRole('dialog', { name: '接收理解' });
  await expect(
    workspace.locator('.CommunicationSupportPanel__historyTitle')
  ).toContainText(raw);
  const restored = (await readRecords(page)).find(
    item => item.recordStatus === 'confirmed'
  );
  expect(restored.output.map(item => item.vocalization).join('')).toBe(raw);
  expect(
    restored.pictogramSequence.find(item => item.originalToken === '自己')
      .textOnly
  ).toBe(true);
});

test('keeps a separate negation and whole eating action after review and reload', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  let workspace = await openReceiver(page, touch);
  const raw = '我今晚不回家吃饭';
  const expected = '我 / 今晚 / 不 / 回家 / 吃饭';
  await generate(workspace, touch, raw);
  await expect(editor(workspace)).toHaveValue(expected);
  await keepMissing(workspace, touch);
  await activate(
    workspace.getByRole('button', { name: '全屏展示', exact: true }),
    touch
  );
  const confirmed = (await readRecords(page)).filter(
    record => record.recordStatus === 'confirmed'
  );
  expect(confirmed).toHaveLength(1);
  expect(
    confirmed[0].pictogramSequence.map(item => item.originalToken)
  ).toEqual(['我', '今晚', '不', '回家', '吃饭']);
  expect(
    confirmed[0].pictogramSequence.find(item => item.originalToken === '吃饭')
      .textOnly
  ).toBe(true);
  expect(confirmed[0].output.map(item => item.vocalization).join('')).toBe(raw);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  workspace = page.getByRole('dialog', { name: '接收理解' });
  await expect(
    workspace.locator('.CommunicationSupportPanel__historyTitle')
  ).toContainText(raw);
  const restored = (await readRecords(page)).find(
    record => record.recordStatus === 'confirmed'
  );
  expect(restored.pictogramSequence.map(item => item.originalToken)).toEqual([
    '我',
    '今晚',
    '不',
    '回家',
    '吃饭'
  ]);
});

test('retains double negation as explicit text, confirms once and restores after reload', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  let workspace = await openReceiver(page, touch);
  const raw = '我不是不想吃饭';
  await generate(workspace, touch, raw);
  await expect(
    workspace.getByRole('button', { name: '全屏展示', exact: true })
  ).toBeDisabled();
  await keepMissing(workspace, touch);
  // An uncompleted review survives a cold page reload with its explicit text.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  workspace = page.getByRole('dialog', { name: '接收理解' });
  await expect(input(workspace)).toHaveValue(raw);
  await expect(
    workspace.getByRole('button', { name: '全屏展示', exact: true })
  ).toBeEnabled();
  const send = workspace.getByRole('button', {
    name: '发送到输出栏',
    exact: true
  });
  await activate(send, touch);
  await activate(send, touch);
  const display = workspace.getByRole('button', {
    name: '全屏展示',
    exact: true
  });
  await display.evaluate(button => {
    button.click();
    button.click();
  });
  const confirmed = (await readRecords(page)).filter(
    record => record.recordStatus === 'confirmed'
  );
  expect(confirmed).toHaveLength(1);
  expect(confirmed[0].inputText).toBe(raw);
  expect(confirmed[0].output.map(item => item.vocalization).join('')).toBe(raw);
  expect(
    confirmed[0].pictogramSequence
      .filter(item => ['不是', '不想'].includes(item.originalToken))
      .every(item => item.textOnly)
  ).toBe(true);
  expect(
    (await readRecords(page, HISTORY)).filter(
      record => record.direction === 'receive'
    )
  ).toHaveLength(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  workspace = page.getByRole('dialog', { name: '接收理解' });
  await expect(workspace).toContainText(raw);
  await expect(
    workspace.locator('.CommunicationSupportPanel__historyTitle')
  ).toContainText(raw);
});

test('requires acceptance of AI boundaries and suppresses duplicate pending requests', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  const workspace = await openReceiver(page, touch, true);
  const raw = '我不是不想吃饭';
  await generate(workspace, touch, raw);
  const before = await editor(workspace).inputValue();
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const requests = [];
  const headers = [];
  await page.route('**/gpt/communication/resegment', async route => {
    requests.push(route.request().postDataJSON());
    headers.push(route.request().headers());
    await gate;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        v2Response(raw, ['我', '不是', '不', '想', '吃', '饭'])
      )
    });
  });
  const ai = workspace.getByRole('button', {
    name: 'AI 优化分词',
    exact: true
  });
  await ai.evaluate(button => {
    button.click();
    button.click();
  });
  await expect.poll(() => requests.length).toBe(1);
  await expect(
    workspace.getByRole('button', { name: 'AI 分词中...' })
  ).toBeDisabled();
  release();
  await expect(
    workspace.getByRole('region', { name: 'AI 分词建议' })
  ).toBeVisible();
  await expect(editor(workspace)).toHaveValue(before);
  expect(requests[0].text).toBe(raw);
  expect(requests[0].contractVersion).toBe(2);
  expect(headers[0]['x-care-profile-id']).toBe(
    'synthetic-segmentation-patient'
  );
  expect(headers[0]['x-care-funding-id']).toBe(
    'synthetic-segmentation-funding'
  );
  expect(headers[0]['idempotency-key']).toBeTruthy();
  await activate(
    workspace.getByRole('button', { name: '采用分词建议' }),
    touch
  );
  await expect(editor(workspace)).toHaveValue('我 / 不是 / 不 / 想 / 吃 / 饭');
  await expect(
    workspace.getByRole('region', { name: 'AI 分词建议' })
  ).toHaveCount(0);
});

test('keeps AI disabled until an explicit funding source is selected', async ({
  page
}, info) => {
  const workspace = await openReceiver(
    page,
    info.project.name.startsWith('mobile-'),
    true,
    false
  );
  await generate(workspace, info.project.name.startsWith('mobile-'), '我背疼');
  await expect(
    workspace.getByRole('button', { name: 'AI 优化分词', exact: true })
  ).toBeDisabled();
  await expect(workspace).toContainText('请先在家庭设置中选择 AI 额度来源');
  await expect(editor(workspace)).toHaveValue('我 / 背疼');
});

test('retains explicit text choices after AI acceptance and a network-free reload', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  let workspace = await openReceiver(page, touch, true);
  const raw = '我今晚不回家吃饭';
  await generate(workspace, touch, raw);
  await keepMissing(workspace, touch);
  const before = (await readRecords(page)).find(
    record => record.inputText === raw
  );
  const textTokens = before.pictogramSequence
    .filter(item => item.textOnly)
    .map(item => item.originalToken);
  expect(textTokens).toContain('吃饭');
  let calls = 0;
  await page.route('**/gpt/communication/resegment', route => {
    calls++;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        v2Response(raw, ['我', '今晚', '不', '回家', '吃饭'])
      )
    });
  });
  await activate(
    workspace.getByRole('button', { name: 'AI 优化分词', exact: true }),
    touch
  );
  await expect(
    workspace.getByRole('region', { name: 'AI 分词建议' })
  ).toBeVisible();
  await activate(
    workspace.getByRole('button', { name: '采用分词建议', exact: true }),
    touch
  );
  await expect(
    workspace.getByRole('button', { name: '全屏展示', exact: true })
  ).toBeEnabled();
  const after = (await readRecords(page)).find(
    record => record.inputText === raw
  );
  expect(
    after.pictogramSequence
      .filter(item => item.textOnly)
      .map(item => item.originalToken)
  ).toEqual(textTokens);
  expect(after.pictogramSequence.every(item => item.matchType !== 'ai')).toBe(
    true
  );
  // The virtual artifact provides the application shell. Block all API calls;
  // this tests local restoration, not Service Worker or actual phone networking.
  await page.route('**/api/**', route => route.abort('internetdisconnected'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  workspace = page.getByRole('dialog', { name: '接收理解' });
  await expect(input(workspace)).toHaveValue(raw);
  await expect(
    workspace.getByRole('button', { name: '全屏展示', exact: true })
  ).toBeEnabled();
  expect(calls).toBe(1);
});

test('ignores a late AI response after new input and preserves manual progress', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  const workspace = await openReceiver(page, touch, true);
  await generate(workspace, touch, '我不是不想吃饭');
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  let sent = false;
  await page.route('**/gpt/communication/resegment', async route => {
    sent = true;
    await gate;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        v2Response('我不是不想吃饭', ['我', '不是', '不想', '吃', '饭'])
      )
    });
  });
  await activate(workspace.getByRole('button', { name: 'AI 优化分词' }), touch);
  await expect.poll(() => sent).toBe(true);
  await generate(workspace, touch, '我背疼');
  await keepMissing(workspace, touch);
  const before = await editor(workspace).inputValue();
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/gpt/communication/resegment')
  );
  release();
  await responsePromise;
  await expect(input(workspace)).toHaveValue('我背疼');
  await expect(editor(workspace)).toHaveValue(before);
  await expect(
    workspace.getByRole('region', { name: 'AI 分词建议' })
  ).toHaveCount(0);
  await activate(workspace.getByRole('button', { name: '全屏展示' }), touch);
  expect(
    (await readRecords(page)).filter(
      record => record.recordStatus === 'confirmed'
    )[0].inputText
  ).toBe('我背疼');
});

for (const failure of ['unavailable', 'network', 'source-changed']) {
  test(`keeps local receiver usable after AI ${failure}`, async ({
    page
  }, info) => {
    const touch = info.project.name.startsWith('mobile-');
    const workspace = await openReceiver(page, touch, true);
    await generate(workspace, touch, '我背疼');
    await keepMissing(workspace, touch);
    const before = await editor(workspace).inputValue();
    await page.route('**/gpt/communication/resegment', route =>
      failure === 'network'
        ? route.abort('internetdisconnected')
        : route.fulfill({
            status: failure === 'unavailable' ? 503 : 200,
            contentType: 'application/json',
            body: JSON.stringify(
              failure === 'unavailable'
                ? { message: 'AI service not configured' }
                : v2Response('我背疼', ['我', '痛'])
            )
          })
    );
    await activate(
      workspace.getByRole('button', { name: 'AI 优化分词' }),
      touch
    );
    await expect(workspace).toContainText(
      failure === 'source-changed'
        ? 'AI 建议未完整保留原文'
        : failure === 'unavailable'
        ? '服务端尚未配置 AI'
        : '再次点击会核对同一请求'
    );
    await expect(editor(workspace)).toHaveValue(before);
    await expect(input(workspace)).toHaveValue('我背疼');
    await activate(workspace.getByRole('button', { name: '全屏展示' }), touch);
    expect(
      (await readRecords(page)).filter(
        record => record.recordStatus === 'confirmed'
      )
    ).toHaveLength(1);
  });
}

test('reuses a timed-out AI request after reload and recovers the existing result', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  let workspace = await openReceiver(page, touch, true);
  const raw = '我今晚不回家吃饭';
  await generate(workspace, touch, raw);
  const requests = [];
  // This is the synthetic transport receipt. The real server atomic ledger,
  // charging and caller-abort path are covered by the API HTTP suite.
  const receipts = new Map();
  let providerCalls = 0;
  await page.route('**/gpt/communication/resegment', async route => {
    const id = route.request().headers()['idempotency-key'];
    requests.push(id);
    if (!receipts.has(id)) {
      providerCalls += 1;
      receipts.set(id, v2Response(raw, ['我', '今晚', '不', '回家', '吃饭']));
      return route.abort('timedout');
    }
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'X-Care-Idempotency-Replayed': 'true' },
      body: JSON.stringify(receipts.get(id))
    });
  });
  await activate(
    workspace.getByRole('button', { name: 'AI 优化分词', exact: true }),
    touch
  );
  await expect(workspace).toContainText('再次点击会核对同一请求');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  workspace = page.getByRole('dialog', { name: '接收理解' });
  await expect(input(workspace)).toHaveValue(raw);
  await activate(
    workspace.getByRole('button', { name: 'AI 优化分词', exact: true }),
    touch
  );
  await expect(
    workspace.getByRole('region', { name: 'AI 分词建议' })
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatch(/^cai_[a-f0-9]{64}$/);
  expect(requests[1]).toBe(requests[0]);
  expect(providerCalls).toBe(1);
  await activate(
    workspace.getByRole('button', { name: '采用分词建议' }),
    touch
  );
  await expect(editor(workspace)).toHaveValue('我 / 今晚 / 不 / 回家 / 吃饭');
});
