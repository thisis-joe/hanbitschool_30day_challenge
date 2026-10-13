import { expect, it } from 'vitest';
import { journeyPoint } from './journeyGeometry';

// Reversing the trail or using day-count rather than first-answer steps breaks placement.
it('usesAscendingSourceEndpointsAndInterpolatesFirstAnswers', () => {
  expect(journeyPoint(0)).toEqual({ x: 55.3, y: 96.8 });
  expect(journeyPoint(150)).toEqual({ x: 56.5, y: 5.6 });
  expect(journeyPoint(1).y).toBeCloseTo(96.12);
  expect(journeyPoint(5).y).toBeCloseTo(93.4);
  expect(journeyPoint(-1)).toEqual({ x: 55.3, y: 96.8 });
  expect(journeyPoint(151)).toEqual({ x: 56.5, y: 5.6 });
  expect(journeyPoint(Number.NaN)).toEqual({ x: 55.3, y: 96.8 });
});
