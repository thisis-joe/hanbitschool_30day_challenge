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

for (const width of [1280, 390]) {
  test(`XP and item acquisition remain actionable at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 960 });
    const scenario = await learningScenario(page);
    await page.goto(`/student/learning/sessions/${sessionId}`);
    await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
    const xp = page.locator('.game-xp-reward');
    await expect(xp).toHaveAttribute('data-celebrating', 'true');
    await expect(xp).toContainText('+100');
    const output = evidenceOutput();
    if (output) {
      await xp.scrollIntoViewIfNeeded();
      await xp.evaluate((el) =>
        el.getAnimations({ subtree: true }).forEach((a) => {
          a.pause();
          a.currentTime = 500;
        }),
      );
      await page.screenshot({ path: output.file(`xp-${width}.png`) });
    }
    // The finish action works immediately while the XP burst is playing.
    await page.getByRole('link', { name: '완료하기', exact: true }).click();
    const reward = page.getByRole('region', { name: '여행 선물', exact: true });
    await expect(reward).toHaveAttribute('data-revealing', 'true');
    await expect(reward.getByText('아이템 획득!')).toBeVisible();
    if (output) {
      await reward.scrollIntoViewIfNeeded();
      await reward.evaluate((el) =>
        el.getAnimations({ subtree: true }).forEach((a) => {
          a.pause();
          a.currentTime = 500;
        }),
      );
      await page.screenshot({ path: output.file(`item-${width}.png`) });
    }
    const wear = page.getByRole('button', { name: '지금 착용하기', exact: true });
    if (width === 1280) {
      await wear.focus();
      await page.keyboard.press('Enter');
    } else await wear.click();
    await expect.poll(scenario.saves).toBe(1);
    expect(scenario.game().equippedBySlot.hand).toBe('hand-2');
    await expect(reward).not.toHaveAttribute('data-revealing', 'true');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
    // A SPA revisit must not replay this same acquisition.
    await page.getByRole('link', { name: '오늘', exact: true }).click();
    await page.goBack();
    await expect(page.getByRole('region', { name: '여행 선물', exact: true })).not.toHaveAttribute(
      'data-revealing',
      'true',
    );
  });
}

test('reduced motion shows the awards without animated effects', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await learningScenario(page);
  await page.goto(`/student/learning/sessions/${sessionId}`);
  await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
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
