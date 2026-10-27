import { test, expect } from '@playwright/test';
import { blockRemoteHttpRequests, completeCommunicationOnboarding, dismissBoardTour,
  installBrowserTtsHarness, openCaregiverTools, openPatientExpression } from './helpers/communicationSupport';

const baseline = process.env.LAYOUT_BASELINE === '1';
const sizes = baseline ? [[2560, 1229]] : [
  [2560, 1229], [1440, 900], [1024, 768], [768, 1024], [375, 812], [851, 393]
];

for (const [width, height] of sizes) for (const font of baseline ? ['normal'] : ['normal', 'extra-large']) {
  test(`expression workspace ${width}x${height} ${font}`, async ({ page }, info) => {
    const requests = [], errors = [];
    page.on('request', request => {
      if (request.method() !== 'GET' || /\/api\//.test(request.url()))
        requests.push({ method: request.method(), url: request.url() });
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await blockRemoteHttpRequests(page);
    await installBrowserTtsHarness(page);
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, false);
    const panel = page.locator('.CommunicationSupportPanel');
    await panel.getByRole('button', { name: '接收理解', exact: true }).click();
    await completeCommunicationOnboarding(page, false);
    await page.getByRole('button', { name: '返回图板', exact: true }).click();
    // Use the real preference UI in the isolated profile; never touch user data.
    await openCaregiverTools(panel, false);
    await panel.getByRole('button', { name: '显示与易用性', exact: true }).click();
    const settings = page.getByRole('dialog', { name: '显示与易用性', exact: true });
    if (font === 'extra-large') await settings.getByRole('button', { name: '超大', exact: true }).click();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await settings.getByRole('button', { name: '返回沟通', exact: true }).click();
    await panel.getByRole('button', { name: '照护工具', exact: true }).click();
    const tile = label => page.locator('button.Tile').filter({ has: page.locator('.Symbol__label', { hasText: new RegExp(`^${label}$`) }) });
    await tile('我要喝水').click();
    await tile('不要').click();
    await openPatientExpression(panel, false);
    const content = page.locator('#communication-expression-panel .CommunicationSupportPanel__content');
    const sections = content.locator(':scope > .CommunicationSupportPanel__section');
    await expect(sections).toHaveCount(2);
    await expect(content.locator('#expression-draft-save-status')).toContainText('已保存到本机');
    const output = () => page.locator('.Board__output .Symbol__label').allTextContents();
    const original = await output();
    await page.locator('.Board__communicationSupport').evaluate(node => { node.scrollTop = 0; });
    const metrics = await page.evaluate(() => {
      const box = selector => {
        const node = document.querySelector(selector), rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
      };
      const root = '#communication-expression-panel .CommunicationSupportPanel__content';
      return { viewport: { width: innerWidth, height: innerHeight }, panel: box('.Board__communicationSupport'),
        grid: box('.Board__tiles'), content: box(root),
        sections: [...document.querySelector(root).querySelectorAll(':scope > .CommunicationSupportPanel__section')].map(node => {
          const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
        }), pageWidth: document.documentElement.scrollWidth };
    });
    await info.attach('layout-metrics', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('expanded.png'), fullPage: true });
    if (!baseline) {
      expect(metrics.content.scrollWidth).toBeLessThanOrEqual(metrics.content.clientWidth + 1);
      expect(metrics.pageWidth).toBeLessThanOrEqual(width + 1);
      expect(metrics.panel.height).toBeLessThanOrEqual(height * 0.43);
      const navbar = await page.locator('.Board__navbar').boundingBox();
      const title = await page.locator('.Navbar__title').boundingBox();
      expect(title.y).toBeGreaterThanOrEqual(navbar.y);
      expect(title.y + title.height).toBeLessThanOrEqual(navbar.y + navbar.height + 1);
      if (width >= 900) {
        const [left, right] = metrics.sections;
        expect(right.x + right.width).toBeGreaterThan(metrics.content.x + metrics.content.width - 2);
        expect(left.width + right.width).toBeGreaterThan(metrics.content.width * 0.96);
        expect(Math.abs(left.y - right.y)).toBeLessThan(2);
      } else expect(metrics.sections[1].y).toBeGreaterThan(metrics.sections[0].y);
      if (width >= 1440) {
        const editor = await content.locator('.CommunicationSupportPanel__expressionEditor').boundingBox();
        const candidates = await content.locator('.CommunicationSupportPanel__expressionCandidates').boundingBox();
        expect(candidates.x).toBeGreaterThan(editor.x + editor.width);
      }
    }
    // Every action must remain reachable, including the content below the panel cap.
    for (const name of ['生成三个候选句', '立即全部播报', '停止播报']) {
      const button = content.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      const b = await button.boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await content.getByRole('button', { name: '停止播报', exact: true }).click();
    await panel.locator('button[data-patient-action="express"]').click();
    await expect(content).toBeHidden();
    const collapsed = await page.locator('.Board__tiles').boundingBox();
    expect(collapsed.height).toBeGreaterThan(metrics.grid.height);
    await openPatientExpression(panel, false);
    expect(await output()).toEqual(original);
    await expect(content.locator('.CommunicationSupportPanel__sequenceItem')).toHaveCount(2);
    expect(errors).toEqual([]);
    expect(requests.filter(r => /gpt|pictogram|funding|usage/.test(r.url))).toEqual([]);
    await info.attach('request-audit', { body: JSON.stringify({ requests, errors, original }, null, 2), contentType: 'application/json' });
  });
}
