import { expect, test } from '@playwright/test';
import { persistAuthenticatedUser } from './helpers/authentication';
import {
  activate,
  blockRemoteHttpRequests,
  dismissBoardTour
} from './helpers/communicationSupport';

const AUTH_TOKEN = 'playwright-background-removal-token';
const TILE_LABEL = '去背景水杯';
const ORIGINAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const PROCESSED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZSmQAAAAASUVORK5CYII=',
  'base64'
);

test.use({ bypassCSP: true, serviceWorkers: 'block' });

async function installAuthenticatedApiHarness(page) {
  const backgroundRequests = [];
  const mediaUploads = [];

  await page.route('**/gpt/communication/background-removal', async route => {
    const request = route.request();
    const body = request.postDataBuffer();
    backgroundRequests.push({
      authorization: request.headers().authorization,
      body: body ? body.toString('latin1') : ''
    });

    if (backgroundRequests.length === 1) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 'BACKGROUND_REMOVAL_UNAVAILABLE' }),
        status: 503
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        imageBase64: PROCESSED_PNG.toString('base64'),
        mimeType: 'image/png',
        width: 1,
        height: 1,
        provider: 'rembg',
        sourceStored: false,
        originalRetained: true
      }),
      status: 200
    });
  });

  await page.route('**/media', async route => {
    const request = route.request();
    const body = request.postDataBuffer();
    mediaUploads.push({
      authorization: request.headers().authorization,
      body: body ? body.toString('latin1') : ''
    });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        url: 'https://api.example.test/media/e2e-background-removed.png'
      }),
      status: 200
    });
  });

  await page.route('**/board', async route => {
    const requestBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...requestBody,
        id: '64f000000000000000000082'
      }),
      status: 200
    });
  });
  await page.route('**/communicator', async route => {
    const requestBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        communicator: {
          ...requestBody,
          id: '65f000000000000000000082'
        }
      }),
      status: 200
    });
  });

  return { backgroundRequests, mediaUploads };
}

async function acceptPrivacyConfirmation(page, action) {
  const confirmation = page.waitForEvent('dialog');
  const actionPromise = action();
  const dialog = await confirmation;
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toContain('CBoard API');
  expect(dialog.message()).toContain('不保存原图');
  expect(dialog.message()).toContain('供恢复');
  await dialog.accept();
  await actionPromise;
}

test.describe('Production tile background removal', () => {
  test('preserves the original, restores it, and saves the rembg candidate', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');
    const harness = await installAuthenticatedApiHarness(page);
    await blockRemoteHttpRequests(page.context());

    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await persistAuthenticatedUser(page, AUTH_TOKEN, {
      id: 'playwright-background-removal-user',
      email: 'background-removal@example.test',
      name: 'Background removal test',
      locale: 'zh-CN'
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);
    await expect(page.locator('.personal__account')).toBeVisible();

    const board = page.locator('.Board');
    const lockButton = page.locator('.open__lock button');
    for (let click = 0; click < 4; click += 1) {
      if (
        !(await board.evaluate(element =>
          element.classList.contains('is-locked')
        ))
      ) {
        break;
      }
      await activate(lockButton, useTouch);
      await page.waitForTimeout(100);
    }
    await expect(board).not.toHaveClass(/is-locked/);
    const premiumDialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: '您的免费试用已结束' });
    if (await premiumDialog.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(premiumDialog).toBeHidden();
    }
    await dismissBoardTour(page, useTouch);

    const addTileButton = page.locator('.add__board__tile button');
    await expect(addTileButton).toBeVisible();
    await activate(addTileButton, useTouch);

    const editor = page
      .locator('[role="dialog"]')
      .filter({ has: page.locator('#label') });
    await expect(editor).toBeVisible();
    await editor.locator('#label').fill(TILE_LABEL);
    await editor.locator('input.InputImage__input').setInputFiles({
      name: 'family-cup.png',
      mimeType: 'image/png',
      buffer: ORIGINAL_PNG
    });

    const removalButton = editor.getByRole('button', {
      name: '一键去除照片背景'
    });
    const removalStatus = editor.locator(
      '.TileEditor__background-removal-status'
    );
    await expect(removalButton).toBeVisible();
    const preview = editor.locator('.TileEditor__preview .Symbol__image');
    await expect(preview).toBeVisible();
    const originalPreviewUrl = await preview.getAttribute('src');
    expect(originalPreviewUrl).toMatch(/^blob:/);

    await acceptPrivacyConfirmation(page, () =>
      activate(removalButton, useTouch)
    );
    await expect(removalStatus).toContainText('背景移除暂时不可用');
    await expect(preview).toHaveAttribute('src', originalPreviewUrl);
    await expect(removalButton).toBeEnabled();

    await acceptPrivacyConfirmation(page, () =>
      activate(removalButton, useTouch)
    );
    await expect(removalStatus).toContainText('已切换为透明背景候选');
    const processedPreviewUrl = await preview.getAttribute('src');
    expect(processedPreviewUrl).toMatch(/^blob:/);
    expect(processedPreviewUrl).not.toBe(originalPreviewUrl);

    const restoreButton = editor.getByRole('button', { name: '恢复原图' });
    await activate(restoreButton, useTouch);
    await expect(removalStatus).toContainText('已恢复原图');
    await expect(preview).toHaveAttribute('src', originalPreviewUrl);

    await acceptPrivacyConfirmation(page, () =>
      activate(removalButton, useTouch)
    );
    await expect(removalStatus).toContainText('已切换为透明背景候选');
    await activate(editor.locator('#save-button'), useTouch);

    await expect.poll(() => harness.mediaUploads.length).toBe(1);
    expect(harness.mediaUploads[0].authorization).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(harness.mediaUploads[0].body).toContain(
      'filename="pictogram-no-background.png"'
    );
    await expect(page.getByText(TILE_LABEL, { exact: true })).toBeVisible();

    expect(harness.backgroundRequests).toHaveLength(3);
    for (const request of harness.backgroundRequests) {
      expect(request.authorization).toBe(`Bearer ${AUTH_TOKEN}`);
      expect(request.body).toContain('name="image"');
    }
  });
});
