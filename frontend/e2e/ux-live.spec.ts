import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { e2eBaseURL, e2eComposeProject } from '../playwright.config';
import { provisionLearner } from './learning-helpers';
import { signOut, staffLogin } from './helpers';

// These writes are allowed only in a loopback stack owned by this checkout.
test.beforeAll(() => {
  const project = e2eComposeProject();
  const checkout = fileURLToPath(new URL('../../', import.meta.url));
  for (const service of ['db', 'backend', 'web']) {
    const labels = JSON.parse(
      execFileSync(
        'docker',
        ['inspect', '--format', '{{json .Config.Labels}}', `${project}-${service}-1`],
        { encoding: 'utf8' },
      ),
    );
    expect(labels['com.docker.compose.project']).toBe(project);
    expect(labels['com.docker.compose.service']).toBe(service);
    expect(resolve(labels['com.docker.compose.project.working_dir'])).toBe(
      resolve(checkout, 'infra'),
    );
    expect(labels['com.docker.compose.project.config_files']).toBe(
      resolve(checkout, 'infra/compose.local.yml'),
    );
  }
  const ports = JSON.parse(
    execFileSync(
      'docker',
      ['inspect', '--format', '{{json .HostConfig.PortBindings}}', `${project}-web-1`],
      { encoding: 'utf8' },
    ),
  );
  expect(ports['80/tcp']).toEqual([{ HostIp: '127.0.0.1', HostPort: new URL(e2eBaseURL()).port }]);
});

test('teacher can find a class, inspect its roster, search statistics and return from student detail', async ({
  page,
}) => {
  const classroom = await provisionLearner(page);
  await signOut(page);
  await staffLogin(page, classroom.staffLoginId, classroom.staffPassword);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '명단 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가입 학생 명단' })).toBeVisible();
  await page.getByRole('button', { name: '명단 닫기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가입 학생 명단' })).toHaveCount(0);
  await page.getByRole('link', { name: '학습 통계', exact: true }).click();
  await page.getByLabel('이름·번호 검색').fill('1');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page).toHaveURL(/search=1/);
  await page.getByRole('link', { name: /1번 .* 학생 상세/ }).click();
  await expect(page.getByRole('table', { name: '학생 첫 답변' })).toBeVisible();
  await expect(page.getByLabel('답변 회차')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: /목록/ }).first().click();
  await expect(page.getByLabel('이름·번호 검색')).toHaveValue('1');
});
