import { test, expect } from '@playwright/test';
import { adminId, adminPassword, provisionClass, signup, signOut, studentLogin } from './helpers';
test('teacher logout student login back and protected route', async ({ page }) => {
  const c = await provisionClass(page, adminId, adminPassword);
  await signup(page, c);
  await page.goto('/staff/classrooms');
  await page.getByRole('button', { name: '명단 보기', exact: true }).click();
  await expect(page.getByText('김민수', { exact: true })).toBeVisible();
  await signOut(page);
  await studentLogin(page, '한빛학교', c.gradeLabel, 1, 1, 'Student!2026');
  await page.goBack();
  await expect(page.getByText('가입 학생 명단', { exact: true })).toHaveCount(0);
  await page.goto('/staff/classrooms');
  await expect(page.getByRole('alert')).toHaveText('접근 권한이 없습니다.');
  await expect(page.getByText('김민수', { exact: true })).toHaveCount(0);
  await expect(page.getByText('가입 학생 명단', { exact: true })).toHaveCount(0);
  await page.goto('/admin/teachers');
  await expect(page.getByRole('button', { name: '교사 계정 발급', exact: true })).toHaveCount(0);
});
