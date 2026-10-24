import { test as base, expect } from '@playwright/test';

/**
 * Shared fixture: every e2e test fails on uncaught page errors, console errors
 * and CSP violations, so a feature that breaks the production CSP is caught.
 * The backend API is stubbed unless a test overrides the route.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console: ${m.text()}`);
      });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      await page.route('https://punland-api.interstellarai.net/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
      );
      await use(problems);
      expect(problems, 'page errors, console errors or CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
