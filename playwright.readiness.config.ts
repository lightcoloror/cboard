import { defineConfig } from '@playwright/test';
import offline from './playwright.offline.config';

export default defineConfig({
  ...offline,
  testMatch: ['**/offline-readiness.spec.js'],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results/offline-readiness',
  use: { ...offline.use, headless: true, serviceWorkers: 'allow', locale: 'zh-CN' },
  projects: (offline.projects || []).filter(project => project.name !== 'mobile-landscape-chrome')
});
