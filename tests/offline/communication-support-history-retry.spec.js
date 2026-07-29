import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour
} from './helpers/communicationSupport';

const HISTORY_KEY = 'cboard_communication_history';

test.describe('Production expression history recovery', () => {
  test('keeps the expression retryable when the first history write fails', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await page.addInitScript(historyKey => {
      const nativeSetItem = Storage.prototype.setItem;
      window.__failNextCommunicationHistoryWrite = false;
      Storage.prototype.setItem = function setItem(key, value) {
        if (
          this === window.localStorage &&
          key === historyKey &&
          window.__failNextCommunicationHistoryWrite
        ) {
          window.__failNextCommunicationHistoryWrite = false;
          throw new DOMException(
            'Simulated storage quota failure',
            'QuotaExceededError'
          );
        }
        return nativeSetItem.call(this, key, value);
      };
    }, HISTORY_KEY);
    await blockRemoteHttpRequests(page);
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);

    const tiles = page.locator('button.Tile:visible');
    await expect(tiles.first()).toBeVisible();
    expect(await tiles.count()).toBeGreaterThanOrEqual(2);
    await activate(tiles.nth(0), useTouch);
    await activate(tiles.nth(1), useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '患者表达' }), useTouch);
    await completeCommunicationOnboarding(page, useTouch);
    const currentOutput = panel.getByText(/^当前输出：/);
    await expect(currentOutput).not.toHaveText('当前输出：');
    await activate(panel.getByRole('button', { name: '生成并播报' }), useTouch);
    await expect(
      panel.locator('.CommunicationSupportPanel__candidate').first()
    ).toBeVisible();
    await activate(panel.getByRole('button', { name: '停止播报' }), useTouch);

    const outputBeforeFailure = await currentOutput.textContent();
    const candidates = panel.locator(
      '.CommunicationSupportPanel__candidateRow'
    );
    const candidateCount = await candidates.count();
    const candidateTextBeforeFailure = await candidates.allTextContents();
    expect(candidateCount).toBeGreaterThan(0);
    await page.evaluate(() => {
      window.__failNextCommunicationHistoryWrite = true;
    });

    await activate(panel.getByRole('button', { name: '确认此句' }), useTouch);
    await expect(panel).toContainText(
      '表达未能保存，图片和候选句已保留，请重试。'
    );
    await expect(panel.getByRole('button', { name: '确认此句' })).toBeEnabled();
    await expect(currentOutput).toHaveText(outputBeforeFailure);
    await expect(candidates).toHaveCount(candidateCount);
    expect(await candidates.allTextContents()).toEqual(
      candidateTextBeforeFailure
    );
    expect(
      await page.evaluate(
        historyKey => JSON.parse(localStorage.getItem(historyKey) || '[]'),
        HISTORY_KEY
      )
    ).toEqual([]);

    await activate(panel.getByRole('button', { name: '确认此句' }), useTouch);
    await expect(panel.getByRole('button', { name: '已确认' })).toBeDisabled();
    const history = await page.evaluate(
      historyKey => JSON.parse(localStorage.getItem(historyKey) || '[]'),
      HISTORY_KEY
    );
    expect(history).toEqual([
      expect.objectContaining({
        direction: 'express',
        output: expect.arrayContaining([
          expect.objectContaining({ id: expect.any(String) })
        ]),
        recordStatus: 'confirmed'
      })
    ]);
  });
});
