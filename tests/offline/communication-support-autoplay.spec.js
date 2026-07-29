import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  dismissBoardTour,
  installBrowserTtsHarness
} from './helpers/communicationSupport';

const PREFERENCES_KEY = 'cboard_communication_preferences';

async function readTtsCalls(page) {
  return page.evaluate(() => window.__cboardTtsHarness.calls.slice());
}

test.describe('Production candidate autoplay', () => {
  test('cancels on patient input, replays after inactivity, and respects off', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await page.addInitScript(preferencesKey => {
      localStorage.setItem(
        preferencesKey,
        JSON.stringify({
          candidateAutoplayDelaySeconds: 5,
          onboardingComplete: true
        })
      );
    }, PREFERENCES_KEY);
    await installBrowserTtsHarness(page);
    await blockRemoteHttpRequests(page);
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);

    const tiles = page.locator('button.Tile:visible');
    expect(await tiles.count()).toBeGreaterThanOrEqual(2);
    await activate(tiles.nth(0), useTouch);
    await activate(tiles.nth(1), useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '患者表达' }), useTouch);
    await expect(
      page.getByRole('dialog', { name: '双向沟通 · 第一次使用' })
    ).toHaveCount(0);
    await expect(panel).toContainText(
      '5 秒无操作后自动播报；触摸或滚动可取消。'
    );

    let candidateButtons = panel.locator(
      'button.CommunicationSupportPanel__candidate'
    );
    await expect(candidateButtons.first()).toBeVisible();
    await page.evaluate(() => {
      window.__cboardTtsHarness.calls.length = 0;
    });
    await activate(candidateButtons.first(), useTouch);
    await expect.poll(() => readTtsCalls(page)).toHaveLength(1);
    const manualCalls = await readTtsCalls(page);
    expect(manualCalls[0].text).toBe(
      (await candidateButtons.first().textContent()).trim()
    );
    await page.waitForTimeout(5500);
    expect(await readTtsCalls(page)).toHaveLength(1);

    let moveRight = panel
      .locator('button[data-patient-action="move-right"]:enabled')
      .first();
    await expect(moveRight).toBeVisible();
    await activate(moveRight, useTouch);
    candidateButtons = panel.locator(
      'button.CommunicationSupportPanel__candidate'
    );
    const expectedAutoplaySentences = (await candidateButtons.allTextContents()).map(
      sentence => sentence.trim()
    );
    await expect
      .poll(async () => (await readTtsCalls(page)).length, { timeout: 8000 })
      .toBe(1 + expectedAutoplaySentences.length);
    const autoplayCalls = (await readTtsCalls(page)).slice(1);
    expect(autoplayCalls.map(call => call.text)).toEqual(
      expectedAutoplaySentences
    );
    await expect(panel.getByRole('button', { name: '重播' })).toBeVisible();

    await activate(panel.getByRole('button', { name: '照护工具' }), useTouch);
    await activate(
      panel.getByRole('button', { name: '显示与易用性' }),
      useTouch
    );
    const accessibilityDialog = page.getByRole('dialog', {
      name: '显示与易用性'
    });
    await activate(
      accessibilityDialog.getByRole('button', { name: '关闭', exact: true }),
      useTouch
    );
    await expect
      .poll(() =>
        page.evaluate(preferencesKey => {
          const preferences = JSON.parse(
            localStorage.getItem(preferencesKey) || '{}'
          );
          return preferences.candidateAutoplayDelaySeconds;
        }, PREFERENCES_KEY)
      )
      .toBe(0);
    await activate(
      accessibilityDialog.getByRole('button', { name: '返回沟通' }),
      useTouch
    );
    await expect(panel).toContainText(
      '自动播报已关闭，可手动选择一句或全部播报。'
    );

    const callCountBeforeDisabledOutput = (await readTtsCalls(page)).length;
    moveRight = panel
      .locator('button[data-patient-action="move-right"]:enabled')
      .first();
    await expect(moveRight).toBeVisible();
    await activate(moveRight, useTouch);
    await page.waitForTimeout(5500);
    expect(await readTtsCalls(page)).toHaveLength(
      callCountBeforeDisabledOutput
    );
  });
});
