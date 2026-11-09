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

async function scenario(
  page: Page,
  position = 0,
  seconds = 60,
  explanation = answerResult.explanation,
) {
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
      const result = {
        ...answerResult,
        explanation,
        correctChoice: route.request().postDataJSON().choice,
      };
      session = {
        ...session,
        state: 'AWAITING_ADVANCE',
        answeredCount: 1,
        lastAnswer: result,
      };
      body = result;
    } else if (path.endsWith('/advance')) {
      session = {
        ...session,
        state: 'QUESTION_ACTIVE',
        lastAnswer: null,
        question: {
          ...session.question!,
          position: 2,
          questionId: 2,
          text: '숲에서 관찰한 내용을 차근차근 다시 확인해 보세요. '.repeat(24),
        },
      };
      body = session;
    } else if (path === `/api/student/learning/sessions/${sessionId}`) body = session;
    else throw new Error(`Unexpected synthetic request: ${path}`);
    await route.fulfill({ json: body });
  });
  return writes;
}

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [1280, 900],
] as const) {
  test(`forest stage stays fixed through a delayed answer, retry and next question at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await scenario(page, 0, 60, '햇빛이 드는 쪽을 보고 자료를 함께 살펴보세요. '.repeat(20));
    await page.route('**/api/student/game', (route) =>
      route.fulfill({
        json: {
          ...gameView,
          characterId: 'arin',
          equippedBySlot: {
            face: 'face-1',
            hat: 'hat-1',
            top: 'top-1',
            bottom: 'bottom-1',
            shoes: 'shoes-1',
            hand: 'hand-1',
          },
        },
      }),
    );
    const requests: unknown[] = [];
    let disconnect!: () => void;
    const delay = new Promise<void>((done) => {
      disconnect = done;
    });
    await page.route('**/answers', async (route) => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) {
        await delay;
        await route.abort('failed');
      } else await route.fallback();
    });
    await page.goto(`/student/learning/sessions/${sessionId}`);
    const stage = page.getByRole('region', { name: '학습 여행 장면' });
    await stage.locator('canvas[data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const geometry = () =>
      stage.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const landmark = el.querySelector('.game-answer-o')!.getBoundingClientRect();
        const actor = el.querySelector('canvas')!.getBoundingClientRect();
        const title = el.querySelector('h1')!.getBoundingClientRect();
        return [
          box.width,
          box.height,
          Math.round(box.top + scrollY),
          Math.round(landmark.bottom - box.top),
          Math.round(actor.top - box.top),
          Math.round(title.top - box.top),
        ];
      });
    const initial = await geometry();
    const output = evidenceOutput();
    if (output) await stage.screenshot({ path: output.file(`forest-idle-${width}.png`) });
    try {
      await page.getByRole('button', { name: 'O · 사실', exact: true }).tap();
      await expect(stage.getByText('답변을 확인하고 있어요', { exact: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: '같은 답변 다시 확인' })).toHaveCount(0);
      expect(await geometry()).toEqual(initial);
    } finally {
      disconnect();
    }
    const retry = stage.getByRole('button', { name: '같은 답변 다시 확인' });
    await expect(retry).toBeEnabled();
    expect(await geometry()).toEqual(initial);
    await retry.tap();
    const next = stage.getByRole('button', { name: '다음 문제' });
    await expect(next).toBeEnabled();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const explanation = stage.getByRole('region', { name: '문항과 해설' });
    await explanation.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect.poll(() => explanation.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await geometry()).toEqual(initial);
    await expect(stage).toHaveAttribute('data-phase', 'correct');
    if (output) await stage.screenshot({ path: output.file(`forest-cheer-${width}.png`) });
    await next.tap();
    await expect(stage.getByRole('heading', { name: '문항 2 / 5' })).toBeVisible();
    expect(await geometry()).toEqual(initial);
    await expect(page.getByText('한빛학교와 함께하는 배움', { exact: true })).toHaveCount(0);
  });
}

for (const width of [320, 390, 768, 1280]) {
  for (const position of [0, 55, 110]) {
    test(`ground contact at ${width}px, journey ${position}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await scenario(page, position);
      await page.goto(`/student/learning/sessions/${sessionId}`);
      await page.locator('.game-avatar-articulated[data-ready="true"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const scene = page.getByRole('region', { name: '학습 여행 장면' });
      await expect(async () => {
        const distance = await scene.evaluate((el) => {
          // The painted walking surface is anchored to the fixed scene floor.
          const floor = el.getBoundingClientRect().bottom - el.clientTop - 138;
          const actor = el.querySelector('.game-avatar-articulated')!.getBoundingClientRect();
          const feet = actor.top + actor.height * (196 / 216);
          return Math.abs(feet - floor);
        });
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

for (const density of [1, 2]) {
  test.describe(`forest pixel grid at ${density}× density`, () => {
    test.use({ deviceScaleFactor: density, viewport: { width: 390, height: 844 } });

    test('uses the authored grid, equipped companion and stepped sparks', async ({ page }) => {
      await scenario(page);
      await page.goto(`/student/learning/sessions/${sessionId}`);
      const scene = page.getByRole('region', { name: '학습 여행 장면' });
      await expect(scene.locator('canvas[data-ready="true"]')).toBeVisible();
      await expect(scene.locator('canvas')).toHaveAttribute('width', '88');
      expect(
        await scene.evaluate((el) => getComputedStyle(el, '::after').backgroundImage),
      ).toBe('none');
      expect(await page.evaluate(() => devicePixelRatio)).toBe(density);
      await expect(scene).toHaveCSS('image-rendering', 'pixelated');
      const rock = scene.locator('.game-answer-o .game-answer-landmark-art');
      await expect(rock).toHaveCSS('width', '116px');
      await expect(rock).toHaveCSS('height', '112px');
      await expect(scene).toHaveCSS('background-size', '768px auto');
      await expect(scene).toHaveCSS('background-image', /\/game\/pixels\/original-forest\.png/);
      const sourceSize = await scene.evaluate(async (element) => {
        const source = getComputedStyle(element).backgroundImage.match(/url\("([^"]+)"\)/)?.[1];
        const image = new Image();
        image.src = source!;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      });
      expect(sourceSize).toEqual([768, 516]);

      const output = evidenceOutput();
      if (output) await page.screenshot({ path: output.file(`forest-density-${density}.png`) });
      await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
      await expect(scene.locator('.game-celebration-particle').first()).toHaveCSS(
        'animation-name',
        'game-pixel-spark',
      );
      await expect(page.getByRole('button', { name: '다음 문제' })).toBeEnabled();
    });
  });
}

test('resizing the answer scene keeps the ground aligned without observer warnings', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('pageerror', (error) => {
    if (error.message.includes('ResizeObserver loop')) warnings.push(error.message);
  });
  page.on('console', (message) => {
    if (message.text().includes('ResizeObserver loop')) warnings.push(message.text());
  });
  await page.addInitScript(() => {
    window.addEventListener('error', (event) => {
      if (event.message.includes('ResizeObserver loop')) console.error(event.message);
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await scenario(page);
  await page.goto(`/student/learning/sessions/${sessionId}`);
  const scene = page.getByRole('region', { name: '학습 여행 장면' });
  await expect(scene.locator('canvas[data-ready="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1280, 390, 768, 320]) {
    await page.setViewportSize({ width, height: 600 });
    await expect
      .poll(() =>
        scene.evaluate((element) => {
          const ground = parseFloat(getComputedStyle(element).getPropertyValue('--scene-ground'));
          return Math.abs(ground - 138);
        }),
      )
      .toBeLessThan(1);
  }
  await page.getByRole('button', { name: 'O · 사실', exact: true }).click();
  await expect(page.locator('.learning-explanation')).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  expect(warnings).toEqual([]);
});

for (const width of [320, 390, 768, 1280]) {
  for (const [position, region] of [
    [0, 'forest'],
    [55, 'village'],
    [110, 'beach'],
  ] as const) {
    for (const choice of ['O', 'X'] as const) {
      test(`natural landmark ${region} ${choice} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await scenario(page, position);
        await page.goto(`/student/learning/sessions/${sessionId}`);
        const scene = page.getByRole('region', { name: '학습 여행 장면' });
        await scene.locator('.game-avatar-articulated[data-ready="true"]').waitFor();
        const marker = scene.locator(`.game-answer-${choice.toLowerCase()}`);
        const art = marker.locator('.game-answer-landmark-art');
        await expect(art).toHaveAttribute('src', `/game/answers/original-${region}.png`);
        await expect
          .poll(() => art.evaluate((el) => (el as HTMLImageElement).naturalWidth))
          .toBe(88);
        await expect(async () => {
          const distance = await marker.evaluate((el) => {
            const scene = el.closest('section')!;
            const floor =
              scene.getBoundingClientRect().bottom -
              scene.clientTop -
              parseFloat(getComputedStyle(scene).getPropertyValue('--scene-ground'));
            return Math.abs(el.getBoundingClientRect().bottom - floor);
          });
          expect(distance).toBeLessThan(9);
        }).toPass({ timeout: 1500 });
        const face = (await marker.boundingBox())!;
        const letter = (await marker.locator('b').boundingBox())!;
        const word = (await marker.locator('span').boundingBox())!;
        for (const ink of [letter, word]) {
          expect(ink.x).toBeGreaterThanOrEqual(face.x + face.width * 0.25);
          expect(ink.x + ink.width).toBeLessThanOrEqual(face.x + face.width * 0.75);
          expect(ink.y).toBeGreaterThanOrEqual(face.y + face.height * 0.24);
          expect(ink.y + ink.height).toBeLessThanOrEqual(face.y + face.height * 0.87);
        }
        expect(word.y).toBeGreaterThanOrEqual(letter.y + letter.height);
        expect(await marker.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
          'rgba(0, 0, 0, 0)',
        );
        await expect(scene.locator('.game-answer-track, .game-answer-shadow')).toHaveCount(0);
        await marker.click();
        await expect(scene).toHaveAttribute('data-phase', 'correct');
        const actor = (await scene.locator('.game-answer-traveler').boundingBox())!;
        const object = (await marker.boundingBox())!;
        const center = actor.x + actor.width / 2;
        const objectCenter = object.x + object.width / 2;
        expect(choice === 'O' ? center - objectCenter : objectCenter - center).toBeGreaterThan(
          object.width / 2,
        );
        // Transparent canvas margins can overlap the stone; its lettering must stay clear.
        const overlap = await scene.evaluate((el) => {
          const canvas = el.querySelector<HTMLCanvasElement>('canvas.game-avatar-articulated')!;
          const pixels = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          const box = canvas.getBoundingClientRect();
          const labels = [
            ...el.querySelectorAll('.game-answer-destination b, .game-answer-destination span'),
          ].map((label) => label.getBoundingClientRect());
          for (let y = 0; y < canvas.height; y++)
            for (let x = 0; x < canvas.width; x++) {
              if (pixels[(y * canvas.width + x) * 4 + 3] < 128) continue;
              const px = box.x + ((x + 0.5) * box.width) / canvas.width;
              const py = box.y + ((y + 0.5) * box.height) / canvas.height;
              if (
                labels.some(
                  (label) =>
                    px > label.left && px < label.right && py > label.top && py < label.bottom,
                )
              )
                return true;
            }
          return false;
        });
        expect(overlap).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const output = evidenceOutput();
        if (output && [320, 1280].includes(width))
          await page.screenshot({
            path: output.file(`landmark-${region}-${choice.toLowerCase()}-${width}.png`),
            fullPage: true,
          });
      });
    }
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
      await page.evaluate(
        async () => (await document.fonts.load('16px Galmuri11', '한빛학교')).length,
      ),
    ).toBe(1);
    expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
      'Galmuri11',
    );
    const output = evidenceOutput();
    if (output)
      await page.screenshot({ path: output.file(`wardrobe-${width}.png`), fullPage: true });
  });
}

test('exploration is a map with no next-learning or round-card commands', async ({ page }) => {
  const writes = await scenario(page);
  await page.goto('/student/map');
  await expect(page.getByRole('heading', { name: '탐험 지도', exact: true })).toHaveCSS(
    'clip-path',
    'inset(50%)',
  );
  await expect(page.getByRole('region', { name: '탐험 경로' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '다음 배움' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: '회차별 학습' })).toHaveCount(0);
  await expect(page.locator('a[href^="#journey-day-"]')).toHaveCount(0);
  const firstLocked = page.locator('[data-region-start="6"]');
  const nextLocked = page.locator('[data-region-start="11"]');
  await expect(firstLocked).toHaveAttribute('data-revealed', 'false');
  await expect(firstLocked).toHaveCSS('--fade-bottom', '44px');
  await expect(nextLocked).toHaveCSS('--fade-bottom', '0px');
  expect(await firstLocked.evaluate((el) => getComputedStyle(el).maskImage)).toContain(
    'linear-gradient',
  );
  await page.getByRole('button', { name: '현재 위치로 돌아가기' }).click();
  expect(writes).toEqual([]);
  const output = evidenceOutput();
  if (output) await page.screenshot({ path: output.file('exploration.png'), fullPage: true });
});
