import { test, expect, type Page } from '@playwright/test';
import {
  activeSession,
  answerResult,
  learningStatus,
  sessionId,
} from '../src/test/learningFixtures';
import type { LearningSessionView } from '../src/features/learning/types';
import { gameView, journeyView } from '../src/test/gameFixtures';
import { evidenceOutput } from './evidence-output';

test.use({ hasTouch: true });

async function scenario(page: Page, position = 0, seconds = 60) {
  let session: LearningSessionView = {
    ...activeSession,
    question: {
      ...activeSession.question!,
      text: '나무는 햇빛을 받아 자랍니다.',
      deadlineAt: new Date(Date.now() + seconds * 1000).toISOString(),
      timeLimitSeconds: 60,
    },
  };
  const writes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') writes.push(path);
    let body: unknown;
    if (path === '/api/auth/me')
      body = {
        accountId: 'pixel-test',
        role: 'STUDENT',
        nickname: '숲친구',
        schoolName: '한빛학교',
      };
    else if (path === '/api/auth/csrf') body = { headerName: 'X-CSRF-TOKEN', token: 'synthetic' };
    else if (path === '/api/student/game') body = { ...gameView, characterId: 'bora' };
    else if (path === '/api/student/learning/map')
      body = { ...journeyView, journeyPosition: position };
    else if (path === '/api/student/learning/status')
      body = { ...learningStatus, activeSession: session };
    else if (path === '/api/student/learning/questions') body = [];
    else if (path.endsWith('/answers')) {
      session = {
        ...session,
        state: 'AWAITING_ADVANCE',
        answeredCount: 1,
        lastAnswer: answerResult,
      };
      body = answerResult;
    } else if (path === `/api/student/learning/sessions/${sessionId}`) body = session;
    else throw new Error(`Unexpected synthetic request: ${path}`);
    await route.fulfill({ json: body });
  });
  return writes;
}

for (const width of [320, 390, 768, 1280]) {
  for (const [position, ground] of [
    [0, 0.735],
    [55, 0.75],
    [110, 0.845],
  ]) {
    test(`ground contact at ${width}px, journey ${position}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await scenario(page, position);
      await page.goto(`/student/learning/sessions/${sessionId}`);
      await page.locator('.game-avatar-articulated[data-ready="true"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const scene = page.getByRole('region', { name: '학습 여행 장면' });
      await expect(async () => {
        const distance = await scene.evaluate((el, level) => {
          const h = el.clientHeight,
            w = el.clientWidth;
          const imageHeight = Math.max(h, w / 1.5);
          const floor =
            el.getBoundingClientRect().bottom - el.clientTop - imageHeight * (1 - level);
          const actor = el.querySelector('.game-avatar-articulated')!.getBoundingClientRect();
          const feet = actor.top + actor.height * (196 / 216);
          return Math.abs(feet - floor);
        }, ground);
        expect(distance).toBeLessThan(12);
      }).toPass({ timeout: 1500 });
      const button = page.getByRole('button', { name: 'O · 사실', exact: true });
      expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(112);
      expect((await button.locator('b').boundingBox())!.width).toBeGreaterThanOrEqual(48);
      await expect(button.locator('svg')).toHaveAttribute('shape-rendering', 'crispEdges');
      await expect(page.getByRole('link', { name: '학습 홈으로', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const output = evidenceOutput();
      if (output && position === 0)
        await page.screenshot({ path: output.file(`learning-${width}.png`), fullPage: true });
    });
  }
}

test('time bar drains independently and only the last-five-second text blinks', async ({
  page,
}) => {
  await page.clock.install({ time: Date.now() });
  await scenario(page, 0, 8);
  await page.goto(`/student/learning/sessions/${sessionId}`);
  const remaining = page.getByRole('progressbar', { name: '남은 시간', exact: true });
  const initial = Number(await remaining.getAttribute('value'));
  const timer = page.locator('.learning-timer');
  const color = await timer.evaluate((el) => getComputedStyle(el).color);
  await page.clock.runFor(4000);
  await expect(timer).toHaveAttribute('data-urgent', 'true');
  expect(Number(await remaining.getAttribute('value'))).toBeLessThan(initial);
  expect(await timer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  expect(await timer.evaluate((el) => getComputedStyle(el).color)).toBe(color);
  expect(await timer.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'learning-timer-blink',
  );
  const answered = (await page.getByRole('progressbar', { name: '문항 진행' }).boundingBox())!;
  const time = (await remaining.boundingBox())!;
  expect(time.y).toBeGreaterThanOrEqual(answered.y + answered.height);
  await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
  await expect(remaining).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`wardrobe supports arrows, touch, bounds and blur without saving at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await scenario(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/student/closet');
    const room = page.getByRole('group', { name: '캐릭터 움직이기' });
    await room.locator('[data-ready="true"]').waitFor();
    await room.scrollIntoViewIfNeeded();
    await room.focus();
    const actor = room.locator('.game-wardrobe-walker');
    const original = (await actor.boundingBox())!;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(350);
    await page.keyboard.up('ArrowRight');
    expect((await actor.boundingBox())!.x).toBeGreaterThan(original.x + 25);
    await expect(actor).toHaveAttribute('data-moving', 'false');
    const area = (await room.boundingBox())!;
    await page.touchscreen.tap(area.x + 35, area.y + area.height * 0.85);
    await expect.poll(async () => (await actor.boundingBox())!.x).toBeLessThan(original.x);
    await room.focus();
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowLeft');
    expect((await actor.boundingBox())!.x).toBeGreaterThanOrEqual(area.x);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(250);
    const up = (await actor.boundingBox())!;
    expect(up.y).toBeLessThan(original.y);
    await page.getByRole('button', { name: '얼굴 장비 보기' }).focus();
    await page.keyboard.up('ArrowUp');
    await expect(actor).toHaveAttribute('data-moving', 'false');
    const stopped = (await actor.boundingBox())!;
    await page.waitForTimeout(200);
    expect((await actor.boundingBox())!.y).toBeCloseTo(stopped.y, 0);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    await expect(page.locator('.game-wardrobe-grid .game-base-option')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '얼굴 기본 모습' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.fonts.check('16px NanumSquareRound', '한빛학교')),
    ).toBe(true);
    expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
      'NanumSquareRound',
    );
    const output = evidenceOutput();
    if (output)
      await page.screenshot({ path: output.file(`wardrobe-${width}.png`), fullPage: true });
  });
}

test('exploration is a map with no next-learning or round-card commands', async ({ page }) => {
  const writes = await scenario(page);
  await page.goto('/student/map');
  await expect(page.getByRole('heading', { name: '탐험 지도', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '탐험 경로' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '다음 배움' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: '회차별 학습' })).toHaveCount(0);
  await expect(page.locator('a[href^="#journey-day-"]')).toHaveCount(0);
  await page.getByRole('button', { name: '현재 위치로 돌아가기' }).click();
  expect(writes).toEqual([]);
  const output = evidenceOutput();
  if (output) await page.screenshot({ path: output.file('exploration.png'), fullPage: true });
});
