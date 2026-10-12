import { test, expect } from '@playwright/test';
import { staffLogin, adminId, adminPassword } from './helpers';
test('same origin API JSON and direct SPA routes', async ({ page, request }) => {
  for (const path of ['/login', '/signup', '/student/account', '/staff/classrooms']) {
    const r = await request.get(path);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('text/html');
    expect(await r.text()).toContain('id="root"');
  }
  const csrf = await request.get('/api/auth/csrf');
  expect(csrf.status()).toBe(200);
  expect(csrf.headers()['content-type']).toContain('application/json');
  expect(csrf.headers()['cache-control']).toContain('no-store');
  await staffLogin(page, adminId, adminPassword);
  for (const path of ['/api/unknown', '/api']) {
    const unknown = await page.request.get(path);
    expect(unknown.status()).toBe(404);
    expect(unknown.headers()['content-type']).toContain('application/json');
    expect((await unknown.json()).code).toBe('NOT_FOUND');
  }
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === 'JSESSIONID');
  expect(session?.httpOnly).toBe(true);
  expect(session?.secure).toBe(false);
  expect(session?.sameSite).toBe('Lax');
});
