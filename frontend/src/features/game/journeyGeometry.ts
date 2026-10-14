// Fixed percentage geometry from the supplied reference; never learning authority.
export const MAP_ANCHORS: readonly (readonly [number, number])[] = [
  [55.3, 96.8],
  [50.84, 93.4],
  [45.97, 90.05],
  [55.32, 86.7],
  [62.54, 83.35],
  [57, 80],
  [35.66, 75.2],
  [39.23, 70.4],
  [55.03, 65.6],
  [58.48, 60.8],
  [41.7, 56],
  [51.69, 52.2],
  [65.81, 48.4],
  [60.18, 44.6],
  [40.47, 40.8],
  [41.75, 37],
  [61.97, 33.8],
  [71.48, 30.6],
  [65.61, 27.4],
  [66.4, 24.2],
  [61.6, 21],
  [54.53, 19],
  [47.13, 17],
  [39.39, 15],
  [45.01, 13],
  [49.32, 11],
  [50.01, 9.92],
  [50.71, 8.84],
  [52.53, 7.76],
  [54.51, 6.68],
  [56.5, 5.6],
];
export const MAP_TRAIL: readonly (readonly [number, number])[] = [
  [55.3, 96.8],
  [54.7, 95.5],
  [49, 92.4],
  [45, 89.3],
  [57.3, 86.2],
  [63, 83.1],
  [57, 80],
  [39.5, 76.9],
  [32.5, 73.8],
  [38.5, 70.7],
  [46, 67.6],
  [60, 64.5],
  [61, 61.4],
  [48, 58.3],
  [41.7, 56],
  [42.3, 55.2],
  [52, 52.1],
  [66, 49],
  [65, 45.9],
  [53.5, 42.8],
  [33.3, 39.7],
  [43, 36.6],
  [64, 33.5],
  [72, 30.4],
  [65.4, 27.3],
  [66.4, 24.2],
  [62.3, 21.1],
  [61.6, 21],
  [51, 18],
  [39, 14.9],
  [48.8, 11.8],
  [50.8, 8.7],
  [56.5, 5.6],
];
export const REGIONS = ['숲 입구', '깊은 숲', '작은 마을', '항구 마을', '바닷가', '작은 섬'];

// The source terrain is uneven: each seam lies between the two adjacent route groups.
const regionSeams = [100, 77.6, 54.1, 35.4, 20, 10.46, 0];
const regionAccents = ['#8caa68', '#668d7d', '#b3976f', '#c38a65', '#75a7ab', '#8c95b6'];
export const MAP_REGIONS = REGIONS.map((name, index) => ({
  name,
  firstDay: index * 5 + 1,
  lastDay: index * 5 + 5,
  top: regionSeams[index + 1],
  height: Math.round((regionSeams[index] - regionSeams[index + 1]) * 100) / 100,
  accent: regionAccents[index],
}));

export function journeyPoint(step: number): { x: number; y: number } {
  const bounded = Number.isFinite(step) ? Math.max(0, Math.min(150, step)) : 0;
  const day = Math.min(29, Math.floor(bounded / 5));
  const fraction = bounded === 150 ? 1 : (bounded % 5) / 5;
  const y = MAP_ANCHORS[day][1] + (MAP_ANCHORS[day + 1][1] - MAP_ANCHORS[day][1]) * fraction;
  if (y >= MAP_TRAIL[0][1]) return { x: MAP_TRAIL[0][0], y };
  for (let index = 1; index < MAP_TRAIL.length; index++) {
    const a = MAP_TRAIL[index - 1],
      b = MAP_TRAIL[index];
    if (y >= b[1]) return { x: a[0] + (b[0] - a[0]) * ((a[1] - y) / (a[1] - b[1])), y };
  }
  return { x: 56.5, y };
}
