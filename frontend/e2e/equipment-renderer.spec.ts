import { test, expect } from '@playwright/test';
import { evidenceOutput } from './evidence-output';

// Acceptance uses actual browser pixels and native character art. It intentionally
// does not compare against the old oversized equipment implementation.
test('nine characters keep their fists in front of fitted bags and render every outfit', async ({
  page,
}) => {
  const target = new URL(
    process.env.HANBIT_GEAR_QA_URL ?? 'http://127.0.0.1:8091/e2e/fixtures/equipment-review.html',
  );
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
    throw new Error('Artwork QA requires a loopback HTTP target');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1320, height: 900 });
  await page.goto(target.href);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const observations = await page.evaluate(() => {
    // Palm centers inspected on the original 128 × 176 sprites, independent of renderer imports.
    const palms = [
      [47, 139],
      [54, 138],
      [51, 137],
      [45, 138],
      [63, 142],
      [54, 144],
      [48, 140],
      [55, 138],
      [49, 139],
    ];
    const results = [];
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-character]')) {
      const character = Number(canvas.dataset.character),
        outfit = Number(canvas.dataset.outfit);
      const base = document.querySelector<HTMLCanvasElement>(
        `canvas[data-character="${character}"][data-outfit="0"]`,
      )!;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, 128, 176).data;
      const original = base.getContext('2d')!.getImageData(0, 0, 128, 176).data;
      let opaque = 0,
        heldPixels = 0,
        preservedSkin = 0,
        palmSkin = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) opaque++;
      const [px, py] = palms[character];
      for (let y = py - 3; y <= py + 2; y++)
        for (let x = px - 3; x <= px + 3; x++) {
          const i = (y * 128 + x) * 4;
          if (
            original[i + 3] > 245 &&
            original[i] > original[i + 1] * 1.08 &&
            original[i + 1] > original[i + 2] * 1.08 &&
            original[i + 1] > 100
          ) {
            palmSkin++;
            // Native skin has alpha 252–254. Source-over on the handle makes
            // it opaque, with up to 3 RGB levels of rounding/blending.
            if (
              pixels[i + 3] >= original[i + 3] &&
              pixels.slice(i, i + 3).every((v, c) => Math.abs(v - original[i + c]) <= 3)
            )
              preservedSkin++;
          }
        }
      // Bags must visibly hang below the palm, with a body smaller than the torso.
      for (let y = py + 5; y < py + 22; y++)
        for (let x = px - 10; x <= px + 10; x++) {
          const i = (y * 128 + x) * 4;
          if (pixels[i + 3] > 120 && pixels.slice(i, i + 4).some((v, c) => v !== original[i + c]))
            heldPixels++;
        }
      results.push({ character, outfit, opaque, palmSkin, preservedSkin, heldPixels });
    }
    return results;
  });
  expect(observations).toHaveLength(72);
  for (const entry of observations) {
    expect(entry.opaque, JSON.stringify(entry)).toBeGreaterThan(1000);
    if (entry.outfit > 0) {
      expect(entry.palmSkin, JSON.stringify(entry)).toBeGreaterThan(10);
      expect(entry.preservedSkin, JSON.stringify(entry)).toBe(entry.palmSkin);
    }
    if ([1, 2, 3, 7].includes(entry.outfit))
      expect(entry.heldPixels, JSON.stringify(entry)).toBeGreaterThan(35);
  }
  expect(errors).toEqual([]);
  const output = evidenceOutput();
  if (output)
    for (let row = 0; row < 9; row++)
      await page
        .locator('section')
        .nth(row)
        .screenshot({ path: output.file(`character-${row}-fitted.png`) });
});
