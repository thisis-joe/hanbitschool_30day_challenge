import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminId,
  adminPassword,
  provisionClass,
  signOut,
  signup,
  studentLogin,
  staffLogin,
} from './helpers';

async function waitForBackendHealth(root: string) {
  await expect
    .poll(
      () => {
        try {
          return execFileSync(
            'docker',
            ['inspect', '--format', '{{.State.Health.Status}}', 'hanbit-account-e2e-backend-1'],
            { cwd: root, stdio: 'pipe', timeout: 5000 },
          )
            .toString()
            .trim();
        } catch {
          return 'unavailable';
        }
      },
      { timeout: 90000, intervals: [1000] },
    )
    .toBe('healthy');
}

async function waitForPublicReadiness(page: Page) {
  await expect
    .poll(
      async () => {
        try {
          return (await page.request.get('/api/auth/csrf')).status();
        } catch {
          return 503;
        }
      },
      { timeout: 90000 },
    )
    .toBe(200);
}

test('admin teacher classroom student and real roster', async ({ page, browser }) => {
  test.setTimeout(300000);
  const c = await provisionClass(page, adminId, adminPassword);
  await signOut(page);
  await signup(page, c);
  await studentLogin(page, '한빛학교', c.gradeLabel, c.classNumber, 1, 'Student!2026');
  await expect(page.getByRole('heading', { name: '나의 학습', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '내 정보', exact: true }).click();
  await expect(page.getByText('숲친구', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('숲친구', { exact: true })).toBeVisible();
  await expect(page.getByText(c.gradeLabel, { exact: true })).toBeVisible();
  const before = await (await page.request.get('/api/auth/me')).json();
  const teacher = await browser.newPage();
  try {
    await staffLogin(teacher, c.staffLoginId, c.staffPassword);
    await teacher.getByRole('button', { name: '명단 보기', exact: true }).click();
    await expect(teacher.getByText('김민수', { exact: true })).toBeVisible();
    await expect(teacher.getByText('1번', { exact: true })).toBeVisible();
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const argsFor = (envFile: string) => [
      'compose',
      '-p',
      'hanbit-account-e2e',
      '--env-file',
      envFile,
      '-f',
      'infra/compose.local.yml',
    ];
    const args = argsFor('.env.e2e.local');
    try {
      execFileSync('docker', [...args, 'restart', 'backend'], {
        cwd: root,
        stdio: 'pipe',
        timeout: 90000,
      });
    } catch {
      throw new Error('테스트 서버 재시작에 실패했습니다.');
    }
    await waitForBackendHealth(root);
    try {
      execFileSync('docker', [...args, 'restart', 'web'], {
        cwd: root,
        stdio: 'pipe',
        timeout: 90000,
      });
    } catch {
      throw new Error('테스트 웹 재시작에 실패했습니다.');
    }
    await waitForPublicReadiness(page);
    await studentLogin(page, '한빛학교', c.gradeLabel, 1, 1, 'Student!2026');
    const after = await (await page.request.get('/api/auth/me')).json();
    expect(after).toEqual(before);
    await staffLogin(teacher, c.staffLoginId, c.staffPassword);
    await teacher.getByRole('button', { name: '명단 보기', exact: true }).click();
    await expect(teacher.getByText('김민수', { exact: true })).toBeVisible();
    const original = readFileSync(root + '.env.e2e.local', 'utf8');
    writeFileSync(
      root + '.env.e2e-no-bootstrap.local',
      original.replace(/^HANBIT_BOOTSTRAP_ADMIN_(ID|PASSWORD)=.*$/gm, 'HANBIT_BOOTSTRAP_ADMIN_$1='),
    );
    chmodSync(root + '.env.e2e-no-bootstrap.local', 0o600);
    const noBootstrapArgs = argsFor('.env.e2e-no-bootstrap.local');
    try {
      execFileSync(
        'docker',
        [...noBootstrapArgs, 'up', '-d', '--force-recreate', '--no-deps', 'backend'],
        { cwd: root, stdio: 'pipe', timeout: 120000 },
      );
    } catch {
      throw new Error('부트스트랩 환경 변수 제거 후 재시작에 실패했습니다.');
    }
    await waitForBackendHealth(root);
    try {
      execFileSync(
        'docker',
        [...noBootstrapArgs, 'up', '-d', '--force-recreate', '--no-deps', 'web'],
        { cwd: root, stdio: 'pipe', timeout: 120000 },
      );
    } catch {
      throw new Error('부트스트랩 환경 변수 제거 후 웹 재시작에 실패했습니다.');
    }
    await waitForPublicReadiness(page);
    await staffLogin(teacher, adminId, adminPassword);
    await expect(teacher).toHaveURL(/\/staff\/classrooms$/);
  } finally {
    await teacher.close();
  }
});
