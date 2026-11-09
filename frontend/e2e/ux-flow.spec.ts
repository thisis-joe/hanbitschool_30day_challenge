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
  continuing = false,
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
  const sampleQuestion = { ...question, text: '교실 창가에 화분이 놓여 있습니다.' };
  const sampleStudent = { ...overview.students.items[0], name: '예시 학생' };
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
      body = continuing
        ? { ...learningStatus, activeSession: session }
        : { ...learningStatus, nextAction: 'START_FIRST', activeSession: null };
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
    else if (path.endsWith('/learning/students'))
      body = {
        summary: { ...overview.summary, hardQuestions: [sampleQuestion] },
        students: { ...overview.students, items: [sampleStudent] },
      };
    else if (path.includes('/learning/students/'))
      body = { ...studentDetail, student: { ...studentDetail.student, name: sampleStudent.name } };
    else if (path.endsWith('/learning/questions'))
      body = { items: [sampleQuestion], page: 0, size: 10, total: 1 };
    else if (path.includes('/learning/questions/'))
      body = {
        ...questionDetail,
        question: { ...questionDetail.question, text: sampleQuestion.text },
        explanation: '화분이 놓여 있는지는 교실에서 직접 확인할 수 있어요.',
      };
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

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test(`colored travel tabs stay in one row at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await scenario(page);
    await page.goto('/student/learning');
    const brand = page.getByRole('link', { name: '사실일까? 해석일까?', exact: true });
    await expect(brand).toBeVisible();
    const nav = page.getByRole('navigation', { name: '학생 여행 메뉴' });
    const tabs = nav.getByRole('link');
    await expect(tabs).toHaveCount(4);
    const icons = await tabs.evaluateAll((links) =>
      links.map((link) => {
        const icon = link.querySelector('svg')!;
        return {
          colors: [
            ...new Set([...icon.querySelectorAll('path')].map((path) => path.getAttribute('fill'))),
          ],
          size: icon.getBoundingClientRect().width,
          height: link.getBoundingClientRect().height,
        };
      }),
    );
    expect(
      icons.every(({ colors, size, height }) => colors.length >= 3 && size === 16 && height >= 48),
    ).toBe(true);
    expect(new Set(icons.map(({ colors }) => colors.join())).size).toBe(4);
    await sameRow(tabs.first(), tabs.last());
    const output = evidenceOutput();
    if (output) await page.screenshot({ path: output.file(`travel-header-${viewport.width}.png`) });
    const map = nav.getByRole('link', { name: '탐험', exact: true });
    await map.click();
    await expect(map).toHaveAttribute('aria-current', 'page');
    await expect(map).toHaveCSS('background-color', 'rgb(194, 217, 231)');
    await expect(page.getByRole('region', { name: '탐험 경로', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
  for (const continuing of [false, true]) {
    test(`primary learning action fits at ${viewport.width}px (continuing=${continuing})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await scenario(page, 'student', false, continuing);
      await page.goto('/student/learning');
      const action = continuing
        ? page.getByRole('link', { name: '이어풀기', exact: true })
        : page.getByRole('button', { name: '오늘 학습 시작', exact: true });
      await expect(action).toBeInViewport({ ratio: 1, timeout: 2000 });
      expect(
        await action.evaluate((el) => {
          const column = el.closest('.game-camp-copy')!.getBoundingClientRect();
          const button = el.getBoundingClientRect();
          return Math.abs(button.left + button.width / 2 - (column.left + column.width / 2));
        }),
      ).toBeLessThan(1);
      const output = evidenceOutput();
      if (output) {
        const state = continuing ? 'resume' : 'start';
        await page.screenshot({ path: output.file(`home-${viewport.width}-${state}.png`) });
      }
    });
  }
}

test('a confirmed answer presents the reason before routine XP', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scenario(page);
  await page.goto(`/student/learning/sessions/${sessionId}`);
  await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
  const explanation = page.getByText('나무는 햇빛으로 양분을 만들어요.');
  const reward = page.getByRole('status', { name: /받은 경험치/ });
  await expect(page.getByText('정답은 O · 사실')).toBeVisible({ timeout: 2000 });
  await expect(explanation).toBeInViewport({ ratio: 1 });
  await expect(reward).toBeVisible();
  expect((await explanation.boundingBox())!.y).toBeLessThan((await reward.boundingBox())!.y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const output = evidenceOutput();
  if (output) await page.screenshot({ path: output.file('answer-reason-390.png') });
  await page.getByRole('link', { name: '완료하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '회차 통과', exact: true })).toBeVisible();
});

test('teacher decisions are reachable on the first small screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await scenario(page, 'teacher');
  await page.goto('/staff/classrooms/class-a/learning');
  const tabs = page.getByRole('navigation', { name: '통계 종류' });
  await expect(tabs.getByRole('button', { name: '학생 현황' })).toBeInViewport({
    ratio: 1,
    timeout: 2000,
  });
  await expect(tabs.getByRole('button', { name: '문항 분석' })).toBeInViewport({ ratio: 1 });
  const newStudents = page.getByRole('button', { name: '미참여 학생 보기' });
  await expect(newStudents).toBeInViewport({ ratio: 1 });
  const output = evidenceOutput();
  if (output) await page.screenshot({ path: output.file('teacher-first-screen-320.png') });
  await newStudents.click();
  await expect(page.getByLabel('학생 상태')).toHaveValue('NEW');
  await tabs.getByRole('button', { name: '문항 분석' }).click();
  const table = page.getByRole('table', { name: '문항 분석', exact: true });
  await expect(table.getByText('오답 2 / 응답 3명')).toBeVisible();
  expect(await table.evaluate((el) => el.parentElement!.scrollWidth)).toBeLessThanOrEqual(
    await table.evaluate((el) => el.parentElement!.clientWidth),
  );
  const trigger = table.getByRole('button', { name: '7번 문항 상세' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '7번 문항 상세' });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button', { name: '닫기' });
  await expect(close).toBeFocused();
  await expect(dialog.getByRole('heading', { name: '해설', exact: true })).toBeVisible();
  if (output) await page.screenshot({ path: output.file('teacher-window-320.png') });
  const body = dialog.locator('.stats-dialog-body');
  await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(close).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('teacher returns to the selected student and list settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scenario(page, 'teacher');
  await page.goto(
    '/staff/classrooms/class-a/learning?search=예시&status=IN_PROGRESS&sort=PENDING_WRONG_DESC',
  );
  const studentLink = page.getByRole('link', { name: /학생 상세/ });
  await studentLink.click();
  await page.getByRole('link', { name: '목록으로 돌아가기' }).click();
  await expect(page.getByLabel('이름·번호 검색')).toHaveValue('예시');
  await expect(page.getByLabel('학생 상태')).toHaveValue('IN_PROGRESS');
  await expect(page.getByLabel('학생 정렬')).toHaveValue('PENDING_WRONG_DESC');
  await expect(studentLink).toBeFocused({ timeout: 2000 });
  await expect(studentLink).toBeInViewport();
  const status = page.getByLabel('학생 상태');
  await status.focus();
  await status.selectOption('ALL');
  await expect(status).toBeFocused();
});

for (const width of [320, 390, 768, 1280]) {
  test(`student surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await scenario(page, 'student', false, width === 390);
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
      const heading = page.locator('main h1');
      if (['map', 'closet', 'questions'].includes(name))
        await expect(heading).toHaveCSS('clip-path', 'inset(50%)');
      else await expect(heading).toBeVisible();
      if (name === 'home' && width === 390)
        await expect(page.getByRole('link', { name: '이어풀기', exact: true })).toBeVisible();
      if (name === 'closet') {
        const preview = page.getByRole('region', { name: '외형 미리보기' });
        await expect(preview.getByRole('link', { name: '캐릭터 선택' })).toHaveAttribute(
          'href',
          '/student/character',
        );
        await expect(preview.getByText('나의 여행 친구', { exact: true })).toHaveCount(0);
        await expect(page.getByText('장비 벗기', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: '얼굴 장비 보기' })).toBeInViewport();
      }
      if (name === 'map' || name === 'closet') {
        const screenHeight = await page.evaluate(() => ({
          document: document.documentElement.scrollHeight,
          viewport: innerHeight,
        }));
        expect(screenHeight.document).toBeLessThanOrEqual(screenHeight.viewport);
      }
      if (name === 'questions') {
        await expect(page.getByRole('link', { name: '학습 홈으로', exact: true })).toHaveCount(0);
        await expect(
          page.getByRole('link', { name: '진행 중인 학습 이어풀기', exact: true }),
        ).toHaveCount(0);
        const card = page
          .getByRole('list', { name: '개인 문제 목록' })
          .getByRole('listitem')
          .first();
        const text = (await card.locator('.learning-personal-heading').boundingBox())!;
        for (const action of ['별표', '다시 볼 목록에서 제거']) {
          const button = (await card.getByRole('button', { name: action }).boundingBox())!;
          expect(button.x).toBeGreaterThanOrEqual(text.x + text.width);
          expect(button.height).toBeGreaterThanOrEqual(48);
        }
      }
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
    const choices = (await page
      .getByRole('button', { name: 'O · 사실', exact: true })
      .boundingBox())!;
    const scene = (await page.getByRole('region', { name: '학습 여행 장면' }).boundingBox())!;
    expect(source.y).toBeGreaterThan(scene.y);
    expect(choices.y).toBeGreaterThan(source.y + source.height);
    expect(choices.y + choices.height).toBeLessThan(scene.y + scene.height);
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

test('home keeps learning focused without round cards', async ({ page }) => {
  await scenario(page);
  await page.route('**/api/student/learning/status', (route) =>
    route.fulfill({
      json: {
        ...learningStatus,
        calendarCap: 2,
        earliestUnpassedDay: 2,
        passedDayCount: 1,
        nextAction: 'START_FIRST',
        activeSession: null,
      },
    }),
  );
  await page.goto('/student/learning');
  await expect(page.getByRole('button', { name: '오늘 학습 시작', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '회차별 학습' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '회차별 학습 보기' })).toHaveCount(0);
  const gift = page.getByRole('complementary', { name: '다음 여행 선물' });
  await expect(gift).toContainText('작은 모자');
  await expect(gift).not.toContainText('첫 통과');
  await expect(gift).toHaveCSS('text-align', 'center');
  await expect(gift.locator('svg')).toHaveAttribute('shape-rendering', 'crispEdges');
  await expect(page.locator('.game-home-page > :last-child')).toHaveClass(/game-home-stats/);
  await expect(page.getByText('나의 여행 친구', { exact: true })).toHaveCount(0);
  const campScene = page.locator('.game-camp-scene');
  const replay = page.getByText('다시풀기', { exact: true });
  const replayButton = page.getByRole('button', { name: '선택 회차 다시 풀기' });
  const replayDay = page.getByRole('combobox', { name: '다시 풀 회차' });
  const sceneGeometry = () =>
    campScene.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [box.width, box.height, box.top + scrollY];
    });
  const output = evidenceOutput();
  for (const width of [1280, 320, 390, 720, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const closedScene = await sceneGeometry();
    await expect(replayButton).toBeHidden();
    const closedGap = await replay.evaluate((el) => {
      const copy = el.closest('.game-camp-copy')!.getBoundingClientRect();
      return copy.bottom - el.getBoundingClientRect().bottom;
    });
    expect(closedGap).toBeLessThanOrEqual(width <= 720 ? 24 : 40);
    if (output && [390, 1280].includes(width))
      await page.screenshot({ path: output.file(`home-closed-${width}.png`), fullPage: true });
    await replay.press('Enter');
    await expect(replayButton).toBeEnabled();
    expect(await sceneGeometry()).toEqual(closedScene);

    const select = (await replayDay.boundingBox())!;
    const button = (await replayButton.boundingBox())!;
    const camp = (await page.locator('.game-camp-copy').boundingBox())!;
    const left = Math.min(select.x, button.x);
    const right = Math.max(select.x + select.width, button.x + button.width);
    expect(Math.abs((left + right) / 2 - (camp.x + camp.width / 2))).toBeLessThan(1);
    if (width !== 768)
      expect(Math.abs(select.y + select.height / 2 - (button.y + button.height / 2))).toBeLessThan(
        1,
      );
    if (output && [390, 1280].includes(width))
      await page.screenshot({ path: output.file(`home-replay-${width}.png`), fullPage: true });

    await replay.press('Enter');
    await expect(replayButton).toBeHidden();
    expect(await sceneGeometry()).toEqual(closedScene);
    await expect(gift).toBeVisible();
    const giftLayout = await gift.evaluate((el) => {
      const scene = el.closest('.game-camp-scene')!.getBoundingClientRect();
      const gift = el.getBoundingClientRect();
      return { right: scene.right - gift.right, top: gift.top - scene.top, width: gift.width };
    });
    expect(giftLayout.right).toBeGreaterThanOrEqual(8);
    expect(giftLayout.right).toBeLessThanOrEqual(16);
    expect(giftLayout.top).toBeGreaterThanOrEqual(8);
    expect(giftLayout.top).toBeLessThanOrEqual(16);
    expect(giftLayout.width).toBeGreaterThanOrEqual(width === 320 ? 130 : width < 721 ? 165 : 240);
    const edgeOffsets = await page
      .getByRole('navigation', { name: '학생 여행 메뉴' })
      .evaluate((el) => {
        const header = document.querySelector('header')!.getBoundingClientRect();
        const nav = el.getBoundingClientRect();
        return [nav.left - header.left, nav.right - header.right];
      });
    expect(edgeOffsets).toEqual([0, 0]);
    const paintCoverage = await campScene.evaluate((el) => {
      const imageWidth = parseFloat(getComputedStyle(el, '::before').backgroundSize);
      const floor = parseFloat(getComputedStyle(el).getPropertyValue('--scene-ground'));
      return [imageWidth - el.clientWidth, (imageWidth * 376) / 768 - (el.clientHeight - floor)];
    });
    for (const coverage of paintCoverage) expect(coverage).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await expect(page.getByRole('heading', { name: '오늘의 탐험', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '나의 학습', exact: true })).toHaveCount(0);
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
      if (name === 'stafflogin') {
        const brand = page.getByRole('link', { name: '사실일까? 해석일까?' }).locator('img');
        await expect
          .poll(() => brand.evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBe(24);
        await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
          'href',
          '/brand/school-mark.svg',
        );
        const loaded = await page.evaluate(async () => {
          const fonts = await Promise.all([
            document.fonts.load('400 16px Galmuri11', '학생 로그인'),
            document.fonts.load('700 16px Galmuri11', '교직원 로그인'),
          ]);
          return fonts.every((faces) => faces.some((face) => face.status === 'loaded'));
        });
        expect(loaded).toBe(true);
        const submit = (await page
          .getByRole('button', { name: '로그인', exact: true })
          .boundingBox())!;
        const back = (await page
          .getByRole('link', { name: '학생 로그인으로 돌아가기' })
          .boundingBox())!;
        expect(back.y - (submit.y + submit.height)).toBeGreaterThanOrEqual(24);
        expect(back.height).toBeGreaterThanOrEqual(44);
      }
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
