import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  dismissBoardTour,
  installBrowserTtsHarness,
  completeCommunicationOnboarding
} from './helpers/communicationSupport';
import { persistAuthenticatedUser } from './helpers/authentication';

const candidateSelector = 'button.CommunicationSupportPanel__candidate';
const readSpeech = page =>
  page.evaluate(() => window.__cboardTtsHarness.calls.map(call => call.text));
const clearSpeech = page =>
  page.evaluate(() => {
    window.__cboardTtsHarness.calls.length = 0;
  });

async function openExpression(page, touch, authenticated = false) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'cboard_communication_preferences',
      JSON.stringify({
        candidateAutoplayDelaySeconds: 5,
        onboardingComplete: true
      })
    )
  );
  await installBrowserTtsHarness(page);
  await blockRemoteHttpRequests(page);
  await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
  await dismissBoardTour(page, touch);
  if (authenticated) {
    const profile = {
      id: 'synthetic-expression-patient',
      familyId: 'synthetic-expression-family',
      relationship: { role: 'patient', defaultMode: 'expression' }
    };
    await page.route('**/api/care/**', route => {
      const path = new URL(route.request().url()).pathname;
      const body =
        path === '/api/care/profiles'
          ? [profile]
          : path === '/api/care/context'
          ? { selectedProfileId: profile.id }
          : path.endsWith('/favorites')
          ? { items: [] }
          : {
              ...profile,
              cursor: 1,
              permissions: ['read'],
              resources: [
                {
                  kind: 'board',
                  id: 'synthetic-expression-board',
                  version: 1,
                  seq: 1,
                  value: {
                    name: '合成表达图库',
                    tileIds: ['synthetic-me', 'synthetic-water']
                  }
                },
                {
                  kind: 'tile',
                  id: 'synthetic-me',
                  version: 1,
                  seq: 1,
                  value: { label: '我' }
                },
                {
                  kind: 'tile',
                  id: 'synthetic-water',
                  version: 1,
                  seq: 1,
                  value: { label: '喝水' }
                }
              ]
            };
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body)
      });
    });
    await persistAuthenticatedUser(page, 'synthetic-expression-token', {
      locale: 'zh-CN'
    });
    await page.evaluate(() =>
      localStorage.setItem(
        'care-funding-v1:playwright-private-picture-user:synthetic-expression-patient',
        'synthetic-expression-funding'
      )
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, touch);
    const onboarding = page.getByRole('dialog', {
      name: '双向沟通 · 第一次使用'
    });
    if (await onboarding.isVisible())
      await completeCommunicationOnboarding(page, touch);
    await activate(
      page
        .getByRole('navigation', { name: '选择沟通图板' })
        .getByRole('button', { name: '合成表达图库', exact: true }),
      touch
    );
  }
  const tiles = authenticated
    ? page.getByRole('group', { name: '可选择的图卡' }).getByRole('button')
    : page.locator('button.Tile:visible');
  await expect(tiles.first()).toBeVisible();
  await activate(tiles.nth(0), touch);
  await activate(tiles.nth(1), touch);
  const panel = page.locator('.CommunicationSupportPanel');
  await expect(panel.locator(candidateSelector)).toHaveCount(3);
  await expect(
    panel.getByRole('button', { name: '生成三个候选句', exact: true })
  ).toBeVisible();
  return panel;
}

test('selected pictures reveal three local choices, autoplay, manual selection and durable favorites', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  let onlineCalls = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/gpt/communication/sentences')
      onlineCalls += 1;
  });
  const panel = await openExpression(page, touch);
  await clearSpeech(page);
  await activate(
    panel.getByRole('button', { name: '生成三个候选句', exact: true }),
    touch
  );
  const candidates = await panel.locator(candidateSelector).allTextContents();
  expect(new Set(candidates).size).toBe(3);
  await expect
    .poll(() => readSpeech(page), { timeout: 9000 })
    .toEqual(candidates);
  await clearSpeech(page);
  await activate(panel.locator(candidateSelector).nth(1), touch);
  await expect.poll(() => readSpeech(page)).toEqual([candidates[1]]);
  await activate(panel.getByRole('button', { name: '确认此句' }), touch);
  await activate(panel.getByRole('button', { name: '收藏此句' }), touch);
  await expect(
    panel.getByRole('button', { name: '已确认', exact: true })
  ).toBeDisabled();
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('cboard_communication_saved_phrases') || '[]'
    )
  );
  expect(saved).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sentence: candidates[1] })
    ])
  );
  // The saved copy is independent of communication history, even offline.
  await page.evaluate(() =>
    localStorage.removeItem('cboard_communication_history')
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissBoardTour(page, touch);
  if (
    !(await panel
      .locator(candidateSelector)
      .first()
      .isVisible())
  ) {
    await activate(
      panel.getByRole('button', { name: '患者表达', exact: true }),
      touch
    );
  }
  const favorite = panel
    .locator('.CommunicationSupportPanel__savedRow')
    .filter({ hasText: candidates[1] });
  await expect(favorite).toBeVisible();
  await activate(
    favorite.getByRole('button', { name: '重用', exact: true }),
    touch
  );
  await expect(panel.locator(candidateSelector)).toHaveCount(3);
  expect(await panel.locator(candidateSelector).allTextContents()).toContain(
    candidates[1]
  );
  await clearSpeech(page);
  const restored = await panel.locator(candidateSelector).allTextContents();
  await activate(panel.getByRole('button', { name: '立即全部播报' }), touch);
  await expect.poll(() => readSpeech(page)).toEqual(restored);
  expect(onlineCalls).toBe(0);
  await page.screenshot({
    path: info.outputPath('local-expression-three.png'),
    fullPage: true
  });
});

test('AI candidates survive play-all and repeat without another request or charge attempt', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  const panel = await openExpression(page, touch, true);
  const candidates = ['我想喝水。', '请给我一杯水。', '我需要喝水。'];
  const requests = [];
  await page.route('**/api/gpt/communication/sentences', route => {
    requests.push({
      body: route.request().postDataJSON(),
      headers: route.request().headers()
    });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates, provider: 'synthetic-ui-fixture' })
    });
  });
  await activate(
    panel.getByRole('button', { name: '生成三个候选句', exact: true }),
    touch
  );
  await expect(panel.locator(candidateSelector)).toHaveText(candidates);
  await clearSpeech(page);
  await activate(panel.getByRole('button', { name: '立即全部播报' }), touch);
  await expect.poll(() => readSpeech(page)).toEqual(candidates);
  await expect(panel.locator(candidateSelector)).toHaveText(candidates);
  await clearSpeech(page);
  await activate(
    panel.getByRole('button', { name: '全部重播', exact: true }),
    touch
  );
  await expect.poll(() => readSpeech(page)).toEqual(candidates);
  await activate(panel.locator(candidateSelector).nth(1), touch);
  await expect(panel.locator(candidateSelector).nth(1)).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].body.candidateCount).toBe(3);
  expect(requests[0].headers['idempotency-key']).toBeTruthy();
  await page.screenshot({
    path: info.outputPath('ai-expression-three.png'),
    fullPage: true
  });
});

test('a disconnected AI request retains three local choices and play-all never retries AI', async ({
  page
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  const panel = await openExpression(page, touch, true);
  const before = await panel.locator(candidateSelector).allTextContents();
  let requests = 0;
  await page.route('**/api/gpt/communication/sentences', route => {
    requests += 1;
    return route.abort('internetdisconnected');
  });
  await activate(
    panel.getByRole('button', { name: '生成三个候选句', exact: true }),
    touch
  );
  await expect(
    panel.getByRole('button', { name: '生成三个候选句', exact: true })
  ).toBeEnabled();
  await expect(panel.locator(candidateSelector)).toHaveText(before);
  await clearSpeech(page);
  await activate(panel.getByRole('button', { name: '立即全部播报' }), touch);
  await expect.poll(() => readSpeech(page)).toEqual(before);
  expect(requests).toBe(1);
});
