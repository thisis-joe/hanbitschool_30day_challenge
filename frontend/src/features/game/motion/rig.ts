import { renderAvatar, avatarAnchor, avatarHatPlacement } from '../avatarRenderer';
import { equipmentArt, equipmentSvg, parseItemId } from '../artwork';
import type { CharacterId, Equipment } from '../types';
import type { AvatarPose } from './poses';
import { ANATOMY, knee, rotated } from './anatomy';
import type { Point } from './anatomy';

type Box = readonly [number, number, number, number];
type Chain = readonly [Point, Point, Point];
interface Limb {
  image: HTMLCanvasElement;
  joints: Chain;
  bounds: Box;
}
interface Gear {
  image: HTMLImageElement;
  value: number;
}
export interface AvatarRig {
  body: HTMLCanvasElement;
  heads: Record<AvatarPose['expression'], HTMLCanvasElement>;
  hair: HTMLCanvasElement;
  nearArm: Limb;
  farArm: Limb;
  nearLeg: Limb;
  farLeg: Limb;
  anchor: ReturnType<typeof avatarAnchor>;
  neck: Point;
  pelvis: Point;
  headBottom: number;
  skin: string;
  face?: Gear;
  hat?: Gear & { fit: ReturnType<typeof avatarHatPlacement> };
  held?: Gear;
}
function surface() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 176;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Game canvas is unavailable');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}
const skinPixel = (data: Uint8ClampedArray, p: number) =>
  p >= 0 &&
  p < data.length &&
  data[p + 3] > 100 &&
  data[p] > data[p + 1] * 1.05 &&
  data[p + 1] > data[p + 2] * 1.05 &&
  data[p + 1] > 95;
const HAIR_BOUNDS: Record<CharacterId, readonly [number, number, number]> = {
  haru: [42, 110, 107],
  naru: [52, 91, 109],
  sodam: [45, 88, 146],
  iden: [40, 110, 99],
  arin: [60, 100, 137],
  rumi: [46, 89, 122],
  onyu: [42, 108, 108],
  bora: [53, 93, 165],
  sion: [45, 108, 110],
};
function isBackHair(character: CharacterId, x: number, y: number) {
  const [left, right, bottom] = HAIR_BOUNDS[character];
  return y < bottom && (x < left || x > right);
}
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function copyPixel(to: ImageData, from: ImageData, x: number, y: number) {
  const p = (y * 128 + x) * 4;
  to.data.set(from.data.subarray(p, p + 4), p);
}
async function gear(
  id: string | null,
  slot: 'face' | 'hat' | 'hand',
  signal: AbortSignal,
): Promise<Gear | undefined> {
  const item = id && parseItemId(id),
    art = item && item.slot === slot && equipmentArt(id!);
  if (!item || !art) return;
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(equipmentSvg(art));
  await image.decode();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return { image, value: item.value };
}
/** Preserve the painted textures; joints and overlapping mesh strips keep limbs connected. */
export async function buildAvatarRig(
  character: CharacterId,
  equipment: Equipment,
  signal: AbortSignal,
): Promise<AvatarRig> {
  const body = surface(),
    bare = surface();
  const [, , face, hat, held] = await Promise.all([
    renderAvatar(
      body.canvas,
      character,
      { ...equipment, hand: null, face: null, hat: null },
      signal,
    ),
    renderAvatar(
      bare.canvas,
      character,
      { face: null, hat: null, top: null, bottom: null, shoes: null, hand: null },
      signal,
    ),
    gear(equipment.face, 'face', signal),
    gear(equipment.hat, 'hat', signal),
    gear(equipment.hand, 'hand', signal),
  ]);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const a = avatarAnchor(character),
    anatomy = ANATOMY[character];
  const source = body.ctx.getImageData(0, 0, 128, 176),
    original = bare.ctx.getImageData(0, 0, 128, 176);
  const remaining = body.ctx.getImageData(0, 0, 128, 176);
  const arm = (joints: Chain, bounds: Box, farSide = false): Limb => {
    const layer = surface(),
      pixels = layer.ctx.createImageData(128, 176);
    const [left, top, right, bottom] = bounds;
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        const p = (y * 128 + x) * 4;
        // Skin plus its original one-pixel outline. Do not carry clothing or long hair into an arm.
        let belongs = skinPixel(original.data, p);
        if (!belongs && original.data[p + 3] > 80 && original.data[p + 1] < 160)
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              if (skinPixel(original.data, p + (dy * 128 + dx) * 4)) belongs = true;
        // Hands overlap the shorts vertically; never cut the adjacent thigh out with them.
        if (y >= a.pants[1] && (farSide ? x < a.pants[2] : x > a.pants[0] + 5)) belongs = false;
        if (!belongs) continue;
        copyPixel(pixels, original, x, y);
        // Keep any sleeve already painted above the original skin.
        if (
          source.data[p] === original.data[p] &&
          source.data[p + 1] === original.data[p + 1] &&
          source.data[p + 2] === original.data[p + 2]
        )
          remaining.data[p + 3] = 0;
      }
    layer.ctx.putImageData(pixels, 0, 0);
    return { image: layer.canvas, joints, bounds };
  };
  const { shoulder, elbow, palm, farShoulder } = anatomy;
  const armBounds: Box = [
    Math.floor(Math.min(shoulder[0], palm[0]) - 9),
    shoulder[1] - 6,
    shoulder[0] + 6,
    palm[1] + 8,
  ];
  const nearArm = arm([shoulder, elbow, palm], armBounds);
  const farSource = arm(
    [farShoulder, [farShoulder[0] + 2, elbow[1]], [farShoulder[0] + 3, palm[1]]],
    [farShoulder[0] - 2, farShoulder[1] - 3, farShoulder[0] + 9, palm[1] + 8],
    true,
  );
  // The far arm is occluded in the original. A mirrored complete texture has a real shoulder and elbow.
  const far = surface();
  far.ctx.translate(...farShoulder);
  far.ctx.scale(-0.86, 0.94);
  far.ctx.translate(-shoulder[0], -shoulder[1]);
  far.ctx.drawImage(nearArm.image, 0, 0);
  const mirrored = (p: Point): Point => [
    farShoulder[0] - (p[0] - shoulder[0]) * 0.86,
    farShoulder[1] + (p[1] - shoulder[1]) * 0.94,
  ];
  const farArm: Limb = {
    ...farSource,
    image: far.canvas,
    joints: [farShoulder, mirrored(elbow), mirrored(palm)],
    bounds: [farShoulder[0] - 7, farShoulder[1] - 6, farShoulder[0] + 18, palm[1] + 8],
  };
  const hipY = a.pants[3] - 5,
    split = Math.round((a.feet[0] + a.feet[1] + 17) / 2);
  const leg = (index: number, bounds: Box): Limb => {
    const layer = surface(),
      pixels = layer.ctx.createImageData(128, 176);
    const ankle: Point = [a.feet[index] + 8, 163],
      hip: Point = [a.feet[index] + 13, hipY];
    const length = distance(hip, ankle) * 0.54;
    for (let y = bounds[1]; y < bounds[3]; y++)
      for (let x = bounds[0]; x < bounds[2]; x++) {
        copyPixel(pixels, remaining, x, y);
        remaining.data[(y * 128 + x) * 4 + 3] = 0;
      }
    layer.ctx.putImageData(pixels, 0, 0);
    return { image: layer.canvas, joints: [hip, knee(hip, ankle, length, length), ankle], bounds };
  };
  const head = surface(),
    hair = surface(),
    headPixels = head.ctx.createImageData(128, 176),
    hairPixels = hair.ctx.createImageData(128, 176);
  const headBottom = a.shirt[1] - 3;
  for (let y = 0; y < 176; y++)
    for (let x = 0; x < 128; x++) {
      const p = (y * 128 + x) * 4;
      if (y < headBottom) {
        copyPixel(headPixels, original, x, y);
        remaining.data[p + 3] = 0;
      }
      // Braids, ponytail and long side hair remain behind the shoulders and legs.
      else if (isBackHair(character, x, y) && original.data[p + 3]) {
        copyPixel(hairPixels, original, x, y);
        remaining.data[p + 3] = 0;
      }
    }
  head.ctx.putImageData(headPixels, 0, 0);
  hair.ctx.putImageData(hairPixels, 0, 0);
  const nearLeg = leg(0, [a.feet[0] - 2, hipY, split, 173]),
    farLeg = leg(1, [split, hipY, a.feet[1] + 27, 173]);
  // The torso owns neither feet nor the original arm outlines outside its clothing.
  for (let y = a.shirt[1]; y < 176; y++)
    for (let x = 0; x < 128; x++)
      if (y >= hipY || x < a.shirt[0] - 3 || x > a.shirt[2] + 3)
        remaining.data[(y * 128 + x) * 4 + 3] = 0;
  body.ctx.putImageData(remaining, 0, 0);
  if (hat) {
    const fit = avatarHatPlacement(character, hat.value);
    if (!fit.crown)
      head.ctx.clearRect(fit.scalp[0], 0, fit.scalp[1] - fit.scalp[0], fit.scalpBottom);
  }
  const skinIndex = ((a.eyes[0][1] + 9) * 128 + a.eyes[0][0] + 2) * 4;
  const skin = `rgb(${original.data[skinIndex]},${original.data[skinIndex + 1]},${original.data[skinIndex + 2]})`;
  return {
    body: body.canvas,
    heads: {
      neutral: head.canvas,
      smile: expressiveHead(head.canvas, original, anatomy.eyes, anatomy.mouth, 'smile'),
      sad: expressiveHead(head.canvas, original, anatomy.eyes, anatomy.mouth, 'sad'),
    },
    hair: hair.canvas,
    nearArm,
    farArm,
    nearLeg,
    farLeg,
    anchor: a,
    neck: [(a.shirt[0] + a.shirt[2]) / 2, a.shirt[1] + 1],
    pelvis: [(a.pants[0] + a.pants[2]) / 2, hipY],
    headBottom,
    skin,
    face,
    hat: hat && { ...hat, fit: avatarHatPlacement(character, hat.value) },
    held,
  };
}
function expressiveHead(
  base: HTMLCanvasElement,
  original: ImageData,
  eyes: readonly Point[],
  mouth: Point,
  expression: 'smile' | 'sad',
) {
  const layer = surface();
  layer.ctx.drawImage(base, 0, 0);
  const pixels = layer.ctx.getImageData(0, 0, 128, 176);
  // Small feature-shaped masks use nearby cheek tones; no rectangles can spill beyond the face.
  const patches = [
    ...eyes.map(([x, y], i) => ({ x, y: y + 1, rx: i ? 6 : 10, ry: 8 })),
    { x: mouth[0], y: mouth[1], rx: 10, ry: 6 },
  ];
  for (const patch of patches) {
    const samples: { x: number; y: number; p: number }[] = [];
    for (let y = Math.floor(patch.y - patch.ry - 3); y <= patch.y + patch.ry + 3; y++)
      for (let x = Math.floor(patch.x - patch.rx - 3); x <= patch.x + patch.rx + 3; x++) {
        const d = ((x - patch.x) / patch.rx) ** 2 + ((y - patch.y) / patch.ry) ** 2,
          p = (y * 128 + x) * 4;
        if (d > 1 && d < 2 && skinPixel(original.data, p)) samples.push({ x, y, p });
      }
    for (let y = patch.y - patch.ry; y <= patch.y + patch.ry; y++)
      for (let x = patch.x - patch.rx; x <= patch.x + patch.rx; x++) {
        const d = ((x - patch.x) / patch.rx) ** 2 + ((y - patch.y) / patch.ry) ** 2,
          p = (y * 128 + x) * 4;
        if (d > 1 || pixels.data[p + 3] < 200 || !samples.length) continue;
        let weight = 0;
        const rgb = [0, 0, 0];
        for (const sample of samples) {
          const w = 1 / (1 + ((x - sample.x) ** 2 + (y - sample.y) ** 2) ** 2);
          weight += w;
          for (let c = 0; c < 3; c++) rgb[c] += original.data[sample.p + c] * w;
        }
        for (let c = 0; c < 3; c++) pixels.data[p + c] = rgb[c] / weight;
      }
  }
  layer.ctx.putImageData(pixels, 0, 0);
  const ctx = layer.ctx;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = '#48302b';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  eyes.forEach(([x, y], index) => {
    const width = index ? 3 : 4.5;
    ctx.beginPath();
    ctx.moveTo(x - width, y + 3);
    ctx.quadraticCurveTo(x, expression === 'smile' ? y - 3 : y + 5, x + width, y + 3);
    ctx.stroke();
    if (expression === 'sad') {
      ctx.beginPath();
      ctx.moveTo(x - width, y - 5);
      ctx.lineTo(x + width, y - 8);
      ctx.stroke();
    }
  });
  ctx.strokeStyle = '#703c32';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mouth[0] - 4, mouth[1]);
  ctx.quadraticCurveTo(
    mouth[0],
    mouth[1] + (expression === 'smile' ? 4 : -3),
    mouth[0] + 4,
    mouth[1],
  );
  ctx.stroke();
  return layer.canvas;
}
function rotate(ctx: CanvasRenderingContext2D, pivot: Point, degrees: number) {
  ctx.translate(...pivot);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-pivot[0], -pivot[1]);
}
/** One-pixel texture strips overlap slightly: no antialiased triangle seams through hair or joints. */
function mesh(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  bounds: Box,
  map: (p: Point) => Point,
) {
  const width = bounds[2] - bounds[0];
  for (let y = bounds[1]; y < bounds[3]; y++) {
    const p = map([bounds[0], y]),
      q = map([bounds[2], y]),
      r = map([bounds[0], y + 1]);
    ctx.save();
    ctx.transform(
      (q[0] - p[0]) / width,
      (q[1] - p[1]) / width,
      r[0] - p[0],
      r[1] - p[1],
      p[0],
      p[1],
    );
    ctx.drawImage(image, bounds[0], y, width, 1, 0, -0.3, width, 1.6);
    ctx.restore();
  }
}
function limb(
  ctx: CanvasRenderingContext2D,
  part: Limb,
  target: Chain,
  skin: string,
  foot = false,
) {
  // The resting sprite hides skin under hands and clothes. Reconstruct that narrow joint core
  // beneath its original texture so bending can never reveal a transparent knee or shoulder.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(...target[0]);
  ctx.lineTo(...target[1]);
  ctx.lineTo(...target[2]);
  ctx.strokeStyle = '#79503b';
  ctx.lineWidth = foot ? 8 : 7;
  ctx.stroke();
  ctx.strokeStyle = skin;
  ctx.lineWidth = foot ? 6 : 5;
  ctx.stroke();
  ctx.restore();
  const [a, b, c] = part.joints,
    [p, q, r] = target;
  const angle = (s: Point, e: Point, t: Point, u: Point) =>
    Math.atan2(u[1] - t[1], u[0] - t[0]) - Math.atan2(e[1] - s[1], e[0] - s[0]);
  const first = angle(a, b, p, q),
    second = angle(b, c, q, r);
  mesh(ctx, part.image, part.bounds, ([x, y]) => {
    const lower = y > b[1],
      start = lower ? b : a,
      end = lower ? c : b,
      targetStart = lower ? q : p,
      targetEnd = lower ? r : q;
    const t = Math.max(0, Math.min(1, (y - start[1]) / (end[1] - start[1])));
    const center: Point = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    const mapped: Point = [
      targetStart[0] + (targetEnd[0] - targetStart[0]) * t,
      targetStart[1] + (targetEnd[1] - targetStart[1]) * t,
    ];
    const blend = Math.max(0, Math.min(1, (y - b[1] + 3) / 6));
    let theta = first + (second - first) * blend;
    if (foot) theta *= 1 - Math.max(0, Math.min(1, (y - c[1] + 3) / 3));
    return [
      mapped[0] + (x - center[0]) * Math.cos(theta) - (y - center[1]) * Math.sin(theta),
      mapped[1] + (x - center[0]) * Math.sin(theta) + (y - center[1]) * Math.cos(theta),
    ];
  });
}
function armTarget(part: Limb, angle: number, bend: number): Chain {
  const [shoulder, elbow, palm] = part.joints,
    nextElbow = rotated(elbow, shoulder, angle);
  return [shoulder, nextElbow, rotated(rotated(palm, shoulder, angle), nextElbow, bend)];
}
function legTarget(
  part: Limb,
  step: number,
  lift: number,
  drop: number,
  pelvis: Point,
  bow: number,
): Chain {
  const [hip, joint, ankle] = part.joints;
  const moved = rotated(hip, pelvis, bow);
  const root: Point = [moved[0], moved[1] + drop],
    foot: Point = [ankle[0] + step, ankle[1] - lift];
  return [root, knee(root, foot, distance(hip, joint), distance(joint, ankle)), foot];
}
export function paintAvatarPose(canvas: HTMLCanvasElement, rig: AvatarRig, pose: AvatarPose) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(24, 26 - pose.lift);
  // Hair follows the head with a delayed flexible tip, and stays behind the limbs.
  ctx.save();
  ctx.translate(0, pose.drop);
  rotate(ctx, rig.pelvis, pose.bow);
  rotate(ctx, rig.neck, pose.head);
  if (!pose.hair) ctx.drawImage(rig.hair, 0, 0);
  else
    mesh(ctx, rig.hair, [0, rig.headBottom, 128, 176], ([x, y]) => [
      x + Math.sin((((y - rig.headBottom) / 65) * Math.PI) / 2) * pose.hair * 1.7,
      y,
    ]);
  ctx.restore();
  limb(
    ctx,
    rig.farLeg,
    legTarget(rig.farLeg, pose.farStep, pose.farFootLift, pose.drop, rig.pelvis, pose.bow),
    rig.skin,
    true,
  );
  limb(
    ctx,
    rig.nearLeg,
    legTarget(rig.nearLeg, pose.nearStep, pose.nearFootLift, pose.drop, rig.pelvis, pose.bow),
    rig.skin,
    true,
  );
  ctx.translate(0, pose.drop);
  rotate(ctx, rig.pelvis, pose.bow);
  limb(ctx, rig.farArm, armTarget(rig.farArm, pose.farArm, pose.farElbow), rig.skin);
  ctx.drawImage(rig.body, 0, 0);
  const near = armTarget(rig.nearArm, pose.nearArm, pose.nearElbow);
  ctx.save();
  rotate(ctx, rig.neck, pose.head);
  const hairLine = Math.min(...rig.anchor.eyes.map((p) => p[1])) - 14;
  if (!pose.hair) ctx.drawImage(rig.heads[pose.expression], 0, 0);
  else
    mesh(ctx, rig.heads[pose.expression], [0, 0, 128, rig.headBottom], ([x, y]) => {
      const weight = Math.max(0, Math.min(1, (hairLine - y) / 28));
      return [x + pose.hair * weight, y + Math.abs(pose.hair) * weight * 0.18];
    });
  // Expressions are part of the head texture. Glasses and hats always draw above them.
  if (rig.face) {
    const [nearEye, farEye] = rig.anchor.eyes,
      scale = (farEye[0] - nearEye[0]) / 28,
      shear = (farEye[1] - nearEye[1] - scale) / 28;
    ctx.save();
    ctx.transform(
      scale,
      shear,
      0,
      scale,
      nearEye[0] - 30 * scale,
      nearEye[1] - 30 * shear - 17 * scale,
    );
    ctx.drawImage(rig.face.image, 0, 0);
    ctx.restore();
  }
  if (rig.hat) {
    const { fit, image } = rig.hat;
    ctx.drawImage(
      image,
      Math.round(fit.x),
      Math.round(fit.y),
      Math.round(fit.width),
      Math.round(fit.height),
    );
  }
  ctx.restore();
  if (rig.held) {
    ctx.save();
    ctx.translate(...near[2]);
    ctx.rotate(((pose.nearArm + pose.nearElbow) * Math.PI) / 180);
    const scale = rig.held.value <= 3 ? 0.82 : 0.9,
      handleY = rig.held.value <= 3 ? 27 : 36;
    ctx.drawImage(rig.held.image, -16 * scale, -handleY * scale, 32 * scale, 58 * scale);
    ctx.restore();
  }
  limb(ctx, rig.nearArm, near, rig.skin);
  ctx.restore();
}
