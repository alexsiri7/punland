import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build (dist/) served by
// tests/serve.mjs, which applies public/_headers, so they run under the real CSP.
// Run `npm run build` first (CI does).
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // The suite plays once with each renderer while both exist (docs/ARCHITECTURE.md, "Renderer
  // choice"): the main run with the default, 3D, and one with ?renderer=2d. tests/e2e/play.ts
  // starts the game with the project's renderer.
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-chromium-2d', use: { ...devices['Desktop Chrome'] }, metadata: { renderer: '2d' } },
  ],
  webServer: {
    command: `node tests/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
