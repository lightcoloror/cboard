import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour
} from './helpers/communicationSupport';

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function readMissingTokens(page) {
  return page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('cboard_communication_missing_tokens') || '[]'
    )
  );
}

test.describe('Production missing-token maintenance', () => {
  test.use({ bypassCSP: true, serviceWorkers: 'block' });

  test('confirms an attributed online pictogram and reuses it after reload', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');
    const searchRequests = [];

    await page.route('**/pictograms/search', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      searchRequests.push({ body, url: route.request().url() });
      const results = (body.tokens || []).map((token, index) => ({
        token,
        pictogram: {
          id: `runtime-e2e-${index}`,
          imageUrl: `/pictograms/arasaac/${9000 + index}/image`,
          label: token,
          source: {
            provider: 'arasaac',
            originalId: String(9000 + index),
            name: 'ARASAAC',
            license: 'CC BY-NC-SA 4.0',
            sourceUrl: `https://arasaac.org/pictograms/${9000 + index}`
          }
        }
      }));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ results }),
        status: 200
      });
    });
    await page.route('**/pictograms/arasaac/*/image', route =>
      route.fulfill({ body: PIXEL_PNG, contentType: 'image/png', status: 200 })
    );
    await blockRemoteHttpRequests(page.context());
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '接收理解' }), useTouch);
    await completeCommunicationOnboarding(page, useTouch);
    let receiverWorkspace = page.getByRole('dialog', {
      name: '接收理解'
    });
    let receiverInput = receiverWorkspace.getByRole('textbox', {
      name: '例如：想喝水、想要苹果、头疼'
    });
    const unknownSentence = '量子海狸';

    await receiverInput.fill(unknownSentence);
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    const initialMissingTokens = await expect
      .poll(() => readMissingTokens(page))
      .not.toEqual([])
      .then(() => readMissingTokens(page));
    const pendingRecords = initialMissingTokens.filter(
      record => record.status === 'new'
    );
    expect(pendingRecords.length).toBeGreaterThan(0);
    const pendingRecord = pendingRecords[0];

    const missingQueue = receiverWorkspace
      .locator('.CommunicationSupportPanel__missingQueue')
      .filter({ hasText: '缺图维护' });
    let missingRow = missingQueue
      .locator('.CommunicationSupportPanel__missingQueueItem')
      .filter({
        has: page.getByText(pendingRecord.normalizedToken, { exact: true })
      })
      .first();
    await expect(missingRow).toContainText('待处理');
    await activate(missingRow.getByRole('button', { name: '忽略' }), useTouch);
    await expect(missingRow).toContainText('已忽略');
    await activate(
      missingRow.getByRole('button', { name: '恢复待处理' }),
      useTouch
    );
    await expect(missingRow).toContainText('待处理');

    await activate(
      missingQueue.getByRole('button', { name: '在线搜索缺图' }),
      useTouch
    );
    await expect.poll(() => searchRequests.length).toBe(1);
    expect(searchRequests[0].body.tokens).toEqual(
      expect.arrayContaining(
        pendingRecords.map(record => record.normalizedToken)
      )
    );
    await expect(missingQueue).toContainText(
      '在线搜索完成，请确认建议后再使用。'
    );
    for (const record of pendingRecords) {
      missingRow = missingQueue
        .locator('.CommunicationSupportPanel__missingQueueItem')
        .filter({
          has: page.getByText(record.normalizedToken, { exact: true })
        })
        .first();
      await expect(missingRow).toContainText('ARASAAC');
      await expect(missingRow).toContainText('CC BY-NC-SA 4.0');
      await activate(
        missingRow.getByRole('button', { name: '确认使用' }),
        useTouch
      );
      await expect(missingRow).toContainText('已解决');
    }
    await expect(missingQueue).toContainText(
      '维护结果已保存，下次生成会使用新规则。'
    );

    const resolvedTokens = await readMissingTokens(page);
    expect(resolvedTokens).toEqual(
      expect.arrayContaining([
        ...pendingRecords.map(record =>
          expect.objectContaining({
            id: record.id,
            resolvedPictogram: expect.objectContaining({
              source: expect.objectContaining({
                license: 'CC BY-NC-SA 4.0',
                provider: 'arasaac'
              })
            }),
            source: 'online',
            status: 'resolved'
          })
        )
      ])
    );

    await receiverInput.fill(unknownSentence);
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByRole('status').filter({ hasText: '匹配结果' })
    ).toContainText('已全部匹配');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const restoredPanel = page.locator('.CommunicationSupportPanel');
    await activate(
      restoredPanel.getByRole('button', { name: '接收理解' }),
      useTouch
    );
    receiverWorkspace = page.getByRole('dialog', { name: '接收理解' });
    receiverInput = receiverWorkspace.getByRole('textbox', {
      name: '例如：想喝水、想要苹果、头疼'
    });
    await receiverInput.fill(unknownSentence);
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByRole('status').filter({ hasText: '匹配结果' })
    ).toContainText('已全部匹配');
    await expect(
      receiverWorkspace
        .locator('.CommunicationSupportPanel__resultMeta')
        .filter({ hasText: pendingRecord.normalizedToken })
    ).toBeVisible();
  });
});
