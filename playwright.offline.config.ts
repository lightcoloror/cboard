import { defineConfig, devices } from '@playwright/test';

const host = process.env.PLAYWRIGHT_OFFLINE_HOST || 'localhost';
const port = process.env.PLAYWRIGHT_OFFLINE_PORT || '4173';
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: './tests/offline',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    actionTimeout: 15000,
    navigationTimeout: 60000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome'
      }
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        channel: 'chrome'
      }
    },
    {
      name: 'mobile-landscape-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 851, height: 393 },
        screen: { width: 851, height: 393 },
        channel: 'chrome'
      }
    }
  ],
  webServer: {
    command: 'node scripts/serve-offline-build.mjs',
    env: {
      ...process.env,
      PLAYWRIGHT_OFFLINE_HOST: host,
      PLAYWRIGHT_OFFLINE_PORT: port
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000
  }
});
