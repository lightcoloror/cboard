import { expect, test } from '@playwright/test';
import fixture from '../../src/common/communicationSupport/fixtures/builtin15Reuse.json';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour,
  waitForProductionServiceWorker
} from './helpers/communicationSupport';

test('bundled pictures and receiver matching work after a real offline reload', async ({
  page,
  context
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  await blockRemoteHttpRequests(context);
  await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
  await waitForProductionServiceWorker(page);
  // Do not warm individual image URLs: the production worker must precache them.
  for (const card of fixture.cards) {
    // sw-precache stores revision hashes in a query parameter.
    expect(
      await page.evaluate(
        async image =>
          Boolean(
            await caches.match(`/symbols/mulberry/${image}`, {
              ignoreSearch: true
            })
          ),
        card.image
      ),
      card.image
    ).toBe(true);
  }
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissBoardTour(page, touch);
  await activate(
    page
      .locator('.CommunicationSupportPanel')
      .getByRole('button', { name: '接收理解' }),
    touch
  );
  await completeCommunicationOnboarding(page, touch);
  const workspace = page.getByRole('dialog', { name: '接收理解' });
  const input = workspace.getByRole('textbox', {
    name: '例如：想喝水、想要苹果、头疼'
  });
  for (const card of fixture.cards)
    for (const token of card.tokens) {
      await input.fill(token);
      await activate(
        workspace.getByRole('button', { name: '生成图片序列' }),
        touch
      );
      await expect(
        workspace.getByRole('textbox', { name: '分词结果（可修改）' })
      ).toHaveValue(token);
      await expect(
        workspace.getByRole('status').filter({ hasText: '图片匹配' })
      ).toContainText('已全部配图');
      const renderedPicture = workspace
        .locator('.CommunicationSupportPanel__matchRow img')
        .first();
      await expect(renderedPicture).toHaveAttribute(
        'src',
        `/symbols/mulberry/${card.image}`
      );
      await expect
        .poll(() =>
          renderedPicture.evaluate(
            image => image.complete && image.naturalWidth > 0
          )
        )
        .toBe(true);
      const cached = await page.evaluate(async image => {
        const response = await fetch(`/symbols/mulberry/${image}`);
        const text = await response.text();
        const picture = new Image();
        picture.src = `/symbols/mulberry/${image}`;
        await picture.decode();
        return {
          status: response.status,
          svg: text.includes('<svg'),
          width: picture.naturalWidth
        };
      }, card.image);
      expect(cached.status).toBe(200);
      expect(cached.svg).toBe(true);
      expect(cached.width).toBeGreaterThan(0);
    }
  await workspace
    .locator('.CommunicationSupportPanel__matchRow')
    .first()
    .screenshot({ path: info.outputPath('offline-receiver.png') });
});
