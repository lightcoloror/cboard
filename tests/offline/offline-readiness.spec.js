import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour
} from './helpers/communicationSupport';

test('first visit reports ready only after takeover, then closes and reopens offline without an online reload', async ({
  page,
  context
}, info) => {
  const touch = info.project.name.startsWith('mobile-');
  await blockRemoteHttpRequests(context);
  let allowWorker;
  const gate = new Promise(resolve => {
    allowWorker = resolve;
  });
  // Hold the existing localhost script validation, not product storage/state.
  await context.route('**/service-worker.js', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/board/root', { waitUntil: 'load' });
  await dismissBoardTour(page, touch);
  const status = page.locator('.App__offlineStatus');
  await expect(status).toHaveAttribute('data-offline-status', 'preparing');
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller === null)
  ).toBe(true);
  await status.screenshot({ path: info.outputPath('preparing.png') });
  allowWorker();
  await expect(status).toHaveAttribute('data-offline-status', 'ready', {
    timeout: 90000
  });
  const takeover = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      active: registration.active.state,
      controlled: registration.active === navigator.serviceWorker.controller
    };
  });
  expect(takeover).toEqual({ active: 'activated', controlled: true });
  await expect(
    page.getByText('内容已被缓存以供离线使用。', { exact: true })
  ).toBeHidden({ timeout: 10000 });
  expect(
    await status.evaluate(node => {
      const content = document
        .querySelector('.App__content')
        .getBoundingClientRect();
      const banner = node.getBoundingClientRect();
      const footer = document
        .querySelector('.App__filing')
        .getBoundingClientRect();
      return (
        content.bottom <= banner.top + 1 &&
        banner.bottom <= footer.top + 1 &&
        footer.bottom <= innerHeight + 1
      );
    })
  ).toBe(true);
  // No reload occurs before this first offline transition.
  await page.screenshot({ path: info.outputPath('ready.png') });
  const keeper = await context.newPage();
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/board/root', { waitUntil: 'domcontentloaded' });
  await expect(reopened.locator('.App__offlineStatus')).toHaveAttribute(
    'data-offline-status',
    'ready'
  );
  expect(
    await reopened.evaluate(() =>
      fetch('/not-pre-cached-network-proof').then(() => false, () => true)
    )
  ).toBe(true);
  await dismissBoardTour(reopened, touch);
  await expect
    .poll(() =>
      reopened
        .locator('.App__policeFiling img')
        .evaluate(img => img.complete && img.naturalWidth > 0)
    )
    .toBe(true);
  await activate(
    reopened.getByRole('button', { name: '接收理解', exact: true }),
    touch
  );
  await completeCommunicationOnboarding(reopened, touch);
  const receiver = reopened.getByRole('dialog', { name: '接收理解' });
  const input = receiver.getByRole('textbox', {
    name: '例如：想喝水、想要苹果、头疼'
  });
  await input.fill('我今晚不回家吃饭');
  await activate(
    receiver.getByRole('button', { name: '生成图片序列', exact: true }),
    touch
  );
  await expect(
    receiver.getByRole('textbox', { name: '分词结果（可修改）' })
  ).toHaveValue('我 / 今晚 / 不 / 回家 / 吃饭');
  for (const [text, file] of [
    ['洗手液', 'liquid_soap.svg'],
    ['肥皂块', 'soap.svg']
  ]) {
    await input.fill(text);
    await activate(
      receiver.getByRole('button', { name: '生成图片序列', exact: true }),
      touch
    );
    await expect(
      receiver.getByRole('textbox', { name: '分词结果（可修改）' })
    ).toHaveValue(text);
    const picture = receiver
      .locator('.CommunicationSupportPanel__matchRow img')
      .first();
    await expect(picture).toHaveAttribute('src', `/symbols/mulberry/${file}`);
    await expect
      .poll(() => picture.evaluate(img => img.complete && img.naturalWidth > 0))
      .toBe(true);
  }
  await reopened.screenshot({ path: info.outputPath('offline-receiver.png') });
  await keeper.close();
});

test('a failed first worker check reports unavailable offline preparation', async ({
  page,
  context
}) => {
  await blockRemoteHttpRequests(context);
  await context.route('**/service-worker.js', route =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'Synthetic worker failure'
    })
  );
  await page.goto('/board/root', { waitUntil: 'load' });
  await expect(page.locator('.App__offlineStatus')).toHaveAttribute(
    'data-offline-status',
    'error'
  );
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller === null)
  ).toBe(true);
  await expect(page.locator('.App__offlineStatus')).toContainText('未就绪');
});
