import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  activeSession,
  answerResult,
  learningStatus,
  personalQuestion,
  sessionId,
} from '../src/test/learningFixtures';
import { gameView, journeyView } from '../src/test/gameFixtures';
import { student, teacher } from '../src/test/server';
import {
  classroom,
  overview,
  question,
  questionDetail,
  studentDetail,
} from '../src/test/teacherLearningFixtures';
import { evidenceOutput } from './evidence-output';
import type { LearningSessionView } from '../src/features/learning/types';

async function scenario(
  page: Page,
  role: 'student' | 'teacher' | 'admin' | 'anonymous' = 'student',
  empty = false,
) {
  let appearance = { ...gameView, characterId: 'haru' as const };
  let session: LearningSessionView = {
    ...activeSession,
    question: {
      ...activeSession.question!,
      text: '나무는 햇빛을 받아 자랍니다.',
      deadlineAt: new Date(Date.now() + 120000).toISOString(),
      timeLimitSeconds: 120,
    },
  };
  let rows = empty
    ? []
    : Array.from({ length: 8 }, (_, i) => ({
        ...personalQuestion,
        questionId: i + 1,
        dayNumber: Math.floor(i / 5) + 1,
        position: (i % 5) + 1,
        text: `${i + 1}. 나무는 햇빛을 받아 자랍니다.`,
      }));
  const requests: { path: string; body: unknown }[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body: unknown;
    if (path === '/api/auth/me')
      body =
        role === 'student'
          ? student
          : role === 'teacher'
            ? teacher
            : role === 'admin'
              ? { ...teacher, role: 'ADMIN' }
              : null;
    else if (path === '/api/auth/csrf') body = { headerName: 'X-CSRF-TOKEN', token: 'ux-fixture' };
    else if (path === '/api/public/schools') body = [{ id: 'school-a', name: '한빛학교' }];
    else if (path.endsWith('/classrooms') && path.includes('/public/'))
      body = [{ id: 'class-a', gradeLabel: '1학년', classNumber: 1 }];
    else if (path === '/api/public/classrooms/resolve')
      body = { id: 'class-a', gradeLabel: '1학년', classNumber: 1 };
    else if (path === '/api/auth/students/register') body = student;
    else if (path === '/api/student/game') body = appearance;
    else if (path === '/api/student/game/appearance') {
      const command = route.request().postDataJSON();
      requests.push({ path, body: command });
      appearance = { ...appearance, ...command, revision: appearance.revision + 1 };
      body = appearance;
    } else if (path === '/api/student/learning/map') body = journeyView;
    else if (path === '/api/student/learning/status')
      body = { ...learningStatus, nextAction: 'START_FIRST', activeSession: null };
    else if (path === '/api/student/learning/questions')
      body = rows.filter(
        (row) => url.searchParams.get('filter') !== 'BOOKMARKED' || row.bookmarked,
      );
    else if (path.includes('/review-queue/') && method === 'DELETE') {
      rows = rows.filter((row) => row.questionId !== Number(path.split('/').pop()));
      body = null;
    } else if (path.includes('/bookmarks/')) {
      rows = rows.map((row) =>
        row.questionId === Number(path.split('/').pop())
          ? { ...row, bookmarked: method === 'PUT' }
          : row,
      );
      body = null;
    } else if (path === '/api/student/learning/sessions' && method === 'POST') {
      requests.push({ path, body: route.request().postDataJSON() });
      body = session;
    } else if (path.endsWith('/answers')) {
      session = {
        ...session,
        state: 'COMPLETED',
        answeredCount: 5,
        lastAnswer: {
          ...answerResult,
          attemptCorrectCount: 5,
          attemptAnsweredCount: 5,
          attemptState: 'PASSED',
          dayState: 'PASSED',
          explanation: '나무는 햇빛으로 양분을 만들어요.',
        },
      };
      body = session.lastAnswer;
    } else if (path === `/api/student/learning/sessions/${sessionId}`) body = session;
    else if (path === '/api/staff/classrooms')
      body = [{ ...classroom, canManage: true, joinCode: 'UXTEST01' }];
    else if (path.endsWith('/learning/students')) body = overview;
    else if (path.includes('/learning/students/')) body = studentDetail;
    else if (path.endsWith('/learning/questions'))
      body = { items: [question], page: 0, size: 10, total: 1 };
    else if (path.includes('/learning/questions/')) body = questionDetail;
    else if (path.endsWith('/students'))
      body = [{ accountId: 'student-a', studentNumber: 1, name: '예시 학생' }];
    else if (path === '/api/admin/teachers')
      body = [
        {
          accountId: 'teacher-a',
          name: '예시 교사',
          staffLoginId: 'example.teacher',
          mustChangePassword: false,
        },
      ];
    else throw new Error(`Unexpected UX request: ${method} ${path}`);
    await route.fulfill({ json: body });
  });
  return { requests };
}

async function sameRow(a: Locator, b: Locator) {
  // Heading focus can scroll between reads; compare document coordinates.
  await expect(async () => {
    const first = await a.evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
    const second = await b.evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
    expect(Math.abs(first - second)).toBeLessThan(5);
  }).toPass({ timeout: 5000 });
}

for (const width of [320, 390, 768, 1280]) {
  test(`student surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await scenario(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const [name, path] of Object.entries({
      home: '/student/learning',
      questions: '/student/questions',
      closet: '/student/closet',
      character: '/student/character',
      map: '/student/map',
      account: '/student/account',
      password: '/account/password',
    })) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('[role="status"]')).not.toContainText(['불러오고 있어요']);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        name,
      ).toBe(true);
      const output = evidenceOutput();
      if (output) {
        await page.screenshot({ path: output.file(`${name}-${width}.png`), fullPage: true });
        if (name === 'questions')
          await page.screenshot({ path: output.file(`questions-viewport-${width}.png`) });
      }
    }
    expect(errors).toEqual([]);
  });

  test(`learning actions remain close to their content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await scenario(page);
    await page.goto('/student/learning');
    const start = page.getByRole('button', { name: '오늘 학습 시작', exact: true });
    await expect(start).toBeInViewport({ ratio: 1 });
    await start.click();
    await expect(page.getByRole('button', { name: 'O · 사실', exact: true })).toBeInViewport({
      ratio: 1,
    });
    const source = (await page.locator('.learning-source').boundingBox())!;
    const choices = (await page.locator('.learning-choices').boundingBox())!;
    expect(choices.y - source.y - source.height).toBeLessThan(100);
    await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
    await page.getByRole('link', { name: '완료하기', exact: true }).click();
    await sameRow(
      page.getByRole('link', { name: '학습 홈으로', exact: true }),
      page.getByRole('link', { name: '나의 문제 보기', exact: true }),
    );
    const cells = page.locator('.learning-result-stats > div');
    await sameRow(cells.nth(0), cells.nth(2));
  });

  test(`teacher actions and filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await scenario(page, 'teacher');
    await page.goto('/staff/classrooms');
    await sameRow(
      page.getByRole('link', { name: '학습 통계' }),
      page.getByRole('button', { name: '명단 보기' }),
    );
    await page.getByRole('link', { name: '학습 통계' }).click();
    const search = page.getByRole('button', { name: '검색', exact: true });
    await sameRow(page.getByLabel('이름·번호 검색'), search);
    expect((await search.boundingBox())!.width).toBeLessThan(130);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const output = evidenceOutput();
    if (output)
      await page.screenshot({ path: output.file(`teacher-${width}.png`), fullPage: true });
  });
}

test('review selection stays reachable and only submits the visible queue', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await scenario(page);
  await page.goto('/student/questions');
  await sameRow(
    page.getByRole('link', { name: '다시 볼 문제', exact: true }),
    page.getByRole('link', { name: '별표한 문제', exact: true }),
  );
  await page.getByRole('button', { name: '전체 선택', exact: true }).click();
  await expect(page.getByText('선택한 문제 8개', { exact: true })).toBeVisible();
  const start = page.getByRole('button', { name: '선택한 문제 복습하기' });
  await expect(start).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: '전체 해제', exact: true }).click();
  await expect(start).toBeDisabled();
  await page.getByRole('checkbox').first().check();
  await expect(start).toBeInViewport({ ratio: 1 });
  await start.click();
  await expect
    .poll(() => state.requests.at(-1)?.body)
    .toMatchObject({ mode: 'REVIEW', questionIds: [1] });
});

test('empty lists explain the next step without a dead review action', async ({ page }) => {
  await scenario(page, 'student', true);
  await page.goto('/student/questions?filter=BOOKMARKED');
  await expect(page.getByText('아직 별표한 문제가 없어요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '선택한 문제 복습하기' })).toHaveCount(0);
});

test('home offers all rounds on demand', async ({ page }) => {
  await scenario(page);
  await page.goto('/student/learning');
  await expect(page.getByRole('button', { name: '30회차 시작하기', exact: true })).toBeHidden();
  await page.getByText('회차별 학습 보기', { exact: true }).click();
  await expect(page.getByRole('button', { name: '30회차 시작하기', exact: true })).toBeVisible();
});

test('mobile wardrobe brings the preview into reach and returns to the chosen item', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const state = await scenario(page);
  await page.goto('/student/closet');
  await page.getByRole('button', { name: '모자 장비 보기' }).click();
  const item = page.getByRole('button', { name: '작은 모자 미리보기' });
  await item.click();
  const wear = page.getByRole('button', { name: '착용하기', exact: true });
  await expect(wear).toBeInViewport({ ratio: 1 });
  await expect(wear).toBeFocused();
  await page.getByRole('button', { name: '미리보기 취소' }).click();
  await expect(item).toBeFocused();
  expect(state.requests).toHaveLength(0);
  await item.press('Enter');
  await wear.press('Enter');
  await expect.poll(() => state.requests.length).toBe(1);
  await expect(item).toBeFocused();
  await expect(item).toHaveAttribute('data-equipped', 'true');
  await page.getByRole('button', { name: '손 장비 보기' }).click();
  await page.getByRole('button', { name: '빛나는 지팡이 미리보기' }).click();
  await expect(page.getByRole('button', { name: '미리보기 취소' })).toBeInViewport({ ratio: 1 });
  await expect(wear).toHaveCount(0);
  expect(state.requests).toHaveLength(1);
});

test('signup confirms completion and carries classroom details to login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scenario(page, 'anonymous');
  await page.goto('/signup');
  await page.getByLabel('학교', { exact: true }).selectOption('school-a');
  await page.getByLabel('학년', { exact: true }).selectOption('1학년');
  await page.getByLabel('반', { exact: true }).selectOption('1');
  await page.getByLabel('번호', { exact: true }).fill('1');
  await page.getByLabel('이름', { exact: true }).fill('예시 학생');
  await page.getByLabel('별명', { exact: true }).fill('예시 친구');
  await page.getByLabel('비밀번호', { exact: true }).fill('Synthetic!2026');
  await page.getByLabel('학급 가입 코드', { exact: true }).fill('UXTEST01');
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('status')).toContainText('가입이 완료되었어요');
  await expect(page.getByLabel('학교', { exact: true })).toHaveValue('school-a');
  await expect(page.getByLabel('번호', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeEmpty();
});

for (const width of [320, 390, 768, 1280]) {
  test(`account and staff detail surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await scenario(page, 'admin');
    for (const [name, path] of Object.entries({
      teachers: '/admin/teachers',
      classrooms: '/staff/classrooms',
      student: '/staff/classrooms/class-a/learning/students/student-a',
    })) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        name,
      ).toBe(true);
      if (name === 'student') {
        await sameRow(
          page.getByRole('button', { name: '이전 페이지', exact: true }),
          page.getByRole('button', { name: '다음 페이지', exact: true }),
        );
        await sameRow(page.getByLabel('답변 회차'), page.getByLabel('답변 필터'));
      }
      const output = evidenceOutput();
      if (output)
        await page.screenshot({ path: output.file(`${name}-${width}.png`), fullPage: true });
    }
  });

  test(`public forms at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await scenario(page, 'anonymous');
    for (const [name, path] of Object.entries({
      login: '/login',
      signup: '/signup',
      stafflogin: '/staff/login',
    })) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        name,
      ).toBe(true);
      const output = evidenceOutput();
      if (output)
        await page.screenshot({ path: output.file(`${name}-${width}.png`), fullPage: true });
    }
  });
}

test('keyboard can skip navigation, select a review question, and start without scrolling the list', async ({
  page,
}) => {
  await scenario(page);
  await page.goto('/student/questions');
  const skip = page.getByRole('link', { name: '본문으로 바로가기' });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const checkbox = page.getByRole('checkbox').first();
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  const start = page.getByRole('button', { name: '선택한 문제 복습하기' });
  await start.focus();
  await expect(start).toBeInViewport({ ratio: 1 });
  expect(
    await start.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth)),
  ).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}$`));
});

test('password change offers cancellation while an issued account must complete setup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await scenario(page);
  await page.goto('/account/password');
  await sameRow(
    page.getByRole('button', { name: '비밀번호 변경', exact: true }),
    page.getByRole('link', { name: '취소', exact: true }),
  );
  await page.getByRole('link', { name: '취소', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/learning$/);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { ...teacher, mustChangePassword: true } }),
  );
  await page.goto('/account/password');
  await expect(page.getByText('처음 로그인했어요. 새 비밀번호를 정해 주세요.')).toBeVisible();
  await expect(page.getByRole('link', { name: '취소', exact: true })).toHaveCount(0);
});

test('class and roster failures can be retried where the failure appears', async ({ page }) => {
  await scenario(page, 'teacher');
  let listFailure = true;
  let rosterFailure = true;
  const failure = {
    status: 503,
    json: { code: 'UNAVAILABLE', message: '잠시 후 다시 시도해 주세요.', fieldErrors: {} },
  };
  await page.route('**/api/staff/classrooms?*', (route) =>
    route.fulfill(
      listFailure ? failure : { json: [{ ...classroom, canManage: true, joinCode: 'UXTEST01' }] },
    ),
  );
  await page.route('**/api/staff/classrooms/class-a/students', (route) =>
    route.fulfill(
      rosterFailure
        ? failure
        : { json: [{ accountId: 'student-a', studentNumber: 1, name: '예시 학생' }] },
    ),
  );
  await page.goto('/staff/classrooms');
  await expect(page.getByRole('alert')).toBeVisible();
  listFailure = false;
  await page.getByRole('button', { name: '학급 다시 불러오기' }).click();
  await page.getByRole('button', { name: '명단 보기' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  rosterFailure = false;
  await page.getByRole('button', { name: '명단 다시 불러오기' }).click();
  await expect(page.getByText('예시 학생', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('school and classroom empty states explain why selection cannot continue', async ({
  page,
}) => {
  await scenario(page, 'anonymous');
  await page.route('**/api/public/schools', (route) => route.fulfill({ json: [] }));
  await page.goto('/login');
  await expect(page.getByRole('status')).toContainText('등록된 학교가 없어요');
  await page.unroute('**/api/public/schools');
  await page.route('**/api/public/schools/school-a/classrooms', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.reload();
  await page.getByLabel('학교', { exact: true }).selectOption('school-a');
  await expect(page.getByRole('status')).toContainText('아직 등록된 학급이 없어요');
});
