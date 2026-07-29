import { test, expect } from '@playwright/test';
import { createCboard } from '../page-objects/cboard.js';

const runtimeUser = {
  email: process.env.LOCAL_RUNTIME_USER_EMAIL || 'local.runtime@example.com',
  password: process.env.LOCAL_RUNTIME_USER_PASSWORD || 'ChangeMe123!'
};

const importedPayload = {
  savedPhrases: [
    {
      sentence: 'Need water now',
      output: [{ id: 'saved-water', label: 'water', image: '' }]
    }
  ],
  history: [
    {
      direction: 'receive',
      inputText: 'Need water now',
      labels: ['water'],
      createdAt: '2026-01-02T00:00:00.000Z'
    }
  ]
};

test.describe('Local runtime - communication support', () => {
  test('persists communication support settings and shows history on board', async ({
    page
  }) => {
    const cboard = createCboard(page);

    await cboard.gotoLoginSignup();
    await cboard.attemptLogin(runtimeUser.email, runtimeUser.password);
    await page.waitForURL(url => !url.pathname.includes('/login-signup'));

    await page.goto('/settings/communication-support');
    await expect(
      page.getByRole('heading', { name: 'Communication Support' })
    ).toBeVisible();

    await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Upload local to cloud' })
    ).toBeEnabled();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'communication-support.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importedPayload, null, 2))
    });

    await expect(
      page.getByText(
        'Communication support data was imported and merged locally.'
      )
    ).toBeVisible();

    await page.getByRole('button', { name: 'Upload local to cloud' }).click();
    await expect(
      page.getByText(
        'Local communication support data was uploaded to your account.'
      )
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText('Saved phrases')).toBeVisible();
    await expect(page.getByText('Receiver history')).toBeVisible();
    await expect(page.getByText('Items: 1').first()).toBeVisible();

    await page.goto('/board/root');
    await expect(page.getByText('最近历史')).toBeVisible();
    await expect(page.getByText('Need water now').first()).toBeVisible();
    await expect(page.getByText('接收 · water')).toBeVisible();
  });
});
