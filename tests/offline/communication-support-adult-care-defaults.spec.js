import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour,
  waitForProductionServiceWorker
} from './helpers/communicationSupport';

const HOME_DIRECT_LABELS = [
  '要',
  '不要',
  '帮帮我',
  '停止',
  '再说一次',
  '我痛',
  '我不舒服',
  '我要喝水',
  '我想上厕所',
  '请叫医生',
  '请叫家人'
];

function tileByLabel(page, label) {
  return page.locator('button.Tile:visible').filter({
    has: page.locator('.Symbol__label', {
      hasText: new RegExp(`^${label}$`)
    })
  });
}

test.describe('Production offline - adult-care default boards', () => {
  test('uses the shared CBoard boards for patient navigation and safe receiving', async ({
    context,
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await blockRemoteHttpRequests(page);
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await waitForProductionServiceWorker(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);

    const homeTiles = page.locator('button.Tile:visible');
    await expect(homeTiles).toHaveCount(42);
    for (const label of HOME_DIRECT_LABELS) {
      await expect(tileByLabel(page, label)).toHaveCount(1);
    }

    await activate(tileByLabel(page, '核心词'), useTouch);
    await page.waitForURL(/\/board\/pi-core-words-v1$/);
    await expect(page.locator('button.Tile:visible')).toHaveCount(15);
    for (const label of ['我', '你', '要', '不', '去', '说', '为什么']) {
      await expect(tileByLabel(page, label)).toHaveCount(1);
    }

    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);
    await activate(tileByLabel(page, '修正澄清'), useTouch);
    await page.waitForURL(/\/board\/pi-repair-v1$/);
    await expect(page.locator('button.Tile:visible')).toHaveCount(9);
    for (const label of [
      '不对',
      '不是这个',
      '再说一次',
      '说慢一点',
      '我说不出话'
    ]) {
      await expect(tileByLabel(page, label)).toHaveCount(1);
    }

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '接收理解' }), useTouch);
    await completeCommunicationOnboarding(page, useTouch);
    const receiverWorkspace = page.getByRole('dialog', {
      name: '接收理解'
    });
    const receiverInput = receiverWorkspace.getByRole('textbox', {
      name: '例如：想喝水、想要苹果、头疼'
    });

    await receiverInput.fill('要不要叫医生');
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    const previewSymbols = receiverWorkspace.locator(
      '.CommunicationSupportPanel__symbol--preview'
    );
    await expect(previewSymbols).toHaveCount(1);
    await expect(receiverWorkspace).toContainText('请叫医生');
    const matchedRows = receiverWorkspace
      .locator('.CommunicationSupportPanel__matchRow')
      .filter({
        has: page.locator('.CommunicationSupportPanel__status--ok')
      });
    await expect(matchedRows).toHaveCount(1);
    const doctorRow = receiverWorkspace
      .locator('.CommunicationSupportPanel__matchRow')
      .filter({ hasText: '叫医生' });
    await expect(doctorRow).toContainText('请叫医生');
    await expect(matchedRows).toContainText('叫医生');

    await receiverInput.fill('叫医生');
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByRole('status').filter({ hasText: '匹配结果' })
    ).toContainText('已全部匹配');
    await activate(
      receiverWorkspace.getByRole('button', { name: '全屏展示' }),
      useTouch
    );
    const display = page
      .getByRole('dialog')
      .filter({ hasText: '接收端全屏展示' });
    await expect(display).toContainText('请叫医生');
    await expect(display).toContainText('ARASAAC');
    await expect(display).toContainText('CC BY-NC-SA 4.0');
  });
});
