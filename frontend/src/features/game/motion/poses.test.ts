import { expect, it } from 'vitest';
import { samplePose } from './poses';

it('celebrates with two jumps, then holds both hands above the shoulders', () => {
  const heights = Array.from({ length: 13 }, (_, i) => samplePose('happy', i * 100).lift);
  let peaks = 0;
  for (let i = 1; i < heights.length - 1; i++)
    if (heights[i] > heights[i - 1] && heights[i] > heights[i + 1]) peaks++;
  expect(peaks).toBe(2);
  const held = samplePose('happy', 5000);
  expect(held.lift).toBe(0);
  expect(Math.cos((held.nearArm * Math.PI) / 180)).toBeLessThan(0);
  expect(Math.cos((held.farArm * Math.PI) / 180)).toBeLessThan(0);
  expect(held.expression).toBe('smile');
});

it('reduced motion keeps the expressive final poses without moving or jumping', () => {
  for (const time of [0, 200, 1000]) {
    expect(samplePose('walk', time, true).lift).toBe(0);
    expect(samplePose('happy', time, true).lift).toBe(0);
    const sad = samplePose('sad', time, true);
    expect(sad.bow).toBeGreaterThan(0);
    expect(Math.cos((sad.nearArm * Math.PI) / 180)).toBeGreaterThan(0);
    expect(Math.cos((sad.farArm * Math.PI) / 180)).toBeGreaterThan(0);
    expect(sad.expression).toBe('sad');
  }
});
