import offline from './playwright.offline.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...offline,
  // All requests are fulfilled from an isolated production artifact by the
  // existing offline helper. No server, external account or model is used.
  webServer: undefined,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results/segmentation',
  testMatch: [
    '**/communication-support-segmentation.spec.js',
    '**/communication-support-history-retry.spec.js',
    '**/communication-support-demo.spec.js'
  ],
  use: {
    ...offline.use,
    headless: true,
    serviceWorkers: 'block',
    bypassCSP: true
  },
  projects: (offline.projects || []).filter(
    project => project.name !== 'mobile-landscape-chrome'
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env.PLAYWRIGHT_JSON_REPORT ||
          'test-results/segmentation/report.json'
      }
    ]
  ]
});
