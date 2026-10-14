import { expect, it } from 'vitest';
import { equipmentArt, equipmentSvg } from './artwork';
import { emptyEquipment } from './types';

it('resolves all thirty canonical item IDs while rejecting untrusted values', () => {
  for (const slot of ['face', 'hat', 'top', 'bottom', 'shoes', 'hand']) {
    for (let value = 1; value <= 5; value++) {
      const art = equipmentArt(`${slot}-${value}`);
      expect(art).not.toBeNull();
      expect(equipmentSvg(art!)).toContain('shape-rendering="crispEdges"');
    }
  }
  for (const value of [
    'face-0',
    'hat-6',
    'hand-1.5',
    'face-01',
    'unknown-1',
    '__proto__-1',
    '<img onerror=alert(1)>',
    '',
  ]) {
    expect(equipmentArt(value)).toBeNull();
  }
  expect(Object.keys(emptyEquipment())).toEqual(['face', 'hat', 'top', 'bottom', 'shoes', 'hand']);
});

it('keeps original near and far shoe pieces independently sized', () => {
  const shoes = equipmentArt('shoes-1')!;
  expect([shoes.width, shoes.height]).toEqual([42, 30]);
  expect(shoes.parts?.map((part) => [part.width, part.height])).toEqual([
    [22, 30],
    [19, 28],
  ]);
  expect(shoes.markup).toContain('translate(23 2)');
  expect(shoes.parts?.[0].markup).not.toBe(shoes.parts?.[1].markup);
});
