import offline from './playwright.segmentation.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...offline,
  testMatch: [
    '**/communication-expression-three.spec.js',
    '**/communication-support-autoplay.spec.js',
    '**/communication-support-history-retry.spec.js',
    '**/communication-support-demo.spec.js',
    '**/communication-support-share.spec.js'
  ],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results/expression-three',
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_REPORT || 'test-results/expression-three/report.json' }]
  ]
});
