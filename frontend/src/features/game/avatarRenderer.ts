import { equipmentArt, equipmentSvg, parseItemId } from './artwork';
import type { EquipmentArt } from './artwork';
import { CHARACTER_IDS, SLOTS } from './types';
import type { CharacterId, Equipment, Slot } from './types';

type Point = [number, number];
type Box = [number, number, number, number];
interface Anchor {
  eyes: [Point, Point];
  ear: Point;
  shirt: Box;
  pants: Box;
  feet: Point;
  head: Point;
  grip: Point;
}
interface Bitmap {
  image: HTMLImageElement;
  art: EquipmentArt;
}
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const equipmentGripCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
const renderIdentity = new WeakMap<HTMLCanvasElement, object>();

const HAT_FITS = [
  { cx: 65, seat: 53, sx: 1.15, sy: 1.75 },
  { cx: 67, seat: 58, sx: 1.17, sy: 1.75 },
  { cx: 64, seat: 52, sx: 1.15, sy: 1.7 },
  { cx: 62, seat: 47, sx: 1.12, sy: 1.55 },
  { cx: 73, seat: 68, sx: 1.04, sy: 1.65 },
  { cx: 68, seat: 73, sx: 1.14, sy: 1.75 },
  { cx: 64, seat: 54, sx: 1.16, sy: 1.75 },
  { cx: 67, seat: 54, sx: 1.16, sy: 1.7 },
  { cx: 67, seat: 56, sx: 1.18, sy: 1.85 },
];
const HAT_SCALP_BOUNDS: [number, number][] = [
  [14, 118],
  [19, 116],
  [16, 114],
  [15, 113],
  [75, 119],
  [30, 111],
  [12, 115],
  [21, 119],
  [12, 120],
];
const ANCHORS: Anchor[] = [
  {
    eyes: [
      [65, 79],
      [91, 81],
    ],
    ear: [36, 80],
    shirt: [48, 105, 79, 134],
    pants: [48, 134, 80, 146],
    feet: [45, 64],
    head: [65, 38],
    grip: [47, 139],
  },
  {
    eyes: [
      [72, 79],
      [97, 79],
    ],
    ear: [36, 80],
    shirt: [59, 105, 86, 134],
    pants: [59, 134, 88, 146],
    feet: [53, 72],
    head: [69, 42],
    grip: [54, 138],
  },
  {
    eyes: [
      [66, 75],
      [97, 76],
    ],
    ear: [34, 75],
    shirt: [51, 99, 84, 133],
    pants: [52, 133, 85, 145],
    feet: [48, 70],
    head: [65, 36],
    grip: [51, 137],
  },
  {
    eyes: [
      [67, 70],
      [95, 75],
    ],
    ear: [32, 73],
    shirt: [46, 99, 78, 133],
    pants: [46, 133, 80, 146],
    feet: [42, 63],
    head: [62, 29],
    grip: [45, 138],
  },
  {
    eyes: [
      [77, 89],
      [103, 90],
    ],
    ear: [48, 93],
    shirt: [68, 112, 94, 145],
    pants: [67, 145, 94, 151],
    feet: [61, 80],
    head: [81, 55],
    grip: [63, 142],
  },
  {
    eyes: [
      [64, 93],
      [90, 94],
    ],
    ear: [42, 99],
    shirt: [54, 117, 80, 145],
    pants: [53, 145, 82, 152],
    feet: [52, 69],
    head: [70, 59],
    grip: [54, 144],
  },
  {
    eyes: [
      [64, 79],
      [93, 82],
    ],
    ear: [34, 80],
    shirt: [47, 105, 78, 136],
    pants: [47, 136, 79, 147],
    feet: [43, 63],
    head: [63, 40],
    grip: [48, 140],
  },
  {
    eyes: [
      [67, 74],
      [96, 76],
    ],
    ear: [36, 77],
    shirt: [59, 101, 86, 137],
    pants: [58, 137, 89, 146],
    feet: [55, 76],
    head: [70, 37],
    grip: [55, 138],
  },
  {
    eyes: [
      [66, 80],
      [94, 84],
    ],
    ear: [37, 82],
    shirt: [53, 107, 83, 137],
    pants: [52, 137, 86, 146],
    feet: [48, 70],
    head: [70, 42],
    grip: [49, 139],
  },
];

const MOTION_GRIPS: Point[] = [
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
export function avatarAnchor(characterId: CharacterId): Anchor & { grip: Point } {
  const index = CHARACTER_IDS.indexOf(characterId);
  return { ...ANCHORS[index], grip: MOTION_GRIPS[index] };
}

/** Shared placement for the static renderer and the articulated head layer. */
export function avatarHatPlacement(characterId: CharacterId, value: number) {
  const index = CHARACTER_IDS.indexOf(characterId),
    fit = HAT_FITS[index];
  const crown = value === 5,
    sx = crown ? 0.94 : fit.sx * 0.96,
    sy = crown ? 0.82 : 1.18;
  const seat = crown ? ANCHORS[index].head[1] : fit.seat;
  return {
    x: fit.cx - 56 * sx,
    y: seat - 42 * sy,
    width: 112 * sx,
    height: 64 * sy,
    scalp: HAT_SCALP_BOUNDS[index],
    scalpBottom: fit.seat - 5,
    crown,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
    const loaded = () => {
      cleanup();
      if (image.naturalWidth) resolve(image);
      else reject(new Error('Empty game image'));
    };
    const failed = () => {
      cleanup();
      reject(new Error('Unable to load game image'));
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    image.src = src;
    if (image.complete) {
      if (image.naturalWidth) loaded();
      else failed();
    }
  });
  imageCache.set(src, pending);
  void pending.catch(() => {
    if (imageCache.get(src) === pending) imageCache.delete(src);
  });
  return pending;
}

function abortError(): DOMException {
  return new DOMException('Avatar rendering aborted', 'AbortError');
}

function abortable<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(abortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Game canvas is unavailable');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** All images load before painting. A failed/aborted/stale frame cannot clear a newer frame. */
export async function renderAvatar(
  canvas: HTMLCanvasElement,
  characterId: CharacterId,
  equipped: Equipment,
  signal?: AbortSignal,
): Promise<void> {
  const identity = {};
  renderIdentity.set(canvas, identity);
  if (signal?.aborted) throw abortError();
  const index = CHARACTER_IDS.indexOf(characterId);
  if (index < 0) throw new Error('Unknown game character');
  // Snapshot only canonical item IDs whose actual slot matches the attachment.
  const gear: Partial<Record<Slot, number>> = {};
  const designs = new Map<string, EquipmentArt>();
  for (const slot of SLOTS) {
    const id = equipped[slot];
    const item = typeof id === 'string' ? parseItemId(id) : null;
    if (!item || item.slot !== slot) continue;
    const art = equipmentArt(id!);
    if (!art) continue;
    gear[slot] = item.value;
    if (slot === 'shoes' && art.parts) {
      art.parts.forEach((part, i) => designs.set(`${slot}:${item.value}:${i}`, part));
    } else designs.set(`${slot}:${item.value}:-1`, art);
  }
  const basePending = loadImage(`/game/characters/${characterId}.png`);
  const layerPending = Promise.all(
    [...designs].map(async ([key, art]) => {
      const image = await loadImage(
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(equipmentSvg(art)),
      );
      return [key, { image, art }] as const;
    }),
  );
  const [base, layers] = await abortable(Promise.all([basePending, layerPending]), signal);
  const current = () => !signal?.aborted && renderIdentity.get(canvas) === identity;
  if (!current()) return;
  const bitmaps = new Map<string, Bitmap>(layers);
  const bitmap = (slot: Slot, value: number, part = -1) => bitmaps.get(`${slot}:${value}:${part}`);
  const scratch = document.createElement('canvas');
  scratch.width = 128;
  scratch.height = 176;
  const ctx = context(scratch);
  ctx.clearRect(0, 0, 128, 176);
  ctx.drawImage(base, 0, 0, 128, 176);
  const a = ANCHORS[index];
  if (gear.hat && gear.hat !== 5) {
    const [left, right] = HAT_SCALP_BOUNDS[index],
      edge = HAT_FITS[index].seat - 5;
    ctx.clearRect(left, 0, right - left, edge);
  }
  const draw = (
    slot: Slot,
    value: number | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
    part = -1,
  ) => {
    if (!value) return;
    const layer = bitmap(slot, value, part);
    if (layer)
      ctx.drawImage(layer.image, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  if (gear.bottom) {
    const [x, y, r, b] = a.pants;
    draw('bottom', gear.bottom, x - 1, y - 1, r - x + 2, Math.max(14, b - y + 2));
  }
  if (gear.top) {
    const [x, y, r, b] = a.shirt;
    draw('top', gear.top, x - 3, y - 2, r - x + 6, b - y + 3);
  }
  if (gear.shoes) {
    const value = gear.shoes;
    // Remove bare toes under the new soles, while preserving the ankles.
    ctx.clearRect(a.feet[0] - 1, 161, a.feet[1] - a.feet[0] + 28, 11);
    a.feet.forEach((x, j) => {
      const part = bitmap('shoes', value, j);
      if (part) draw('shoes', value, x, 170 - part.art.height, part.art.width, part.art.height, j);
    });
  }
  if (gear.hand) {
    const scale = gear.hand <= 3 ? 0.82 : 0.9;
    // The handle/shaft meets the closed palm, not the torso's bounding box.
    const handleY = gear.hand <= 3 ? 27 : 36;
    draw(
      'hand',
      gear.hand,
      a.grip[0] - 16 * scale,
      a.grip[1] - handleY * scale,
      32 * scale,
      58 * scale,
    );
    restoreGrip(ctx, base, a);
  }
  if (gear.face) {
    const layer = bitmap('face', gear.face),
      [near, far] = a.eyes;
    const scale = (far[0] - near[0]) / 28,
      shear = (far[1] - near[1] - scale) / 28;
    if (layer) {
      ctx.save();
      ctx.setTransform(
        scale,
        shear,
        0,
        scale,
        near[0] - 30 * scale,
        near[1] - 30 * shear - 17 * scale,
      );
      ctx.drawImage(layer.image, 0, 0);
      ctx.restore();
    }
  }
  if (gear.hat) {
    const fit = avatarHatPlacement(characterId, gear.hat);
    draw('hat', gear.hat, fit.x, fit.y, fit.width, fit.height);
  }
  if (!current()) return;
  const visible = context(canvas);
  // Canvas dimensions reset pixels, so resize only at the final current-frame commit.
  if (canvas.width !== 128) canvas.width = 128;
  if (canvas.height !== 176) canvas.height = 176;
  visible.imageSmoothingEnabled = false;
  visible.clearRect(0, 0, 128, 176);
  visible.drawImage(scratch, 0, 0);
}

function restoreGrip(ctx: CanvasRenderingContext2D, base: HTMLImageElement, a: Anchor): void {
  const x = Math.max(0, a.grip[0] - 6),
    y = a.grip[1] - 8,
    w = 13,
    h = 14;
  const cached = equipmentGripCache.get(base);
  if (cached) {
    ctx.drawImage(cached, x, y);
    return;
  }
  const scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const s = context(scratch);
  s.drawImage(base, x, y, w, h, 0, 0, w, h);
  const pixels = s.getImageData(0, 0, w, h);
  const skin = (p: number) =>
    p >= 0 &&
    p < pixels.data.length &&
    pixels.data[p + 3] > 120 &&
    pixels.data[p] > pixels.data[p + 1] * 1.08 &&
    pixels.data[p + 1] > pixels.data[p + 2] * 1.08 &&
    pixels.data[p + 1] > 80;
  // Keep the original fist shading and its one-pixel outline over the handle.
  // White clothes, background and hair cannot become a rectangular patch.
  const mask = Array.from({ length: w * h }, (_, p) => {
    const i = p * 4;
    return (
      skin(i) ||
      (pixels.data[i + 3] > 120 &&
        pixels.data[i + 1] < 100 &&
        ((p % w > 0 && skin(i - 4)) ||
          (p % w < w - 1 && skin(i + 4)) ||
          skin(i - w * 4) ||
          skin(i + w * 4)))
    );
  });
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (!mask[i / 4]) pixels.data[i + 3] = 0;
  }
  s.putImageData(pixels, 0, 0);
  equipmentGripCache.set(base, scratch);
  ctx.drawImage(scratch, x, y);
}
