import { expect, test } from '@playwright/test';

test('all nine characters keep their limbs connected throughout walking, jumping and bowing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/e2e/fixtures/answer-motion.html');
  await page.locator('html[data-ready="true"]').waitFor();
  const failures = await page.evaluate(async () => {
    // Exercise real canvas pixels, including texture extraction and every joint transform.
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { buildAvatarRig, paintAvatarPose } = await import('/src/features/game/motion/rig.ts');
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { samplePose } = await import('/src/features/game/motion/poses.ts');
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { CHARACTER_IDS, SLOTS } = await import('/src/features/game/types.ts');
    const failures: string[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = 176;
    canvas.height = 216;
    const ctx = canvas.getContext('2d')!;
    const samples = {
      walk: [0, 60, 180, 300, 420, 480],
      happy: [90, 150, 255, 410, 450, 620, 900],
      sad: [180, 360],
    };
    for (const id of CHARACTER_IDS)
      for (const set of [0, 1, 2, 3, 4, 5]) {
        const equipment = Object.fromEntries(
          SLOTS.map((slot: string) => [slot, set ? `${slot}-${set}` : null]),
        );
        const rig = await buildAvatarRig(id, equipment, new AbortController().signal);
        for (const [motion, frames] of Object.entries(samples))
          for (const time of frames) {
            paintAvatarPose(canvas, rig, samplePose(motion, time));
            const pixels = ctx.getImageData(0, 0, 176, 216).data,
              seen = new Uint8Array(176 * 216);
            const parts: { size: number; skin: number }[] = [];
            for (let start = 0; start < seen.length; start++) {
              if (seen[start] || pixels[start * 4 + 3] < 100) continue;
              const stack = [start];
              seen[start] = 1;
              let size = 0,
                skin = 0;
              while (stack.length) {
                const pixel = stack.pop()!,
                  offset = pixel * 4,
                  x = pixel % 176,
                  y = Math.floor(pixel / 176);
                size++;
                if (
                  pixels[offset] > pixels[offset + 1] * 1.08 &&
                  pixels[offset + 1] > pixels[offset + 2] * 1.08 &&
                  pixels[offset + 1] > 100
                )
                  skin++;
                for (let dy = -1; dy <= 1; dy++)
                  for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx,
                      ny = y + dy,
                      next = ny * 176 + nx;
                    if (
                      nx < 0 ||
                      nx >= 176 ||
                      ny < 0 ||
                      ny >= 216 ||
                      seen[next] ||
                      pixels[next * 4 + 3] < 100
                    )
                      continue;
                    seen[next] = 1;
                    stack.push(next);
                  }
              }
              parts.push({ size, skin });
            }
            parts.sort((a, b) => b.size - a.size);
            if (parts.slice(1).some((part) => part.skin > 20))
              failures.push(
                `${id}/${set} ${motion}@${time}: detached skin ${JSON.stringify(parts.slice(1))}`,
              );
          }
      }
    return failures;
  });
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('resting anatomy preserves the original artwork for every character and outfit', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/answer-motion.html');
  await page.locator('html[data-ready="true"]').waitFor();
  const differences = await page.evaluate(async () => {
    // @ts-expect-error Vite fixture imports the production renderer directly.
    const { buildAvatarRig, paintAvatarPose } = await import('/src/features/game/motion/rig.ts');
    // @ts-expect-error Vite fixture imports the production renderer directly.
    const { renderAvatar } = await import('/src/features/game/avatarRenderer.ts');
    // @ts-expect-error Vite fixture imports the production renderer directly.
    const { POSES } = await import('/src/features/game/motion/poses.ts');
    // @ts-expect-error Vite fixture imports source types directly.
    const { CHARACTER_IDS, SLOTS } = await import('/src/features/game/types.ts');
    const failures: string[] = [];
    for (const id of CHARACTER_IDS)
      for (const set of [0, 1, 5]) {
        const equipment = Object.fromEntries(
          SLOTS.map((slot: string) => [slot, set ? `${slot}-${set}` : null]),
        );
        const source = document.createElement('canvas');
        await renderAvatar(source, id, equipment);
        const rig = await buildAvatarRig(id, equipment, new AbortController().signal);
        const actual = document.createElement('canvas');
        actual.width = 176;
        actual.height = 216;
        paintAvatarPose(actual, rig, POSES.idle);
        const expected = document.createElement('canvas');
        expected.width = 176;
        expected.height = 216;
        expected.getContext('2d')!.drawImage(source, 24, 26);
        const a = actual.getContext('2d')!.getImageData(0, 0, 176, 216).data;
        const b = expected.getContext('2d')!.getImageData(0, 0, 176, 216).data;
        const changed = a.reduce(
          (sum: number, value: number, index: number) => sum + Number(value !== b[index]),
          0,
        );
        if (changed) failures.push(`${id}/${set}: ${changed} altered channels`);
      }
    return failures;
  });
  expect(differences).toEqual([]);
});

test('each handheld bag hangs below the raised hand when the character cheers', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/answer-motion.html');
  await page.locator('html[data-ready="true"]').waitFor();
  const bags = await page.evaluate(async () => {
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { buildAvatarRig, paintAvatarPose } = await import('/src/features/game/motion/rig.ts');
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { POSES } = await import('/src/features/game/motion/poses.ts');
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { emptyEquipment } = await import('/src/features/game/types.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 176;
    canvas.height = 216;
    const ctx = canvas.getContext('2d')!;
    const render = async (hand: string | null) => {
      const rig = await buildAvatarRig(
        'bora',
        { ...emptyEquipment(), hand },
        new AbortController().signal,
      );
      paintAvatarPose(canvas, rig, POSES.cheer);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const bare = await render(null);
    // Colors taken from each bag's body, excluding the handle and the character's own pixels.
    const colors = [
      [0xc9a771, 0xe6ca95],
      [0x729271, 0x91ab80, 0xb1c39a, 0x809d73],
      [0xa87652, 0xbb8b62, 0xd1a577],
    ];
    const results = [];
    for (const [index, palette] of colors.entries()) {
      const pixels = await render(`hand-${index + 1}`);
      const bodyRows: number[] = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const rgb = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
        const bareRgb = (bare[i] << 16) | (bare[i + 1] << 8) | bare[i + 2];
        if (
          palette.includes(rgb) &&
          pixels[i + 3] === 255 &&
          (rgb !== bareRgb || bare[i + 3] < 255)
        )
          bodyRows.push(Math.floor(i / 4 / canvas.width));
      }
      // The center of Bora's raised fist is at y=111 in the rendered cheer frame.
      results.push({
        item: index + 1,
        bodyPixels: bodyRows.length,
        lowestPaint: Math.max(...bodyRows),
        aboveFist: bodyRows.filter((y) => y <= 111).length,
      });
    }
    return results;
  });
  for (const bag of bags) {
    expect(bag.bodyPixels, JSON.stringify(bag)).toBeGreaterThan(20);
    expect(bag.lowestPaint, JSON.stringify(bag)).toBeGreaterThan(125);
    expect(bag.aboveFist, JSON.stringify(bag)).toBe(0);
  }
});

test('Bora’s raised arm leaves no skin-colored copy on her hair', async ({ page }) => {
  await page.goto('/e2e/fixtures/answer-motion.html');
  const observations = await page.evaluate(async () => {
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { buildAvatarRig, paintAvatarPose } = await import('/src/features/game/motion/rig.ts');
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { POSES } = await import('/src/features/game/motion/poses.ts');
    // @ts-expect-error The Vite fixture serves source modules directly.
    const { emptyEquipment } = await import('/src/features/game/types.ts');
    const rig = await buildAvatarRig(
      'bora',
      { ...emptyEquipment(), top: 'top-2' },
      new AbortController().signal,
    );
    const canvas = document.createElement('canvas');
    canvas.width = 176;
    canvas.height = 216;
    const ctx = canvas.getContext('2d')!;
    const countSkin = () => {
      // This strip is part of the original lowered arm and sits clear of the torso.
      const pixels = ctx.getImageData(74, 163, 3, 8).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 3] > 180 && pixels[i] > pixels[i + 1] * 1.05 && pixels[i + 1] > 95) count++;
      return count;
    };
    paintAvatarPose(canvas, rig, POSES.idle);
    const idleArm = countSkin();
    paintAvatarPose(canvas, rig, POSES.cheer);
    return { idleArm, ghostArm: countSkin(), nearbyHair: ctx.getImageData(70, 165, 1, 1).data[3] };
  });
  expect(observations.idleArm).toBeGreaterThan(10);
  expect(observations.ghostArm).toBe(0);
  expect(observations.nearbyHair).toBeGreaterThan(180);
});

test('arrives faster, completes the reaction, and respects reduced motion', async ({ page }) => {
  await page.goto('/e2e/fixtures/answer-motion.html');
  const scene = page.getByRole('region', { name: '학습 여행 장면' });
  await scene.locator('canvas[data-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'O 정답', exact: true }).click();
  await expect(scene).toHaveAttribute('data-phase', 'walking');
  await expect(scene).toHaveAttribute('data-phase', 'correct', { timeout: 700 });
  await page.getByRole('button', { name: '다음 문항', exact: true }).click();
  await page.getByRole('button', { name: 'X 응답 대기', exact: true }).click();
  await expect(scene).toHaveAttribute('data-phase', 'waiting');
  await page.getByRole('button', { name: '서버 정답 도착', exact: true }).click();
  await expect(scene).toHaveAttribute('data-phase', 'correct');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '다음 문항', exact: true }).click();
  await page.getByRole('button', { name: 'X 오답', exact: true }).click();
  await expect(scene).toHaveAttribute('data-phase', 'wrong');
  const canvas = scene.locator('canvas');
  const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(200);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(before);
});
