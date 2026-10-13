import { appendFileSync, readFileSync } from 'node:fs';
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
  await expect(page.locator('.learning-explanation')).toHaveText(result.explanation);
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
