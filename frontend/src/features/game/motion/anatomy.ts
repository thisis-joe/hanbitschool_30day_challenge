import type { CharacterId } from '../types';
export type Point = readonly [number, number];
export interface Anatomy {
  shoulder: Point;
  elbow: Point;
  palm: Point;
  farShoulder: Point;
  mouth: Point;
  eyes: readonly [Point, Point];
}
/** Landmarks measured on the original 128 × 176 artwork, not clothing bounds. */
export const ANATOMY: Record<CharacterId, Anatomy> = {
  haru: {
    shoulder: [52, 111],
    elbow: [47, 125],
    palm: [47, 139],
    farShoulder: [77, 112],
    mouth: [76, 92],
    eyes: [
      [64, 77],
      [90, 79],
    ],
  },
  naru: {
    shoulder: [62, 111],
    elbow: [57, 125],
    palm: [54, 138],
    farShoulder: [85, 112],
    mouth: [84, 92],
    eyes: [
      [70, 77],
      [95, 77],
    ],
  },
  sodam: {
    shoulder: [56, 105],
    elbow: [52, 121],
    palm: [51, 137],
    farShoulder: [82, 108],
    mouth: [80, 89],
    eyes: [
      [64, 74],
      [94, 75],
    ],
  },
  iden: {
    shoulder: [50, 105],
    elbow: [46, 122],
    palm: [45, 138],
    farShoulder: [77, 107],
    mouth: [79, 85],
    eyes: [
      [65, 68],
      [94, 71],
    ],
  },
  arin: {
    shoulder: [70, 119],
    elbow: [65, 131],
    palm: [63, 142],
    farShoulder: [93, 121],
    mouth: [87, 101],
    eyes: [
      [76, 86],
      [100, 87],
    ],
  },
  rumi: {
    shoulder: [57, 123],
    elbow: [54, 134],
    palm: [54, 144],
    farShoulder: [79, 124],
    mouth: [77, 104],
    eyes: [
      [62, 92],
      [89, 92],
    ],
  },
  onyu: {
    shoulder: [53, 112],
    elbow: [49, 127],
    palm: [48, 140],
    farShoulder: [77, 114],
    mouth: [79, 93],
    eyes: [
      [63, 77],
      [91, 80],
    ],
  },
  bora: {
    shoulder: [64, 108],
    elbow: [58, 123],
    palm: [55, 138],
    farShoulder: [84, 111],
    mouth: [85, 89],
    eyes: [
      [65, 74],
      [94, 75],
    ],
  },
  sion: {
    shoulder: [57, 113],
    elbow: [52, 127],
    palm: [49, 139],
    farShoulder: [81, 115],
    mouth: [77, 94],
    eyes: [
      [64, 78],
      [93, 80],
    ],
  },
};
export function rotated(point: Point, pivot: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const x = point[0] - pivot[0],
    y = point[1] - pivot[1];
  return [pivot[0] + x * c - y * s, pivot[1] + x * s + y * c];
}
/** Solve a bent knee with a fixed foot target, keeping both bones joined. */
export function knee(hip: Point, ankle: Point, upper: number, lower: number): Point {
  const dx = ankle[0] - hip[0],
    dy = ankle[1] - hip[1];
  const distance = Math.max(0.01, Math.hypot(dx, dy));
  const d = Math.min(distance, upper + lower - 0.001);
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return [
    hip[0] + (dx / distance) * along + (dy / distance) * height,
    hip[1] + (dy / distance) * along - (dx / distance) * height,
  ];
}
