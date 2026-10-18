import { defineConfig } from '@playwright/test';
import offline from './playwright.offline.config';

export default defineConfig({
  ...offline,
  testMatch: ['**/communication-builtin15-offline.spec.js'],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results/builtin15-offline',
  use: { ...offline.use, headless: true, serviceWorkers: 'allow' },
  projects: (offline.projects || []).filter(project => project.name !== 'mobile-landscape-chrome')
});
