'use strict';
const path = require('node:path');
const { defineConfig } = require('../../fork-cboard/cboard/node_modules/@playwright/test');
const baseURL = process.env.EXPRESSION_BASE_URL || 'http://127.0.0.1:4198';
const production = baseURL === 'https://app.tuyujia.com.cn';
const buildPath = process.env.EXPRESSION_BUILD_PATH;
if (!process.env.EXPRESSION_WEB_INVENTORY)
  throw new Error('EXPRESSION_WEB_INVENTORY must point to the accepted candidate inventory');
if (!production && !buildPath)
  throw new Error('EXPRESSION_BUILD_PATH is required for the loopback production build server');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'favorite-durable-production.spec.js',
  timeout: 240000,
  expect: { timeout: 20000 },
  workers: 1,
  retries: 0,
  outputDir: path.join(__dirname, production ? 'browser-production-artifacts' : 'browser-local-artifacts'),
  reporter: [['list'], ['json', {
    outputFile: path.join(__dirname, production ? 'browser-production-report.json' : 'browser-local-report.json')
  }]],
  ...(production ? {} : {
    webServer: {
      command: '"C:/Program Files/nodejs/node.exe" scripts/serve-offline-build.mjs',
      cwd: path.resolve(__dirname, '../../fork-cboard/cboard'),
      env: {
        PLAYWRIGHT_OFFLINE_HOST: '127.0.0.1',
        PLAYWRIGHT_OFFLINE_PORT: String(new URL(baseURL).port),
        PLAYWRIGHT_OFFLINE_BUILD_PATH: buildPath
      },
      url: baseURL,
      reuseExistingServer: false
    }
  })
});
