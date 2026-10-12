import { test, expect } from '@playwright/test';
for (const width of [320, 390, 768, 1440])
  for (const route of ['/login', '/signup'])
    test(`${route} has no overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.locator('html').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true,
      );
      const button = page.getByRole('button', {
        name: route === '/login' ? '로그인' : '가입하기',
        exact: true,
      });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });
test('keyboard reaches login submit and accessible error', async ({ page }) => {
  await page.goto('/staff/login');
  await page.getByLabel('교직원 아이디').focus();
  await page.keyboard.type('missing.teacher');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeFocused();
  await page.keyboard.type('Wrong!2026');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호를 확인해 주세요.');
});
