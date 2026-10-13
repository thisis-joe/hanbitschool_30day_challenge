import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signOut, staffLogin, studentLogin } from './helpers';
import {
  provisionLearningClass,
  learningCommand,
  answerApi,
  start,
  finishDay,
  answer,
  advance,
  resultPage,
  personal,
  session,
  status,
  isolatedSql,
  restartOwnedBackend,
  layoutAndTargets,
  visibleFocus,
  captureSanitizedResultProof,
  protectedEqual,
  protectedText,
} from './learning-helpers';
import { evidenceOutput } from './evidence-output';
import type { ClassroomSummary } from '../src/features/staff/types';
import type { GameView, JourneyView } from '../src/features/game/types';
import type { LearningSessionView } from '../src/features/learning/types';
import type {
  TeacherStudentsPage,
  TeacherStudentDetail,
  TeacherQuestionDetail,
  PageResult,
  TeacherQuestionRow,
} from '../src/features/staff/learning/types';

type Fixture = Awaited<ReturnType<typeof provisionLearningClass>>;
const base = (c: Fixture) => `/api/staff/classrooms/${c.classroomId}/learning`;
const route = (c: Fixture) => `/staff/classrooms/${c.classroomId}/learning`;
async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  const data = await response.json();
  // Walk keys only: failing diagnostics must never print private values or DTO bodies.
  const keys: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        keys.push(key.toLowerCase());
        walk(child);
      }
    }
  };
  walk(data);
  if (path.startsWith('/api/staff/') && path.includes('/learning/')) {
    expect(keys.some((key) => /queue|bookmark|reason|lastanswer|password|joincode/.test(key))).toBe(
      false,
    );
  }
  return data as T;
}
const overview = (page: Page, c: Fixture, query = '') =>
  get<TeacherStudentsPage>(page, base(c) + '/students' + query);
async function teacher(page: Page, c: Fixture) {
  await staffLogin(page, c.staffLoginId, c.staffPassword);
  await page.goto(route(c));
  await expect(page.getByRole('region', { name: '학급 요약', exact: true })).toBeVisible();
  await headingFocused(page);
}
async function headingFocused(page: Page) {
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName === 'H1')).toBe(true);
}
async function modalReleased(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !document.querySelector('[role="dialog"]') &&
          !document.querySelector('#root')?.hasAttribute('inert') &&
          !document.querySelector('#root')?.hasAttribute('aria-hidden') &&
          document.body.style.overflow !== 'hidden',
      ),
    )
    .toBe(true);
}
async function firstFour(page: Page) {
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  await finishDay(page, first, [false, true, true, true, true]);
  return first;
}
async function improve(page: Page, first: LearningSessionView) {
  await resultPage(page, first.sessionId, '회차 통과');
  await page.getByRole('link', { name: '나의 문제 보기', exact: true }).click();
  const row = page.getByRole('listitem').filter({ hasText: '1회차 · 문항 1' });
  await row.getByRole('button', { name: '별표', exact: true }).click();
  await row.getByRole('checkbox', { name: '복습할 문제 선택', exact: true }).check();
  const review = await start(
    page,
    page.getByRole('button', { name: '선택한 문제 복습하기', exact: true }),
    'REVIEW',
    null,
  );
  await answer(page, review, true);
  await resultPage(page, review.sessionId, '복습 풀이를 마쳤어요');
  await page.goto('/student/learning');
  const replay = await start(
    page,
    page.getByRole('button', { name: '1회차 다시 풀기', exact: true }),
    'REPLAY',
    1,
  );
  await answer(page, replay, false);
  await page.getByRole('button', { name: '추가하기', exact: true }).click();
  await expect(page.getByText('다시 볼 문제로 추가할까요?', { exact: true })).toHaveCount(0);
  await finishDay(page, await advance(page, replay.sessionId), [true, true, true, true]);
  await resultPage(page, replay.sessionId, '회차 통과');
  // USER queue is private and survives a further correct REVIEW even with immutable mastery.
  const reviewAgain = await learningCommand<LearningSessionView>(page, '/sessions', {
    mode: 'REVIEW',
    dayNumber: null,
    questionIds: [1],
    requestId: randomUUID(),
  });
  await answerApi(page, reviewAgain, true);
  const retained = (await personal(page, 'REVIEW_QUEUE')).find((q) => q.questionId === 1);
  expect(
    Boolean(
      retained?.mastered &&
      retained.bookmarked &&
      retained.inReviewQueue &&
      retained.lastOutcome === 'CORRECT',
    ),
  ).toBe(true);
}
function summaryIsFour(data: TeacherStudentsPage, improved = false) {
  const s = data.summary;
  protectedEqual(
    [
      s.studentCount,
      s.participatingCount,
      s.answered,
      s.correct,
      s.wrong,
      s.unanswered,
      s.accuracy,
      s.reviewedWrong,
      s.pendingWrong,
    ],
    [2, 1, 5, 4, 1, 295, 0.8, improved ? 1 : 0, improved ? 0 : 1],
  );
}
async function teacherLayout(page: Page, surface: string) {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const m = await page.evaluate(() => {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.teacher-stats button, .teacher-stats a, .teacher-stats input, .teacher-stats select, .stats-dialog button, .stats-dialog a, .site-header a, .site-header button',
        ),
      )
        .filter((e) => e.getClientRects().length && !e.closest('[inert]'))
        .map((e) => {
          const r = e.getBoundingClientRect();
          const category = e.closest('.site-header')
            ? 'staff-header'
            : e.closest('.stats-dialog')
              ? 'question-dialog'
              : e.closest('.stats-table-scroll')
                ? 'table-control'
                : e.closest('.stats-day-grid')
                  ? 'day-control'
                  : e.closest('.stats-filters')
                    ? 'filter-control'
                    : e.closest('.stats-neighbors')
                      ? 'student-neighbor'
                      : e.closest('.stats-pagination')
                        ? 'page-control'
                        : 'statistics-navigation';
          return { category, tag: e.tagName.toLowerCase(), width: r.width, height: r.height };
        });
      return {
        overflow:
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        targets,
      };
    });
    expect(m.overflow).toBeLessThanOrEqual(0);
    expect(m.targets.length).toBeGreaterThan(0);
    expect(m.targets.filter((target) => target.width < 48 || target.height < 48)).toEqual([]);
    const output = evidenceOutput();
    if (output) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(
        output.file('teacher-layout.jsonl'),
        JSON.stringify({
          surface,
          width,
          overflow: m.overflow,
          targetCount: m.targets.length,
          minimumWidth: Math.min(...m.targets.map((target) => target.width)),
          minimumHeight: Math.min(...m.targets.map((target) => target.height)),
        }) + '\n',
      );
      // Temporary reviewer image, no names, canonical content, IDs or auth/header text.
      await page
        .locator('.stats-dialog, .teacher-stats')
        .last()
        .screenshot({
          path: output.file(`teacher-${surface}-${width}.png`),
          animations: 'disabled',
          style:
            '.stats-header, .stats-student span, .stats-student-heading h1, .stats-question-text span, .stats-dialog-question, .stats-explanation, .stats-respondents, .stats-eyebrow, time, table[aria-label="학생 첫 답변"] tbody td { visibility: hidden !important; } .stats-filters input { color: transparent !important; text-shadow: none !important; }',
        });
    }
  }
}
async function seedRoster(c: Fixture) {
  isolatedSql(
    `DO $$ DECLARE n integer; a uuid; BEGIN FOR n IN 3..25 LOOP a := gen_random_uuid(); INSERT INTO accounts(id,school_id,role,name,password_hash) SELECT a,school_id,'STUDENT','합성학생'||n,password_hash FROM accounts WHERE id='${c.studentIds[0]}'; INSERT INTO student_profiles(account_id,classroom_id,student_number,nickname) VALUES(a,'${c.classroomId}',n,'합성친구'); END LOOP; END $$;`,
  );
}

// Catches first facts rewritten by REVIEW/REPLAY and private queue counts exposed as pendingWrong.
test('teacherClassShowsActualFirstAnswerAndReviewImprovement', async ({ page, browser }) => {
  const c = await provisionLearningClass(page, 2);
  const first = await firstFour(page);
  const staff = await browser.newPage();
  try {
    await teacher(staff, c);
    summaryIsFour(await overview(staff, c));
    await protectedText(staff.getByRole('region', { name: '학급 요약' }), '미응답 295개', {
      contains: true,
    });
    await protectedText(staff.getByRole('region', { name: '학급 요약' }), '80%', {
      contains: true,
    });
    await improve(page, first);
    await staff.reload();
    const data = await overview(staff, c);
    summaryIsFour(data, true);
    await protectedText(staff.getByRole('region', { name: '학급 요약' }), '복습 개선 1개', {
      contains: true,
    });
    await protectedText(staff.getByRole('region', { name: '학급 요약' }), '80%', {
      contains: true,
    });
    await teacherLayout(staff, 'overview');
    // First wrong and correct respondents both link back into the same class.
    await staff.getByRole('button', { name: '문항 분석', exact: true }).click();
    const origin = new URL(staff.url()).pathname + new URL(staff.url()).search;
    for (const question of [1, 2]) {
      await staff.getByRole('button', { name: `${question}번 문항 상세`, exact: true }).click();
      const dialog = staff.getByRole('dialog');
      const link = dialog.getByRole('link');
      protectedEqual(await link.getAttribute('href'), `${route(c)}/students/${c.studentIds[0]}`);
      await link.click();
      await modalReleased(staff);
      await headingFocused(staff);
      protectedEqual(
        await staff
          .getByRole('link', { name: '목록으로 돌아가기', exact: true })
          .getAttribute('href'),
        origin,
      );
      await staff.getByRole('link', { name: '목록으로 돌아가기', exact: true }).click();
      await headingFocused(staff);
    }
  } finally {
    await staff.close();
  }
});

// Catches filtered/paged denominators, hard threshold weakened to one participant and unstable order.
test('filteredTeacherRosterDoesNotAlterSummaryOrHardQuestions', async ({ page }) => {
  const c = await provisionLearningClass(page, 2);
  await firstFour(page);
  await signOut(page);
  await teacher(page, c);
  expect((await overview(page, c)).summary.hardQuestions.length).toBe(0); // threshold min(3,2)=2, answered1
  await seedRoster(c);
  for (const number of [3, 4]) {
    await signOut(page);
    await studentLogin(page, '한빛학교', c.gradeLabel, 1, number, 'Student!2026');
    const view = await learningCommand<LearningSessionView>(page, '/sessions', {
      mode: 'FIRST',
      dayNumber: 1,
      questionIds: null,
      requestId: randomUUID(),
    });
    await answerApi(page, view, false);
  }
  await signOut(page);
  await teacher(page, c);
  const whole = await overview(page, c);
  protectedEqual(
    [
      whole.summary.studentCount,
      whole.summary.answered,
      whole.summary.correct,
      whole.summary.unanswered,
    ],
    [25, 7, 4, 3743],
  );
  protectedEqual(
    whole.summary.hardQuestions.map((q) => [q.questionId, q.answered, q.wrong, q.wrongRate]),
    [[1, 3, 3, 1]],
  );
  protectedEqual(
    whole.students.items.map((s) => s.studentNumber),
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.getByRole('link', { name: '21번 합성학생21 학생 상세' })).toBeVisible();
  const second = await overview(page, c, '?page=1');
  protectedEqual(
    second.students.items.map((s) => s.studentNumber),
    [21, 22, 23, 24, 25],
  );
  protectedEqual(second.summary, whole.summary);
  await page.getByRole('link', { name: '21번 합성학생21 학생 상세', exact: true }).click();
  await headingFocused(page);
  await protectedText(page.getByRole('navigation', { name: '학급 학생 이동' }), '21 / 25', {
    contains: true,
  });
  await page.getByRole('link', { name: '이전 학생', exact: true }).click();
  await expect(page.getByRole('heading', { name: '20번 합성학생20', exact: true })).toBeVisible();
  await headingFocused(page);
  await page.getByRole('link', { name: '다음 학생', exact: true }).click();
  await expect(page.getByRole('heading', { name: '21번 합성학생21', exact: true })).toBeVisible();
  await headingFocused(page);
  await page.getByRole('link', { name: '목록으로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(/\?page=1$/);
  await expect(
    page.getByRole('link', { name: '21번 합성학생21 학생 상세', exact: true }),
  ).toBeVisible();
  await page.getByLabel('학생 상태', { exact: true }).focus();
  expect(
    await page
      .getByLabel('학생 상태', { exact: true })
      .evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await page.getByLabel('학생 상태', { exact: true }).selectOption('NEW');
  await protectedText(page.getByRole('table', { name: '학생 학습 현황' }), '검색 결과 22명', {
    contains: true,
  });
  expect(
    await page
      .getByLabel('학생 상태', { exact: true })
      .evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await page.getByLabel('이름·번호 검색').fill('21');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await protectedText(page.getByRole('table', { name: '학생 학습 현황' }), '검색 결과 1명', {
    contains: true,
  });
  const filtered = await overview(page, c, '?search=21&status=NEW');
  protectedEqual(
    filtered.students.items.map((s) => s.studentNumber),
    [21],
  );
  protectedEqual(filtered.summary, whole.summary);
  await protectedText(page.getByRole('region', { name: '어려운 문항 TOP 3' }), '오답률 100%', {
    contains: true,
  });
  const progress = await overview(page, c, '?sort=PROGRESS_ASC');
  expect(progress.students.items[0].studentNumber).toBe(2);
  const pending = await overview(page, c, '?sort=PENDING_WRONG_DESC');
  protectedEqual(
    pending.students.items.slice(0, 3).map((s) => s.studentNumber),
    [1, 3, 4],
  );
  await teacherLayout(page, 'filtered');
});

// Catches overwritten first wrong, detail pagination truncating days and neighbors tied to filtered list.
test('studentDetailCrossesPagesAndPreservesFirstWrongAfterReview', async ({ page }) => {
  const c = await provisionLearningClass(page, 2);
  const first = await firstFour(page);
  await improve(page, first);
  await page.goto('/student/learning');
  const second = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    2,
  );
  await finishDay(page, second, [true, true, true, true, true]);
  await signOut(page);
  await teacher(page, c);
  await seedRoster(c);
  await page.getByLabel('이름·번호 검색').fill('김민수');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('link', { name: '1번 김민수 학생 상세' }).click();
  await protectedText(page.getByRole('table', { name: '학생 첫 답변' }), '선택 오답', {
    contains: true,
  });
  await protectedText(page.getByRole('table', { name: '학생 첫 답변' }), '개선됨', {
    contains: true,
  });
  const detail = await get<TeacherStudentDetail>(
    page,
    base(c) + `/students/${c.studentIds[0]}?filter=WRONG`,
  );
  protectedEqual(
    detail.answers.items.map((a) => [a.questionId, a.outcome, a.reviewedWrong]),
    [[1, 'WRONG', true]],
  );
  protectedEqual(
    [
      detail.days.length,
      detail.days[0].state,
      detail.days[1].state,
      detail.ordinal,
      detail.totalStudents,
      detail.nextStudentId,
    ],
    [30, 'PASSED', 'PASSED', 1, 25, c.studentIds[1]],
  );
  const firstQuestion = page.getByRole('button', { name: '1번 문항 상세', exact: true });
  await firstQuestion.click();
  const firstDialog = page.getByRole('dialog', { name: '1번 문항 상세', exact: true });
  await protectedText(firstDialog, '첫 응답 1명', { contains: true });
  await protectedText(firstDialog, '선택 오답 1명 · 시간초과 0명', { contains: true });
  await page.keyboard.press('Escape');
  await expect(firstDialog).toHaveCount(0);
  await expect(firstQuestion).toBeFocused();
  // A respondent reached through student detail retains the filtered roster origin.
  const rosterOrigin = await page
    .getByRole('link', { name: '목록으로 돌아가기', exact: true })
    .getAttribute('href');
  await firstQuestion.click();
  await firstDialog.getByRole('link').click();
  await modalReleased(page);
  protectedEqual(
    await page.getByRole('link', { name: '목록으로 돌아가기', exact: true }).getAttribute('href'),
    rosterOrigin,
  );
  await page.getByLabel('답변 필터', { exact: true }).selectOption('ALL');
  await protectedText(page.getByRole('table', { name: '학생 첫 답변' }), '문항 10개', {
    contains: true,
  });
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.getByRole('button', { name: '9번 문항 상세' })).toBeVisible();
  const next = await get<TeacherStudentDetail>(
    page,
    base(c) + `/students/${c.studentIds[0]}?filter=ALL&page=1`,
  );
  protectedEqual(
    next.answers.items.map((a) => a.questionId),
    [9, 10],
  );
  expect(next.days.length).toBe(30);
  // Self navigation must keep the paged answer trigger available for focus restoration.
  const pagedOrigin = new URL(page.url()).pathname + new URL(page.url()).search;
  const pagedQuestion = page.getByRole('button', { name: '9번 문항 상세', exact: true });
  await pagedQuestion.focus();
  await page.keyboard.press('Enter');
  const selfRespondent = page.getByRole('dialog').getByRole('link');
  protectedEqual(await selfRespondent.getAttribute('href'), pagedOrigin);
  await selfRespondent.focus();
  await page.keyboard.press('Enter');
  await modalReleased(page);
  protectedEqual(new URL(page.url()).pathname + new URL(page.url()).search, pagedOrigin);
  expect(await pagedQuestion.evaluate((element) => element === document.activeElement)).toBe(true);
  await teacherLayout(page, 'student');
  await page.getByRole('link', { name: '다음 학생', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2번 합성둘', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '목록으로 돌아가기', exact: true }).click();
  await protectedText(page.getByLabel('이름·번호 검색'), '김민수', { value: true });
});

// Catches server timeout shown as untouched, omitted wrong respondents and broken modal focus lifecycle.
test('teacherQuestionDialogShowsTimeoutSeparateFromUntouched', async ({ page }) => {
  const c = await provisionLearningClass(page, 2);
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  await expect
    .poll(async () => (await session(page, first.sessionId)).lastAnswer?.outcome, {
      timeout: 25000,
      intervals: [250, 500, 1000],
    })
    .toBe('TIMED_OUT');
  await signOut(page);
  await teacher(page, c);
  await page.getByRole('button', { name: '문항 분석', exact: true }).click();
  const questions = await get<PageResult<TeacherQuestionRow>>(
    page,
    base(c) + '/questions?sort=TIMEOUT_DESC',
  );
  protectedEqual(
    [
      questions.items[0].questionId,
      questions.items[0].timedOut,
      questions.items[0].unanswered,
      questions.items[0].wrongRate,
    ],
    [1, 1, 1, 1],
  );
  const trigger = page.getByRole('button', { name: '1번 문항 상세', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '1번 문항 상세', exact: true });
  await expect(dialog).toBeVisible();
  const data = await get<TeacherQuestionDetail>(page, base(c) + '/questions/1');
  protectedEqual(
    [
      data.correct.length,
      data.wrong.length,
      data.unanswered,
      data.question.choiceWrong,
      data.question.timedOut,
      data.wrong[0].firstChoice,
      data.wrong[0].outcome,
    ],
    [0, 1, 1, 0, 1, null, 'TIMED_OUT'],
  );
  await protectedText(dialog, '미응답 1명 · 선택 오답 0명 · 시간초과 1명', { contains: true });
  await protectedText(dialog.locator('.stats-dialog-question'), data.question.text);
  await protectedText(dialog.locator('.stats-explanation p'), data.explanation);
  const close = dialog.getByRole('button', { name: '닫기', exact: true });
  await visibleFocus(close);
  const respondent = dialog.getByRole('link');
  await page.keyboard.press('Shift+Tab');
  expect(await respondent.evaluate((element) => element === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await respondent.evaluate((element) => element === document.activeElement)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await teacherLayout(page, 'dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const origin = new URL(page.url()).pathname + new URL(page.url()).search;
  await trigger.click();
  protectedEqual(await respondent.getAttribute('href'), `${route(c)}/students/${c.studentIds[0]}`);
  await respondent.focus();
  await page.keyboard.press('Enter');
  await modalReleased(page);
  await headingFocused(page);
  protectedEqual(
    await page.getByRole('link', { name: '목록으로 돌아가기', exact: true }).getAttribute('href'),
    origin,
  );
  await page.getByRole('link', { name: '목록으로 돌아가기', exact: true }).click();
  await headingFocused(page);
  await teacherLayout(page, 'questions');
  await page.getByLabel('문항 회차', { exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: '6번 문항 상세' })).toBeVisible();
  const day = await get<PageResult<TeacherQuestionRow>>(
    page,
    base(c) + '/questions?day=2&sort=QUESTION_ASC',
  );
  protectedEqual(
    day.items.map((q) => q.questionId),
    [6, 7, 8, 9, 10],
  );
  protectedEqual(
    day.items.map((q) => [q.answered, q.wrongRate, q.unanswered]),
    [
      [0, null, 2],
      [0, null, 2],
      [0, null, 2],
      [0, null, 2],
      [0, null, 2],
    ],
  );
  await expect(
    page.getByRole('table', { name: '문항 분석' }).getByRole('cell').filter({ hasText: /^—$/ }),
  ).toHaveCount(5);
  const untouched = await get<TeacherStudentDetail>(
    page,
    base(c) + `/students/${c.studentIds[1]}?filter=UNANSWERED`,
  );
  protectedEqual([untouched.answers.total, untouched.days.length], [150, 30]);
  expect(
    untouched.answers.items.every(
      (row) =>
        row.outcome === 'UNANSWERED' && row.firstChoice === null && row.firstAnsweredAt === null,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '6번 문항 상세', exact: true }).click();
  const unanswered = page.getByRole('dialog', { name: '6번 문항 상세', exact: true });
  await protectedText(unanswered, '미응답 2명 · 선택 오답 0명 · 시간초과 0명', { contains: true });
  await page.keyboard.press('Escape');
});

// Catches another school's authenticated changed-password principal or a learner reading staff facts.
test('anotherSchoolAndStudentCannotReadLearningStats', async ({ page }) => {
  const c = await provisionLearningClass(page, 2);
  for (const path of ['/students', `/students/${c.studentIds[0]}`, '/questions', '/questions/1'])
    expect((await page.request.get(base(c) + path)).status()).toBe(403);
  await signOut(page);
  for (const path of ['/students', `/students/${c.studentIds[0]}`, '/questions', '/questions/1'])
    expect((await page.request.get(base(c) + path)).status()).toBe(401);
  await teacher(page, c);
  const otherClass = randomUUID();
  isolatedSql(
    `INSERT INTO classrooms(id,school_id,grade_label,class_number,join_code,start_date) SELECT '${otherClass}',school_id,'동학교'||substring('${otherClass}',1,6),1,'${randomUUID().replaceAll('-', '').slice(0, 8)}',current_date FROM classrooms WHERE id='${c.classroomId}';`,
  );
  const sameSchool = await get<TeacherStudentsPage>(
    page,
    `/api/staff/classrooms/${otherClass}/learning/students`,
  );
  expect(sameSchool.summary.studentCount).toBe(0);
  const mismatch = await page.request.get(
    `/api/staff/classrooms/${otherClass}/learning/students/${c.studentIds[0]}`,
  );
  expect(mismatch.status()).toBe(403);
  expect((await mismatch.json()).code).toBe('FORBIDDEN');
  const school = randomUUID(),
    classroom = randomUUID(),
    staff = randomUUID(),
    login = 'foreign.' + randomUUID().slice(0, 12);
  // Isolated SQL only: copy a fresh changed-password hash, never credentials or existing validation rows.
  isolatedSql(
    `BEGIN; INSERT INTO schools(id,name) VALUES('${school}','새합성학교'); INSERT INTO accounts(id,school_id,role,name,staff_login_id,password_hash,must_change_password,password_version) SELECT '${staff}','${school}','TEACHER','타학교합성교사','${login}',password_hash,false,password_version FROM accounts WHERE staff_login_id='${c.staffLoginId}'; INSERT INTO classrooms(id,school_id,grade_label,class_number,join_code,start_date) VALUES('${classroom}','${school}','합성',1,'${randomUUID().replaceAll('-', '').slice(0, 8)}',current_date); INSERT INTO classroom_teachers VALUES('${classroom}','${staff}'); COMMIT;`,
  );
  await signOut(page);
  await staffLogin(page, login, c.staffPassword);
  const me = await get<{ schoolId: string; mustChangePassword: boolean }>(page, '/api/auth/me');
  protectedEqual([me.schoolId, me.mustChangePassword], [school, false]);
  protectedEqual(
    (await get<ClassroomSummary[]>(page, '/api/staff/classrooms?scope=SCHOOL')).map((x) => x.id),
    [classroom],
  );
  for (const path of ['/students', `/students/${c.studentIds[0]}`, '/questions', '/questions/1']) {
    const response = await page.request.get(base(c) + path);
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  }
  await page.goto(route(c));
  await expect(page.getByRole('region', { name: '학급 요약' })).toHaveCount(0);
});

// Catches an old class/owner result published after a route or logout transition.
test('logoutAndClassSwitchClearPreviousStats', async ({ page }) => {
  const c = await provisionLearningClass(page, 2);
  await firstFour(page);
  await signOut(page);
  await teacher(page, c);
  const empty = randomUUID();
  isolatedSql(
    `INSERT INTO classrooms(id,school_id,grade_label,class_number,join_code,start_date) SELECT '${empty}',school_id,'빈합성'||substring('${empty}',1,6),1,'${randomUUID().replaceAll('-', '').slice(0, 8)}',current_date FROM classrooms WHERE id='${c.classroomId}';`,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await page.route(
    new RegExp(`/api/staff/classrooms/${c.classroomId}/learning/students`),
    async (route) => {
      const response = await route.fetch();
      held++;
      await gate;
      await route.fulfill({ response });
    },
  );
  try {
    await page.getByLabel('학생 상태', { exact: true }).selectOption('NEW');
    await expect.poll(() => held).toBe(1);
    await page.evaluate((id) => {
      history.pushState({}, '', `/staff/classrooms/${id}/learning`);
      dispatchEvent(new PopStateEvent('popstate'));
    }, empty);
    await protectedText(page.getByRole('region', { name: '학급 요약' }), '가입 학생0명', {
      contains: true,
    });
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await protectedText(page.getByRole('region', { name: '학급 요약' }), '첫 응답0개', {
      contains: true,
    });
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
  await page.goto(route(c));
  await protectedText(page.getByRole('region', { name: '학급 요약' }), '첫 응답5개', {
    contains: true,
  });
  let releaseLogout!: () => void;
  const logoutGate = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  held = 0;
  await page.route(
    new RegExp(`/api/staff/classrooms/${c.classroomId}/learning/students`),
    async (route) => {
      const response = await route.fetch();
      held++;
      await logoutGate;
      await route.fulfill({ response });
    },
  );
  try {
    await page.getByLabel('학생 상태', { exact: true }).selectOption('NEW');
    await expect.poll(() => held).toBe(1);
    await signOut(page);
    releaseLogout();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByRole('region', { name: '학급 요약' })).toHaveCount(0);
    await studentLogin(page, '한빛학교', c.gradeLabel, 1, 2, 'Student!2026');
    await page.goto(route(c));
    await expect(page.getByRole('region', { name: '학급 요약' })).toHaveCount(0);
  } finally {
    releaseLogout();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

// Combined persistence proof: actual earned gift, six-slot gear, first facts and teacher stats after restart.
test('combinedGameHistoryAndTeacherStatsSurviveBackendRestart', async ({ page, browser }) => {
  test.setTimeout(300000);
  const c = await provisionLearningClass(page, 2);
  await page.goto('/student/character');
  await page.getByRole('button', { name: '보라 선택', exact: true }).click();
  await expect(page.getByText('지금 함께하는 친구: 보라', { exact: true })).toBeVisible();
  await page.goto('/student/learning');
  const first = await firstFour(page);
  await resultPage(page, first.sessionId, '회차 통과');
  await captureSanitizedResultProof(page);
  await page.goto('/student/closet');
  await page.getByRole('button', { name: '책벌레안경 미리보기', exact: true }).click();
  await page.getByRole('button', { name: '착용하기', exact: true }).click();
  await protectedText(page.getByRole('button', { name: '책벌레안경 미리보기' }), '착용 중', {
    contains: true,
  });
  const before = {
    game: await get<GameView>(page, '/api/student/game'),
    map: await get<JourneyView>(page, '/api/student/learning/map'),
    history: await session(page, first.sessionId),
    status: await status(page),
  };
  protectedEqual(
    [
      before.game.characterId,
      before.game.equippedBySlot.face,
      before.game.inventory.filter((i) => i.owned).length,
      before.map.firstAnswerCount,
      before.map.days[0].state,
    ],
    ['bora', 'face-1', 1, 5, 'PASSED'],
  );
  const staff = await browser.newPage();
  try {
    await teacher(staff, c);
    const stats = await overview(staff, c);
    summaryIsFour(stats);
    await restartOwnedBackend(page);
    await studentLogin(page, '한빛학교', c.gradeLabel, 1, 1, 'Student!2026');
    protectedEqual(await get<GameView>(page, '/api/student/game'), before.game);
    protectedEqual(await get<JourneyView>(page, '/api/student/learning/map'), before.map);
    protectedEqual(await session(page, first.sessionId), before.history);
    protectedEqual(await status(page), before.status);
    await page.goto(`/student/learning/sessions/${first.sessionId}/result`);
    await protectedText(page.getByRole('region', { name: '여행 선물' }), '책벌레안경', {
      contains: true,
    });
    await layoutAndTargets(page);
    await page.goto('/student/map');
    await expect(page.getByRole('button', { name: '2회차 시작하기', exact: true })).toBeEnabled();
    await layoutAndTargets(page);
    // The map's hero is a static canvas; actual idle motion belongs to the home scene.
    await page.goto('/student/learning');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('.game-avatar-idle')).toHaveCSS('animation-name', 'game-breathe');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.game-avatar-idle')).toHaveCSS('animation-name', 'none');
    await layoutAndTargets(page);
    await teacher(staff, c);
    protectedEqual(await overview(staff, c), stats);
  } finally {
    await staff.close();
  }
});
