import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour,
  installBrowserShareHarness
} from './helpers/communicationSupport';

test.describe('Production communication sharing', () => {
  test('shares the selected sentence and receiver PNG without changing the conversation', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await installBrowserShareHarness(page);
    await blockRemoteHttpRequests(page);
    await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);

    const tiles = page.locator('button.Tile:visible');
    await expect(tiles.first()).toBeVisible();
    await activate(tiles.nth(0), useTouch);
    await activate(tiles.nth(1), useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '患者表达' }), useTouch);
    await completeCommunicationOnboarding(page, useTouch);
    const currentOutput = panel.getByText(/^当前输出：/);
    const outputBeforeShare = await currentOutput.textContent();
    await activate(panel.getByRole('button', { name: '生成并播报' }), useTouch);
    await expect(
      panel.locator('.CommunicationSupportPanel__candidate').first()
    ).toBeVisible();
    await activate(panel.getByRole('button', { name: '停止播报' }), useTouch);
    await activate(panel.getByRole('button', { name: '分享此句' }), useTouch);
    await expect(panel).toContainText('分享面板已打开。');
    await expect(currentOutput).toHaveText(outputBeforeShare);
    await expect(
      panel.locator('.CommunicationSupportPanel__candidate').first()
    ).toBeVisible();

    const expressionShare = await page.evaluate(
      () => window.__cboardShareHarness.calls[0]
    );
    expect(expressionShare).toEqual(
      expect.objectContaining({
        files: [],
        text: expect.any(String),
        title: '图语家表达'
      })
    );
    expect(expressionShare.text.length).toBeGreaterThan(0);

    await activate(panel.getByRole('button', { name: '接收理解' }), useTouch);
    const receiverWorkspace = page.getByRole('dialog', {
      name: '接收理解'
    });
    const receiverInput = receiverWorkspace.getByRole('textbox', {
      name: '例如：想喝水、想要苹果、头疼'
    });
    await receiverInput.fill('想喝水');
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByRole('status').filter({ hasText: '匹配结果' })
    ).toContainText('已全部匹配');
    const sequenceBeforeShare = await receiverWorkspace
      .locator('.CommunicationSupportPanel__resultMeta')
      .textContent();
    await activate(
      receiverWorkspace.getByRole('button', { name: '全屏展示' }),
      useTouch
    );
    const display = page
      .getByRole('dialog')
      .filter({ hasText: '接收端全屏展示' });
    await expect(display).toBeVisible();
    await activate(
      display.getByRole('button', { name: '分享图片序列' }),
      useTouch
    );
    await expect(display).toContainText('图片分享面板已打开。');
    await expect(display).toBeVisible();

    const receiverShare = await page.evaluate(
      () => window.__cboardShareHarness.calls[1]
    );
    expect(receiverShare).toEqual(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            name: '图语家接收图片.png',
            type: 'image/png'
          })
        ],
        text: '',
        title: '图语家接收图片'
      })
    );
    expect(receiverShare.files[0].size).toBeGreaterThan(0);

    await activate(display.getByRole('button').first(), useTouch);
    await expect(receiverWorkspace).toBeVisible();
    await expect(receiverInput).toHaveValue('想喝水');
    await expect(
      receiverWorkspace.locator('.CommunicationSupportPanel__resultMeta')
    ).toHaveText(sequenceBeforeShare);
  });
});
