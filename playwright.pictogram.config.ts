import segmentation from './playwright.segmentation.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...segmentation,
  testMatch: ['**/communication-support-missing-token.spec.js']
});
