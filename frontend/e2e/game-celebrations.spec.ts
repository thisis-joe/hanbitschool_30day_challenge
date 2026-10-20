import { test, expect, type Page } from '@playwright/test';
import {
  activeSession,
  answerResult,
  learningStatus,
  sessionId,
} from '../src/test/learningFixtures';
import { gameView, journeyView } from '../src/test/gameFixtures';
import { emptyEquipment } from '../src/features/game/types';
import { evidenceOutput } from './evidence-output';

async function learningScenario(page: Page) {
  const student = {
    accountId: 'visual-student',
    role: 'STUDENT',
    schoolId: 'school',
    schoolName: '한빛학교',
    classroomId: 'class',
    gradeLabel: '1학년',
    classNumber: 1,
    studentNumber: 1,
    name: '여행 친구',
    nickname: '여행 친구',
  };
  const gift = {
    itemId: 'hand-2',
    slot: 'hand' as const,
    value: 2,
    rewardDay: 1,
    name: '풀잎가방',
    assetKey: 'hand-2',
  };
  let game = {
    ...gameView,
    characterId: 'haru' as const,
    equippedBySlot: emptyEquipment(),
    items: [gift],
    inventory: [{ itemId: gift.itemId, owned: false, acquiredAt: null as string | null }],
  };
  let session = {
    ...activeSession,
    answeredCount: 4,
    question: {
      ...activeSession.question!,
      text: '나무는 햇빛을 받아 자랍니다.',
      position: 5,
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      timeLimitSeconds: 60,
    },
  };
  let saves = 0;
  const award = {
    ...answerResult,
    attemptCorrectCount: 5,
    attemptAnsweredCount: 5,
    explanation: '나무는 햇빛으로 양분을 만들어요.',
    attemptState: 'PASSED' as const,
    dayState: 'PASSED' as const,
    rewardGranted: { itemId: gift.itemId, dayNumber: 1, acquiredAt: '2026-10-19T01:00:00Z' },
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === '/api/auth/me') body = student;
    else if (path === '/api/auth/csrf')
      body = { headerName: 'X-CSRF-TOKEN', token: 'visual-test-token' };
    else if (path.endsWith('/answers')) {
      session = { ...session, state: 'COMPLETED', answeredCount: 5, lastAnswer: award };
      game = {
        ...game,
        inventory: [
          { itemId: gift.itemId, owned: true, acquiredAt: award.rewardGranted.acquiredAt },
        ],
      };
      body = award;
    } else if (path === `/api/student/learning/sessions/${sessionId}`) body = session;
    else if (path === '/api/student/learning/status')
      body = {
        ...learningStatus,
        nextAction: session.lastAnswer ? 'WAIT_FOR_NEXT_DAY' : 'CONTINUE_SESSION',
        activeSession: session.lastAnswer ? null : session,
        totalXp: session.lastAnswer ? 100 : 0,
      };
    else if (path === '/api/student/game') body = game;
    else if (path === '/api/student/game/appearance') {
      const command = route.request().postDataJSON();
      game = { ...game, equippedBySlot: command.equippedBySlot, revision: game.revision + 1 };
      saves++;
      body = game;
    } else if (path === '/api/student/learning/map') body = journeyView;
    else if (path === '/api/student/learning/questions') body = [];
    else throw new Error(`Unexpected visual scenario request: ${path}`);
    await route.fulfill({ json: body });
  });
  return { saves: () => saves, game: () => game };
}

for (const width of [1280, 390, 320]) {
  test(`cinematic rewards hand off to actionable cards at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 320 ? 568 : 960 });
    const scenario = await learningScenario(page);
    await page.goto(`/student/learning/sessions/${sessionId}`);
    await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
    const xpScene = page.getByRole('dialog', { name: '경험치 획득 연출' });
    await expect(xpScene).toBeVisible();
    expect(await xpScene.boundingBox()).toEqual({
      x: 0,
      y: 0,
      width,
      height: width === 320 ? 568 : 960,
    });
    await expect(xpScene).toBeFocused();
    await expect(xpScene.getByRole('button', { name: '연출 건너뛰기' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(xpScene).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(xpScene).toBeFocused();
    expect(await xpScene.evaluate((element) => getComputedStyle(element).animationDuration)).toBe(
      '1.3s',
    );
    const xp = page.locator('.game-xp-reward');
    await expect(xp).not.toHaveAttribute('data-celebrating', 'true');
    const output = evidenceOutput();
    if (output) {
      await page.waitForTimeout(450);
      await page.screenshot({ path: output.file(`xp-cinematic-${width}.png`) });
    }
    await expect(xpScene).toHaveCount(0);
    await expect(xp).toBeFocused();
    await expect(xp).toHaveAttribute('data-celebrating', 'true');
    await expect(xp).toContainText('+100');
    await page.getByRole('link', { name: '완료하기', exact: true }).click();
    const itemScene = page.getByRole('dialog', { name: '아이템 획득 연출' });
    await expect(itemScene).toBeVisible();
    await expect(itemScene.getByText('풀잎가방')).toBeVisible();
    const reward = page.getByRole('region', {
      name: '여행 선물',
      exact: true,
      includeHidden: true,
    });
    await expect(reward).not.toHaveAttribute('data-revealing', 'true');
    if (output) {
      await page.waitForTimeout(1600);
      await page.screenshot({ path: output.file(`item-cinematic-${width}.png`) });
    }
    if (width !== 1280) await page.keyboard.press('Escape');
    await expect(itemScene).toHaveCount(0);
    await expect(reward).toBeFocused();
    await expect(reward).toBeInViewport();
    await expect(reward).toHaveAttribute('data-revealing', 'true');
    await page.getByRole('button', { name: '지금 착용하기', exact: true }).click();
    await expect.poll(scenario.saves).toBe(1);
    expect(scenario.game().equippedBySlot.hand).toBe('hand-2');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    expect(errors).toEqual([]);
    await page.getByRole('link', { name: '오늘', exact: true }).click();
    await page.goBack();
    await expect(page.getByRole('region', { name: '여행 선물', exact: true })).not.toHaveAttribute(
      'data-revealing',
      'true',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('reduced motion shows the awards without animated effects', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await learningScenario(page);
  await page.goto(`/student/learning/sessions/${sessionId}`);
  await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('이번 답변으로 받은 경험치: 100 XP')).toBeVisible();
  await expect(page.locator('.game-celebration-burst')).toHaveCount(0);
  await page.getByRole('link', { name: '완료하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '지금 착용하기', exact: true })).toBeEnabled();
  await expect(page.locator('.game-celebration-burst')).toHaveCount(0);
  expect(
    await page
      .locator('.game-reward-card')
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
});

test('changing motion preferences closes the active cinematic and restores input', async ({
  page,
}) => {
  await learningScenario(page);
  await page.goto(`/student/learning/sessions/${sessionId}`);
  await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.game-xp-reward')).toBeFocused();
  await page.getByRole('link', { name: '완료하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '지금 착용하기', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
