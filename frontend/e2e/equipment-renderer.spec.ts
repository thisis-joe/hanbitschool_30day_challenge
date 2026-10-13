import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Independent reference: ONLY the audited fixed graphics/coordinates from the supplied file.
// No prototype questions, state, learning rules, or teacher sample rows are evaluated.
test('allNineMatchingAndMixedOutfitsRenderSourcePixels', async ({ page }) => {
  const target = new URL(
    process.env.HANBIT_GEAR_QA_URL ?? 'http://127.0.0.1:8091/e2e/fixtures/equipment-review.html',
  );
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
    throw new Error('Artwork QA requires a loopback HTTP target');
  await page.goto(target.href);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const source = readFileSync(
    process.env.HANBIT_GEAR_REFERENCE ?? '/Users/Joseph/Downloads/equipment-design-review.html',
    'utf8',
  );
  const lines = source.split(/\r?\n/);
  const graphics = lines.slice(4, 377).join('\n');
  const anchors = lines.slice(387, 398).join('\n');
  const art = lines[398].match(/const ART=(\[.*?\]);/s)?.[1];
  if (
    !graphics.startsWith('function headHandDesign(') ||
    !anchors.startsWith('const ANCHORS=') ||
    !art
  )
    throw new Error('Original artwork boundaries changed; review the source before updating');
  const images = JSON.parse(art) as string[];
  expect(images).toHaveLength(9);
  await page.addScriptTag({
    content: `${graphics}\n${anchors}\nconst bitmapImages=${JSON.stringify(images)}.map(src=>{const img=new Image();img.src=src;return img;});
    window.paintReference=async(canvas,index,gear)=>{
      const layers=Object.entries(gear).filter(([,v])=>v).flatMap(([s,v])=>s==='shoes'?[equipmentBitmap(s,v,0),equipmentBitmap(s,v,1)]:[equipmentBitmap(s,v)]);
      await Promise.all([...bitmapImages,...layers.map(l=>l.img)].map(img=>img.decode()));
      renderEquippedAvatar(canvas,index,gear);
    };`,
  });
  const comparison = await page.evaluate(async () => {
    const reference = (
      window as unknown as {
        paintReference: (
          c: HTMLCanvasElement,
          i: number,
          g: Record<string, number>,
        ) => Promise<void>;
      }
    ).paintReference;
    const results = [];
    for (const actual of document.querySelectorAll<HTMLCanvasElement>('canvas[data-character]')) {
      const original = document.createElement('canvas');
      original.width = 128;
      original.height = 176;
      original.setAttribute('aria-label', '원본');
      actual.after(original);
      await reference(original, Number(actual.dataset.character), JSON.parse(actual.dataset.gear!));
      const pixels = actual.getContext('2d')!.getImageData(0, 0, 128, 176).data;
      const expected = original.getContext('2d')!.getImageData(0, 0, 128, 176).data;
      let differences = 0,
        opaque = 0;
      for (let i = 0; i < pixels.length; i++) if (pixels[i] !== expected[i]) differences++;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) opaque++;
      results.push({
        character: actual.dataset.character,
        outfit: actual.dataset.outfit,
        differences,
        opaque,
      });
    }
    return results;
  });
  expect(comparison).toHaveLength(72); // Nine characters × base, five matching, two mixed.
  for (const entry of comparison) {
    expect(entry.opaque, JSON.stringify(entry)).toBeGreaterThan(1000);
    expect(entry.differences, JSON.stringify(entry)).toBe(0);
  }
  const output = fileURLToPath(
    new URL(
      '../../.superpowers/sdd/2026-10-13-student-game-experience/art-evidence/',
      import.meta.url,
    ),
  );
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  for (let row = 0; row < 9; row++)
    await page
      .locator('section')
      .nth(row)
      .screenshot({ path: `${output}character-${row}-actual-reference.png` });
});
