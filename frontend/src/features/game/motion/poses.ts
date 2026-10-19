/** Reusable pose assets. Angles are relative to the character's resting limbs. */
export type AvatarMotion = 'idle' | 'walk' | 'happy' | 'sad';
export interface AvatarPose {
  nearArm: number;
  farArm: number;
  nearLeg: number;
  farLeg: number;
  bow: number;
  drop: number;
  lift: number;
  expression: 'neutral' | 'smile' | 'sad';
}
const rest: AvatarPose = {
  nearArm: 0,
  farArm: 0,
  nearLeg: 0,
  farLeg: 0,
  bow: 0,
  drop: 0,
  lift: 0,
  expression: 'neutral',
};
export const POSES = {
  idle: rest,
  walkLeft: { ...rest, nearArm: 24, farArm: -24, nearLeg: -24, farLeg: 24, lift: 2 },
  walkRight: { ...rest, nearArm: -24, farArm: 24, nearLeg: 24, farLeg: -24, lift: 2 },
  cheer: { ...rest, nearArm: 130, farArm: -130, expression: 'smile' },
  jump: {
    ...rest,
    nearArm: 145,
    farArm: -145,
    nearLeg: 14,
    farLeg: -14,
    lift: 18,
    expression: 'smile',
  },
  slump: { ...rest, nearArm: -10, farArm: 10, bow: 11, drop: 4, expression: 'sad' },
} satisfies Record<string, AvatarPose>;

function blend(from: AvatarPose, to: AvatarPose, amount: number): AvatarPose {
  const mix = (a: number, b: number) => a + (b - a) * amount;
  return {
    nearArm: mix(from.nearArm, to.nearArm),
    farArm: mix(from.farArm, to.farArm),
    nearLeg: mix(from.nearLeg, to.nearLeg),
    farLeg: mix(from.farLeg, to.farLeg),
    bow: mix(from.bow, to.bow),
    drop: mix(from.drop, to.drop),
    lift: mix(from.lift, to.lift),
    expression: to.expression,
  };
}
export function samplePose(motion: AvatarMotion, elapsed: number, reduced = false): AvatarPose {
  if (motion === 'idle' || (reduced && motion === 'walk')) return POSES.idle;
  if (motion === 'walk')
    return blend(
      POSES.walkLeft,
      POSES.walkRight,
      (1 - Math.cos((elapsed / 420) * Math.PI * 2)) / 2,
    );
  if (motion === 'sad') return blend(rest, POSES.slump, reduced ? 1 : Math.min(1, elapsed / 450));
  if (reduced || elapsed >= 1200) return POSES.cheer;
  if (elapsed < 180) return blend(rest, POSES.cheer, elapsed / 180);
  // Two finite jumps, then hold both arms up at the selected answer.
  const jump = Math.abs(Math.sin(((elapsed - 180) / 510) * Math.PI));
  return blend(POSES.cheer, POSES.jump, jump);
}
