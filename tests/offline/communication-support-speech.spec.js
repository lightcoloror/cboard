import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour,
  installBrowserSpeechHarness
} from './helpers/communicationSupport';

test.describe('Production communication speech feedback', () => {
  test('uses real audio samples for the meter and keeps recognized text editable', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await installBrowserSpeechHarness(page);
    await blockRemoteHttpRequests(page);
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '接收理解' }), useTouch);
    await completeCommunicationOnboarding(page, useTouch);
    const receiverWorkspace = page.getByRole('dialog', {
      name: '接收理解'
    });
    const receiverInput = receiverWorkspace.getByRole('textbox', {
      name: '例如：想喝水、想要苹果、头疼'
    });

    await activate(
      receiverWorkspace.getByRole('button', { name: '语音输入' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByRole('button', { name: '停止录音' })
    ).toBeVisible();
    const audioMeter = receiverWorkspace.getByRole('meter', {
      name: '实时麦克风音量'
    });
    await expect(audioMeter).toHaveAttribute('aria-valuenow', '0');
    await expect(receiverWorkspace).toContainText('音量只在本机计算，不保存');

    await page.evaluate(() => {
      window.__cboardSpeechHarness.audioMode = 'speaking';
    });
    await expect
      .poll(async () => Number(await audioMeter.getAttribute('aria-valuenow')))
      .toBeGreaterThan(0);

    await page.evaluate(() => {
      window.__cboardSpeechHarness.audioMode = 'silent';
    });
    await expect
      .poll(async () => Number(await audioMeter.getAttribute('aria-valuenow')))
      .toBe(0);

    await page.evaluate(() => {
      window.__cboardSpeechHarness.emitFinal('想喝水');
    });
    await expect(receiverInput).toHaveValue('想喝水');
    await expect(audioMeter).toBeHidden();
    await expect(
      receiverWorkspace.getByRole('button', { name: '语音输入' })
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          contextCloseCount: window.__cboardSpeechHarness.contextCloseCount,
          trackStopCount: window.__cboardSpeechHarness.trackStopCount
        }))
      )
      .toEqual({ contextCloseCount: 1, trackStopCount: 1 });

    await receiverInput.fill('想要苹果');
    await expect(receiverInput).toHaveValue('想要苹果');
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByRole('status').filter({ hasText: '匹配结果' })
    ).toContainText('已全部匹配');
  });
});
