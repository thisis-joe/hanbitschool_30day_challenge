import { renderAvatar, avatarAnchor } from '../avatarRenderer';
import { equipmentArt, equipmentSvg, parseItemId } from '../artwork';
import type { CharacterId, Equipment } from '../types';
import type { AvatarPose } from './poses';

type Point = readonly [number, number];
interface Limb {
  image: HTMLCanvasElement;
  pivot: Point;
}
export interface AvatarRig {
  body: HTMLCanvasElement;
  nearArm: Limb;
  farArm: Limb;
  nearLeg: Limb;
  farLeg: Limb;
  anchor: ReturnType<typeof avatarAnchor>;
  skin: string;
  glasses: boolean;
  held?: { image: HTMLImageElement; scale: number; handleY: number };
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
const isSkin = (data: Uint8ClampedArray, p: number) =>
  data[p + 3] > 100 &&
  data[p] > data[p + 1] * 1.08 &&
  data[p + 1] > data[p + 2] * 1.08 &&
  data[p + 1] > 105;

/** Cut runtime limb layers from the existing art, retaining long hair behind the arms. */
export async function buildAvatarRig(
  character: CharacterId,
  equipment: Equipment,
  signal: AbortSignal,
): Promise<AvatarRig> {
  const body = surface(),
    bare = surface();
  await Promise.all([
    renderAvatar(body.canvas, character, { ...equipment, hand: null }, signal),
    renderAvatar(
      bare.canvas,
      character,
      { face: null, hat: null, top: null, bottom: null, shoes: null, hand: null },
      signal,
    ),
  ]);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const a = avatarAnchor(character);
  const source = body.ctx.getImageData(0, 0, 128, 176);
  const original = bare.ctx.getImageData(0, 0, 128, 176);
  const remaining = body.ctx.getImageData(0, 0, 128, 176);
  const extract = (
    pivot: Point,
    bounds: [number, number, number, number],
    skinOnly: boolean,
  ): Limb => {
    const layer = surface(),
      pixels = layer.ctx.createImageData(128, 176);
    const [left, top, right, bottom] = bounds;
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        const p = (y * 128 + x) * 4;
        // Include the one-pixel outline of a limb, but leave hair in the body layer.
        if (skinOnly) {
          let belongs = false;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              if (isSkin(original.data, p + dy * 512 + dx * 4)) belongs = true;
          if (!belongs) continue;
        }
        pixels.data.set(source.data.subarray(p, p + 4), p);
        remaining.data[p + 3] = 0;
      }
    layer.ctx.putImageData(pixels, 0, 0);
    return { image: layer.canvas, pivot };
  };
  const [left, top, right] = a.shirt;
  const hip = a.pants[3] - 1,
    middle = Math.round((a.feet[0] + a.feet[1] + 17) / 2);
  const nearArm = extract([left + 2, top + 5], [left - 12, top + 3, left + 8, a.grip[1] + 9], true);
  const farArm = extract(
    [right - 2, top + 6],
    [right - 4, top + 4, right + 12, a.grip[1] + 9],
    true,
  );
  // The far arm is mostly hidden in the resting artwork. Reuse the complete near
  // arm for raised/walking poses instead of stretching its thin visible edge.
  const far = surface();
  far.ctx.translate(farArm.pivot[0], farArm.pivot[1]);
  far.ctx.scale(-0.88, 0.94);
  far.ctx.translate(-nearArm.pivot[0], -nearArm.pivot[1]);
  far.ctx.drawImage(nearArm.image, 0, 0);
  farArm.image = far.canvas;
  const nearLeg = extract([a.feet[0] + 9, hip], [a.feet[0] - 2, hip, middle, 173], false);
  const farLeg = extract([a.feet[1] + 9, hip], [middle, hip, a.feet[1] + 29, 173], false);
  body.ctx.putImageData(remaining, 0, 0);
  const skinIndex = ((a.eyes[0][1] + 8) * 128 + a.eyes[0][0] + 3) * 4;
  const skin = `rgb(${original.data[skinIndex]},${original.data[skinIndex + 1]},${original.data[skinIndex + 2]})`;
  const rig: AvatarRig = {
    body: body.canvas,
    nearArm,
    farArm,
    nearLeg,
    farLeg,
    anchor: a,
    skin,
    glasses: !!equipment.face,
  };
  const item = equipment.hand && parseItemId(equipment.hand);
  const art = item && item.slot === 'hand' && equipmentArt(equipment.hand!);
  if (item && art) {
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(equipmentSvg(art));
    await image.decode();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    rig.held = { image, scale: item.value <= 3 ? 0.82 : 0.9, handleY: item.value <= 3 ? 27 : 36 };
  }
  return rig;
}
function rotate(ctx: CanvasRenderingContext2D, pivot: Point, degrees: number) {
  ctx.translate(...pivot);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-pivot[0], -pivot[1]);
}
function limb(ctx: CanvasRenderingContext2D, part: Limb, angle: number) {
  ctx.save();
  rotate(ctx, part.pivot, angle);
  ctx.drawImage(part.image, 0, 0);
  ctx.restore();
}
export function paintAvatarPose(canvas: HTMLCanvasElement, rig: AvatarRig, pose: AvatarPose) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(24, 26 - pose.lift);
  limb(ctx, rig.farLeg, pose.farLeg);
  limb(ctx, rig.nearLeg, pose.nearLeg);
  ctx.translate(0, pose.drop);
  rotate(ctx, [rig.anchor.shirt[0] + 16, rig.anchor.pants[1]], pose.bow);
  ctx.drawImage(rig.body, 0, 0);
  expression(ctx, rig, pose);
  limb(ctx, rig.farArm, pose.farArm);
  ctx.save();
  rotate(ctx, rig.nearArm.pivot, pose.nearArm);
  if (rig.held) {
    const { image, scale, handleY } = rig.held,
      [x, y] = rig.anchor.grip;
    ctx.drawImage(image, x - 16 * scale, y - handleY * scale, 32 * scale, 58 * scale);
  }
  ctx.drawImage(rig.nearArm.image, 0, 0);
  ctx.restore();
  ctx.restore();
}
function expression(ctx: CanvasRenderingContext2D, rig: AvatarRig, pose: AvatarPose) {
  if (pose.expression === 'neutral') return;
  const [near, far] = rig.anchor.eyes;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!rig.glasses)
    for (const [x, y] of [near, far]) {
      ctx.fillStyle = rig.skin;
      ctx.fillRect(x - 7, y - 3, 15, 16);
      ctx.strokeStyle = '#48302b';
      ctx.beginPath();
      if (pose.expression === 'smile') {
        ctx.moveTo(x - 4, y + 6);
        ctx.lineTo(x, y + 2);
        ctx.lineTo(x + 4, y + 6);
      } else {
        ctx.moveTo(x - 4, y + 3);
        ctx.lineTo(x + 3, y + 5);
      }
      ctx.stroke();
    }
  const mx = (near[0] + far[0]) / 2 + 4,
    my = Math.max(near[1], far[1]) + 14;
  ctx.fillStyle = rig.skin;
  ctx.fillRect(mx - 7, my - 2, 14, 9);
  ctx.strokeStyle = '#6d3430';
  ctx.beginPath();
  ctx.moveTo(mx - 4, my + 2);
  ctx.quadraticCurveTo(mx, pose.expression === 'smile' ? my + 10 : my - 3, mx + 4, my + 2);
  ctx.stroke();
}
