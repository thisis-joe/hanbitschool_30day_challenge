/** Shared timings keep travel, limb animation and the following reward in sync. */
export const MOTION_MS = { walk: 480, happy: 900, sad: 360 } as const;
export type AvatarMotion = 'idle' | 'walk' | 'happy' | 'sad';
export interface AvatarPose {
  nearArm: number;
  farArm: number;
  nearElbow: number;
  farElbow: number;
  nearStep: number;
  farStep: number;
  nearFootLift: number;
  farFootLift: number;
  bow: number;
  head: number;
  drop: number;
  lift: number;
  hair: number;
  expression: 'neutral' | 'smile' | 'sad';
}
const rest: AvatarPose = {
  nearArm: 0,
  farArm: 0,
  nearElbow: 0,
  farElbow: 0,
  nearStep: 0,
  farStep: 0,
  nearFootLift: 0,
  farFootLift: 0,
  bow: 0,
  head: 0,
  drop: 0,
  lift: 0,
  hair: 0,
  expression: 'neutral',
};
export const POSES = {
  idle: rest,
  walkLeft: {
    ...rest,
    nearArm: 23,
    farArm: -23,
    nearElbow: -12,
    farElbow: -8,
    nearStep: -9,
    farStep: 9,
    farFootLift: 5,
    drop: 1,
    head: -1,
    hair: -1.8,
  },
  walkRight: {
    ...rest,
    nearArm: -23,
    farArm: 23,
    nearElbow: -8,
    farElbow: -12,
    nearStep: 9,
    farStep: -9,
    nearFootLift: 5,
    drop: 1,
    head: 1,
    hair: 1.8,
  },
  cheer: { ...rest, nearArm: 112, farArm: -112, nearElbow: 16, farElbow: -16, expression: 'smile' },
  jump: {
    ...rest,
    nearArm: 120,
    farArm: -120,
    nearElbow: 12,
    farElbow: -12,
    nearStep: -3,
    farStep: 3,
    nearFootLift: 5,
    farFootLift: 5,
    lift: 22,
    head: -3,
    hair: -2.5,
    expression: 'smile',
  },
  slump: {
    ...rest,
    nearArm: -9,
    farArm: -7,
    nearElbow: 7,
    farElbow: 6,
    bow: 6,
    head: 3,
    drop: 2,
    hair: 0.6,
    expression: 'sad',
  },
} satisfies Record<string, AvatarPose>;
const ease = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
function blend(from: AvatarPose, to: AvatarPose, amount: number): AvatarPose {
  const pose = { ...to };
  for (const key of Object.keys(from) as (keyof AvatarPose)[])
    if (key !== 'expression') pose[key] = from[key] + (to[key] - from[key]) * amount;
  return pose;
}
export function samplePose(motion: AvatarMotion, elapsed: number, reduced = false): AvatarPose {
  const time = Math.max(0, elapsed);
  if (motion === 'idle' || (reduced && motion === 'walk')) return POSES.idle;
  if (motion === 'walk') {
    if (time >= MOTION_MS.walk) return rest;
    // A complete left/right stride in 240 ms; ease into and out of travel.
    const phase = (time / 240) * Math.PI * 2;
    const envelope = ease(time / 65) * ease((MOTION_MS.walk - time) / 85);
    const stride = Math.sin(phase) * envelope;
    return {
      ...rest,
      nearArm: -25 * stride,
      farArm: 25 * stride,
      nearElbow: -12 * envelope,
      farElbow: -10 * envelope,
      nearStep: 10 * stride,
      farStep: -10 * stride,
      nearFootLift: 7 * Math.max(0, Math.sin(phase)) * envelope,
      farFootLift: 7 * Math.max(0, -Math.sin(phase)) * envelope,
      drop: 1.5 * (1 - Math.cos(phase * 2)) * envelope,
      head: Math.sin(phase - 0.5) * 1.2 * envelope,
      hair: Math.sin(phase - 0.8) * 2.2 * envelope,
    };
  }
  if (motion === 'sad') {
    const pose = blend(rest, POSES.slump, reduced ? 1 : ease(time / MOTION_MS.sad));
    if (!reduced && time < MOTION_MS.sad)
      pose.hair += Math.sin((time / MOTION_MS.sad) * Math.PI) * 1.8;
    return pose;
  }
  if (reduced || time >= MOTION_MS.happy) return POSES.cheer;
  const crouch = {
    ...rest,
    nearArm: -16,
    farArm: 16,
    nearElbow: -18,
    farElbow: 18,
    drop: 6,
    head: 2,
    hair: 1,
    expression: 'smile',
  } as AvatarPose;
  if (time < 100) return blend(rest, crouch, ease(time / 100));
  // Ballistic flights, anticipation and soft knee compression on each landing.
  const cycle =
    time < 520
      ? { start: 100, flight: 310, settle: 110, height: 22 }
      : { start: 520, flight: 250, settle: 130, height: 13 };
  const t = time - cycle.start;
  if (t < cycle.flight) {
    const u = t / cycle.flight;
    const pose = blend(crouch, POSES.jump, ease(t / 75));
    pose.lift = 4 * cycle.height * u * (1 - u);
    pose.drop *= 1 - ease(t / 50);
    const tuck = Math.sin(Math.PI * u);
    pose.nearFootLift = 5 * tuck;
    pose.farFootLift = 5 * tuck;
    pose.nearStep = -3 * tuck;
    pose.farStep = 3 * tuck;
    pose.head = crouch.head * (1 - ease(t / 60)) - 3 * Math.sin(Math.PI * u);
    const landing = ease((t - cycle.flight + 60) / 60);
    pose.nearArm += (POSES.cheer.nearArm - pose.nearArm) * landing;
    pose.farArm += (POSES.cheer.farArm - pose.farArm) * landing;
    pose.nearElbow += (POSES.cheer.nearElbow - pose.nearElbow) * landing;
    pose.farElbow += (POSES.cheer.farElbow - pose.farElbow) * landing;
    pose.hair = crouch.hair * (1 - ease(t / 60)) - 2.8 * Math.sin(Math.PI * u);
    return pose;
  }
  const u = (t - cycle.flight) / cycle.settle;
  const pose = { ...POSES.cheer, drop: 5 * Math.sin(Math.PI * u), hair: 2 * Math.sin(Math.PI * u) };
  if (time < 520) return blend(pose, crouch, ease((u - 0.55) / 0.45));
  return pose;
}
