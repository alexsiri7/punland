import { expect, test } from './fixtures';

test('production security headers are applied', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});

test('unknown paths get the 404 page', async ({ request }) => {
  const res = await request.get('/no-such-street');
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain('Wrong turn');
});
