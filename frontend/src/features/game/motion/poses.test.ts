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

it('plants one foot while the other steps, then settles before arrival', () => {
  const first = samplePose('walk', 60),
    second = samplePose('walk', 180);
  expect(first.nearFootLift).toBeGreaterThan(5);
  expect(first.farFootLift).toBe(0);
  expect(second.farFootLift).toBeGreaterThan(5);
  expect(second.nearFootLift).toBe(0);
  expect(first.nearStep * second.nearStep).toBeLessThan(0);
  expect(samplePose('walk', 480)).toEqual(samplePose('idle', 0));
});

it('compresses the knees before taking off and after landing, with no teleport between phases', () => {
  expect(samplePose('happy', 90).drop).toBeGreaterThan(4);
  expect(samplePose('happy', 255).lift).toBeGreaterThan(20);
  expect(samplePose('happy', 255).nearFootLift).toBeGreaterThan(4);
  expect(samplePose('happy', 450).drop).toBeGreaterThan(3);
  for (const boundary of [100, 410, 520, 770, 900]) {
    const before = samplePose('happy', boundary - 0.01),
      after = samplePose('happy', boundary);
    for (const key of ['lift', 'drop', 'nearArm', 'farArm', 'head', 'hair'] as const)
      expect(Math.abs(before[key] - after[key]), `${key} at ${boundary} ms`).toBeLessThan(0.1);
  }
});
