import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1280, height: 720 },
    // Headless Chromium renders WebGL in software (SwiftShader): correct pixels, not real GPU speed.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testIgnore: /touch\.spec/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /touch\.spec/ },
  ],
  webServer: {
    command: `node tools/dev-server.mjs --port ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
  },
});
