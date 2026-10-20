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
    const { CHARACTER_IDS, emptyEquipment } = await import('/src/features/game/types.ts');
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
    for (const id of CHARACTER_IDS) {
      const rig = await buildAvatarRig(id, emptyEquipment(), new AbortController().signal);
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
              `${id} ${motion}@${time}: detached skin ${JSON.stringify(parts.slice(1))}`,
            );
        }
    }
    return failures;
  });
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
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
