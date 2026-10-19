import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { e2eBaseURL, e2eComposeProject } from '../playwright.config';
import { evidenceOutput } from './evidence-output';
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { adminId, adminPassword, provisionClass, signOut, signup, studentLogin } from './helpers';
import type {
  AnswerChoice,
  AnswerResult,
  LearningSessionView,
  LearningStatus,
  PersonalQuestionFilter,
  PersonalQuestionView,
} from '../src/features/learning/types';

// Node-only fixture: canonical answers never enter the browser or learner bundle.
const content = JSON.parse(
  readFileSync(
    new URL('../../backend/src/main/resources/content/hanbit-v1.json', import.meta.url),
    'utf8',
  ),
) as { questions: { id: number; answer: AnswerChoice }[] }[];
const canonical = new Map(content.flatMap((day) => day.questions.map((q) => [q.id, q.answer])));
const root = '/api/student/learning';

export async function readApi<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(root + path);
  expect(response.status()).toBe(200);
  return response.json() as Promise<T>;
}
export const status = (page: Page) => readApi<LearningStatus>(page, '/status');
export const session = (page: Page, id: string) =>
  readApi<LearningSessionView>(page, `/sessions/${id}`);
export const personal = (page: Page, filter: PersonalQuestionFilter) =>
  readApi<PersonalQuestionView[]>(page, `/questions?filter=${filter}`);

// Protected JSON DTOs are compared in full; matchers receive only the boolean result.
export function protectedEqual(actual: unknown, expected: unknown) {
  expect(isDeepStrictEqual(actual, expected), 'Protected JSON equality').toBe(true);
}
export async function protectedText(
  locator: Locator,
  expected: string,
  options: { contains?: boolean; value?: boolean; timeout?: number } = {},
) {
  // Same whitespace rules as Playwright's string text matchers; input values stay raw.
  const normalize = (text: string) =>
    text
      .replace(/[\u200b\u00ad]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  await expect
    .poll(
      async () => {
        try {
          const value = options.value ? await locator.inputValue() : await locator.textContent();
          if (value === null) return false;
          const received = options.value ? value : normalize(value);
          const wanted = options.value ? expected : normalize(expected);
          return options.contains ? received.includes(wanted) : received === wanted;
        } catch {
          return false;
        }
      },
      { timeout: options.timeout ?? 15000, message: 'Protected text comparison' },
    )
    .toBe(true);
}

/** Reusable normal-flow fixture: fresh changed-password teacher and numbered UI registrations. */
export async function provisionLearningClass(
  page: Page,
  count: number,
  inspectDocker: (args: string[]) => string = docker,
) {
  assertOwnedLearningTarget(inspectDocker);
  if (!Number.isInteger(count) || count < 1 || count > 25)
    throw new Error('Invalid synthetic roster size');
  page.on('dialog', (dialog) => void dialog.accept());
  const response = await page.request.get('/api/auth/csrf');
  expect(response.status()).toBe(200);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(response.headers().date));
  const startDate = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const c = await provisionClass(page, adminId, adminPassword, startDate);
  const classes = (await (await page.request.get('/api/staff/classrooms?scope=MINE')).json()) as {
    id: string;
    gradeLabel: string;
  }[];
  const classroomId = classes.find((row) => row.gradeLabel === c.gradeLabel)?.id;
  if (!classroomId) throw new Error('Fresh synthetic class was not created');
  await signOut(page);
  const studentIds: string[] = [];
  for (let number = 1; number <= count; number++) {
    await page.goto('/signup');
    await page.getByLabel('학교', { exact: true }).selectOption({ label: '한빛학교' });
    await page.getByLabel('학년', { exact: true }).selectOption({ label: c.gradeLabel });
    await page.getByLabel('반', { exact: true }).selectOption('1');
    await page.getByLabel('번호', { exact: true }).fill(String(number));
    await page
      .getByLabel('이름', { exact: true })
      .fill(number === 1 ? '김민수' : number === 2 ? '합성둘' : `합성학생${number}`);
    await page.getByLabel('별명', { exact: true }).fill('합성친구');
    try {
      await page.getByLabel('비밀번호', { exact: true }).fill('Student!2026');
      await page.getByLabel('학급 가입 코드').fill(c.joinCode);
    } catch {
      throw new Error('Synthetic registration secret input unavailable');
    }
    await page.getByRole('button', { name: '가입하기', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await studentLogin(page, '한빛학교', c.gradeLabel, 1, number, 'Student!2026');
    const me = (await (await page.request.get('/api/auth/me')).json()) as { accountId: string };
    studentIds.push(me.accountId);
    if (number < count) await signOut(page);
  }
  if (count > 1) {
    await signOut(page);
    await studentLogin(page, '한빛학교', c.gradeLabel, 1, 1, 'Student!2026');
  }
  expect((await status(page)).calendarCap).toBe(2);
  return { ...c, classroomId, studentIds };
}

export async function learningCommand<T>(page: Page, path: string, data: unknown): Promise<T> {
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()) as {
    headerName: string;
    token: string;
  };
  const response = await page.request.post(root + path, {
    headers: { [csrf.headerName]: csrf.token },
    data,
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<T>;
}
export async function answerApi(page: Page, view: LearningSessionView, correct: boolean) {
  const q = view.question;
  const right = q && canonical.get(q.questionId);
  if (!q || !right) throw new Error('Canonical synthetic active question required');
  const result = await learningCommand<AnswerResult>(page, `/sessions/${view.sessionId}/answers`, {
    questionId: q.questionId,
    choice: correct ? right : right === 'O' ? 'X' : 'O',
    requestId: randomUUID(),
  });
  expect(result.outcome).toBe(correct ? 'CORRECT' : 'WRONG');
  return result;
}

const checkout = fileURLToPath(new URL('../../', import.meta.url));
function docker(args: string[], input?: string) {
  try {
    return execFileSync('docker', args, {
      cwd: checkout,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      input,
    }).toString();
  } catch {
    throw new Error('Owned isolated Docker operation failed');
  }
}
/** Validate the actual services, config, volume and binding before every mutation. No env output. */
export function assertOwnedLearningTarget(inspectDocker: (args: string[]) => string = docker) {
  const project = e2eComposeProject();
  if (project !== 'hanbit-game-e2e' || e2eBaseURL() !== 'http://127.0.0.1:8090')
    throw new Error('Teacher verification requires its owned loopback target');
  for (const service of ['db', 'backend', 'web']) {
    const inspect = JSON.parse(
      inspectDocker(['inspect', '--format', '{{json .Config.Labels}}', `${project}-${service}-1`]),
    ) as Record<string, string>;
    if (
      inspect['com.docker.compose.project'] !== project ||
      inspect['com.docker.compose.service'] !== service ||
      resolve(inspect['com.docker.compose.project.working_dir'] ?? '') !==
        resolve(checkout, 'infra') ||
      inspect['com.docker.compose.project.config_files'] !==
        resolve(checkout, 'infra/compose.local.yml')
    )
      throw new Error('Docker service ownership mismatch');
  }
  const mounts = JSON.parse(
    inspectDocker(['inspect', '--format', '{{json .Mounts}}', `${project}-db-1`]),
  ) as { Type: string; Name: string; Destination: string }[];
  if (
    !mounts.some(
      (m) =>
        m.Type === 'volume' &&
        m.Name === project + '_school-data' &&
        m.Destination === '/var/lib/postgresql/data',
    )
  )
    throw new Error('Docker database volume mismatch');
  const volume = JSON.parse(
    inspectDocker(['volume', 'inspect', '--format', '{{json .Labels}}', project + '_school-data']),
  ) as Record<string, string>;
  if (
    volume['com.docker.compose.project'] !== project ||
    volume['com.docker.compose.volume'] !== 'school-data'
  )
    throw new Error('Docker volume ownership mismatch');
  const ports = JSON.parse(
    inspectDocker(['inspect', '--format', '{{json .HostConfig.PortBindings}}', `${project}-web-1`]),
  ) as Record<string, { HostIp: string; HostPort: string }[]>;
  if (
    ports['80/tcp']?.length !== 1 ||
    ports['80/tcp'][0].HostIp !== '127.0.0.1' ||
    ports['80/tcp'][0].HostPort !== '8090'
  )
    throw new Error('Docker loopback binding mismatch');
}

/** Test-only SQL, no credentials in argv/output; callers seed only their fresh synthetic IDs. */
export function isolatedSql(sql: string) {
  assertOwnedLearningTarget();
  return docker(
    [
      'exec',
      '-i',
      'hanbit-game-e2e-db-1',
      'sh',
      '-c',
      'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    sql,
  );
}
export async function restartOwnedBackend(page: Page) {
  assertOwnedLearningTarget();
  const args = [
    'compose',
    '-p',
    e2eComposeProject(),
    '--env-file',
    '.env.e2e-no-bootstrap.local',
    '-f',
    'infra/compose.local.yml',
  ];
  docker([...args, 'restart', 'backend']);
  await expect
    .poll(
      () =>
        docker([
          'inspect',
          '--format',
          '{{.State.Health.Status}}',
          'hanbit-game-e2e-backend-1',
        ]).trim(),
      { timeout: 90000, intervals: [1000] },
    )
    .toBe('healthy');
  assertOwnedLearningTarget();
  docker([...args, 'restart', 'web']);
  await expect
    .poll(
      async () => {
        try {
          return (await page.request.get('/api/auth/csrf')).status();
        } catch {
          return 503;
        }
      },
      { timeout: 90000, intervals: [250, 500, 1000] },
    )
    .toBe(200);
}

export async function provisionLearner(page: Page) {
  page.on('dialog', (dialog) => void dialog.accept());
  const response = await page.request.get('/api/auth/csrf');
  expect(response.status()).toBe(200);
  const serverDate = response.headers().date;
  expect(serverDate).toBeTruthy();
  // Use the server's Seoul calendar day, not the browser device clock.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(serverDate));
  const startDate = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const classroom = await provisionClass(page, adminId, adminPassword, startDate);
  await signOut(page);
  await signup(page, classroom);
  await studentLogin(page, '한빛학교', classroom.gradeLabel, 1, 1, 'Student!2026');
  await expect(page.getByRole('heading', { name: '나의 학습', exact: true })).toBeVisible();
  expect((await status(page)).calendarCap).toBe(2);
  return classroom;
}

export async function start(
  page: Page,
  control: Locator,
  mode: LearningSessionView['mode'],
  day: number | null,
) {
  const rounds = page.getByRole('button', { name: '회차별 학습 보기' });
  if (new URL(page.url()).pathname === '/student/learning') {
    await rounds.waitFor({ state: 'visible' });
    if ((await rounds.getAttribute('aria-expanded')) === 'false' && !(await control.isVisible()))
      await rounds.click();
  }
  const response = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === `${root}/sessions` && res.request().method() === 'POST',
  );
  await control.click();
  const saved = await response;
  expect(saved.status()).toBe(200);
  const view = (await saved.json()) as LearningSessionView;
  expect(view.mode).toBe(mode);
  expect(view.dayNumber).toBe(day);
  expect(view.state).toBe('QUESTION_ACTIVE');
  await expect(page).toHaveURL(new RegExp(`/student/learning/sessions/${view.sessionId}$`));
  return view;
}

export async function answer(
  page: Page,
  view: LearningSessionView,
  correct: boolean,
  useKeyboard = false,
) {
  if (!view.question) throw new Error('서버의 활성 문항이 필요합니다.');
  const right = canonical.get(view.question.questionId);
  if (!right) throw new Error('테스트 정본 문항이 없습니다.');
  const choice = correct ? right : right === 'O' ? 'X' : 'O';
  const response = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === `${root}/sessions/${view.sessionId}/answers` &&
      res.request().method() === 'POST',
  );
  const control = page.getByRole('button', {
    name: choice === 'O' ? 'O · 사실' : 'X · 해석',
    exact: true,
  });
  if (useKeyboard) {
    await expect(control).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await control.click();
  }
  const saved = await response;
  expect(saved.status()).toBe(200);
  const result = (await saved.json()) as AnswerResult;
  expect(result.questionId).toBe(view.question.questionId);
  expect(result.outcome).toBe(correct ? 'CORRECT' : 'WRONG');
  expect(result.correctChoice).toBe(right);
  expect(result.explanation.length).toBeGreaterThan(0);
  await expect(
    page.getByRole('heading', { name: correct ? '정답이에요' : '오답이에요', exact: true }),
  ).toBeVisible();
  await protectedText(page.locator('.learning-explanation'), result.explanation);
  await expect(
    page.getByText(`이번 답변으로 받은 경험치: ${result.xpAwarded} XP`, { exact: true }),
  ).toBeVisible();
  return result;
}

export async function advance(page: Page, id: string) {
  const response = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === `${root}/sessions/${id}/advance` &&
      res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '다음 문제', exact: true }).click();
  const saved = await response;
  expect(saved.status()).toBe(200);
  const view = (await saved.json()) as LearningSessionView;
  expect(view.state).toBe('QUESTION_ACTIVE');
  await expect(
    page.getByRole('heading', {
      name: `문항 ${view.question!.position} / ${view.questionCount}`,
      exact: true,
    }),
  ).toBeFocused();
  return view;
}

export async function finishDay(page: Page, initial: LearningSessionView, correct: boolean[]) {
  let view = initial;
  const results: AnswerResult[] = [];
  for (let index = 0; index < correct.length; index++) {
    results.push(await answer(page, view, correct[index]));
    if (index < correct.length - 1) view = await advance(page, initial.sessionId);
  }
  return results;
}

export async function resultPage(page: Page, id: string, title: string) {
  await page.getByRole('link', { name: '완료하기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${id}/result$`));
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

export async function layoutAndTargets(page: Page) {
  await expect(page.locator('.learning-page')).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const measured = await page.evaluate(() => ({
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
      targets: Array.from(
        document.querySelectorAll<HTMLElement>(
          '.learning-page button, .learning-page a, .learning-select, .student-header a, .student-header nav button, .game-student-nav a',
        ),
      )
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            label: element.getAttribute('aria-label') ?? element.textContent?.trim(),
            width: bounds.width,
            height: bounds.height,
          };
        }),
    }));
    expect(measured.overflow).toBeLessThanOrEqual(0);
    expect(measured.targets.length).toBeGreaterThan(0);
    expect(
      measured.targets.filter((target) => target.width < 48 || target.height < 48),
      `touch targets at ${width}px on ${new URL(page.url()).pathname}`,
    ).toEqual([]);
    const output = evidenceOutput();
    if (!output) continue; // Keep all layout/target assertions; default execution writes nothing.
    appendFileSync(
      output.file('layout.jsonl'),
      JSON.stringify({
        surface: new URL(page.url()).pathname.replace(/\/sessions\/[^/]+/, '/sessions/SYNTHETIC'),
        width,
        overflow: measured.overflow,
        targetCount: measured.targets.length,
        minimumWidth: Math.min(...measured.targets.map((target) => target.width)),
        minimumHeight: Math.min(...measured.targets.map((target) => target.height)),
      }) + '\n',
    );
  }
}

// Retain only synthetic result proof: never capture auth, question or personal-list pages.
export async function captureSanitizedResultProof(page: Page) {
  await expect(page).toHaveURL(/\/student\/learning\/sessions\/[^/]+\/result$/);
  const output = evidenceOutput();
  if (!output) return;
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.learning-page').screenshot({
      path: output.file(`result-${width}.png`),
      animations: 'disabled',
      style:
        '.student-header, .game-student-nav, .learning-eyebrow, .learning-source, .learning-explanation, .learning-correct-choice, .learning-personal-text { visibility: hidden !important; }',
    });
  }
}

export async function visibleFocus(control: Locator) {
  await expect(control).toBeFocused();
  expect(
    await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2;
    }),
  ).toBe(true);
}
