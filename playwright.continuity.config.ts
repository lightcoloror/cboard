import expression from './playwright.expression.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...expression,
  testMatch: ['**/care-feature-continuity.spec.js'],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results/care-continuity'
});
