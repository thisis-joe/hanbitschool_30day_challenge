import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../../.env.e2e.local', import.meta.url)), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);
export const adminId = env.HANBIT_BOOTSTRAP_ADMIN_ID;
export const adminPassword = env.HANBIT_BOOTSTRAP_ADMIN_PASSWORD;
if (!adminId || !adminPassword) throw new Error('E2E 전용 관리자 환경 변수가 필요합니다.');
async function secretFill(input: Locator, value: string) {
  try {
    await input.fill(value);
  } catch {
    throw new Error('비밀번호 입력 화면을 확인할 수 없습니다.');
  }
}
export async function staffLogin(page: Page, id: string, password: string) {
  await page.goto('/staff/login');
  await page.getByLabel('교직원 아이디').fill(id);
  await secretFill(page.getByLabel('비밀번호', { exact: true }), password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/(staff\/classrooms|account\/password)$/);
}
export async function studentLogin(
  page: Page,
  school: string,
  grade: string,
  classNumber: number,
  number: number,
  password: string,
) {
  await page.goto('/login');
  await page.getByLabel('학교', { exact: true }).selectOption({ label: school });
  await page.getByLabel('학년', { exact: true }).selectOption({ label: grade });
  await page.getByLabel('반', { exact: true }).selectOption(String(classNumber));
  await page.getByLabel('번호', { exact: true }).fill(String(number));
  await secretFill(page.getByLabel('비밀번호', { exact: true }), password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/account$/);
}
export async function changeInitialPassword(page: Page, current: string, next: string) {
  await secretFill(page.getByLabel('현재 비밀번호'), current);
  await secretFill(page.getByLabel('새 비밀번호', { exact: true }), next);
  await secretFill(page.getByLabel('새 비밀번호 확인'), next);
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/classrooms$/);
}
export async function signOut(page: Page) {
  await page.getByRole('button', { name: '로그아웃', exact: true }).first().click();
  await expect(page).toHaveURL(/\/(staff\/login|login)$/);
}
export async function provisionClass(page: Page, id: string, password: string) {
  const suffix = randomBytes(6).toString('hex');
  const staffLoginId = 'e2e.' + suffix;
  const staffPassword = 'Changed!' + suffix;
  const gradeLabel = '검증' + suffix;
  await staffLogin(page, id, password);
  await page.getByRole('link', { name: '교사 계정', exact: true }).click();
  await page.getByLabel('교사 이름').fill('검증 교사');
  await page.getByLabel('교직원 아이디').fill(staffLoginId);
  await page.getByRole('button', { name: '교사 계정 발급', exact: true }).click();
  const initial = await page.getByLabel('초기 비밀번호', { exact: true }).inputValue();
  if (initial.length !== 32) throw new Error('초기 비밀번호가 발급되지 않았습니다.');
  await page.reload();
  await expect(page.getByLabel('초기 비밀번호', { exact: true })).toHaveCount(0);
  await signOut(page);
  await staffLogin(page, staffLoginId, initial);
  await expect(page).toHaveURL(/\/account\/password$/);
  await changeInitialPassword(page, initial, staffPassword);
  await page.getByLabel('학년 표시').fill(gradeLabel);
  await page.getByLabel('반 번호').fill('1');
  await page.getByLabel('시작일').fill('2026-10-12');
  await page.getByRole('button', { name: '학급 만들기', exact: true }).click();
  const joinCode = await page
    .getByLabel(gradeLabel + ' 1반 가입 코드', { exact: true })
    .inputValue();
  return { staffLoginId, staffPassword, gradeLabel, classNumber: 1, joinCode };
}
export async function signup(
  page: Page,
  c: { gradeLabel: string; classNumber: number; joinCode: string },
) {
  await page.goto('/signup');
  await page.getByLabel('학교', { exact: true }).selectOption({ label: '한빛학교' });
  await page.getByLabel('학년', { exact: true }).selectOption({ label: c.gradeLabel });
  await page.getByLabel('반', { exact: true }).selectOption(String(c.classNumber));
  await page.getByLabel('번호', { exact: true }).fill('01');
  await page.getByLabel('이름', { exact: true }).fill('김민수');
  await page.getByLabel('별명', { exact: true }).fill('숲친구');
  await secretFill(page.getByLabel('비밀번호', { exact: true }), 'Student!2026');
  await page.getByLabel('학급 가입 코드').fill(c.joinCode);
  await page.getByRole('button', { name: '가입하기', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('번호', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
}
