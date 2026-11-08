import type { AnswerResult } from '../learning/types';
import { CelebrationBurst } from './CelebrationBurst';
import { useSeenTransition } from './useSeenTransition';
import './celebrations.css';

export interface CharacterExperience {
  owner: string | undefined;
  contentVersion: string;
  answer: AnswerResult;
}

export function CharacterExperienceEffect({
  owner,
  contentVersion,
  answer,
  ready,
}: CharacterExperience & { ready: boolean }) {
  const active = useSeenTransition(
    owner,
    contentVersion,
    'xp-awards',
    ready && answer.xpAwarded > 0 ? { [answer.attemptAnswerId]: true } : {},
    { celebrateInitial: true, durationMs: 2200 },
  ).includes(answer.attemptAnswerId);
  if (!active) return null;
  return (
    <div className="game-character-xp" aria-hidden="true">
      <span className="game-character-xp-aura" />
      <span className="game-character-xp-orbit" />
      <span className="game-character-xp-orbit game-character-xp-orbit-late" />
      <CelebrationBurst />
      <span className="game-character-xp-amount">+{answer.xpAwarded} XP</span>
    </div>
  );
}
