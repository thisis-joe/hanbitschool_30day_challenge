import { useRef } from 'react';
import { AcquisitionCinematic } from './AcquisitionCinematic';
import {
  acquisitionDuration,
  inlineAcquisitionDuration,
  useAcquisitionSequence,
} from './useAcquisitionSequence';
import type { AnswerResult } from '../learning/types';
import { CelebrationBurst } from './CelebrationBurst';
import { useSeenTransition } from './useSeenTransition';
import './celebrations.css';

export function ExperienceReward({
  owner,
  contentVersion,
  answer,
  deferCinematic = false,
}: {
  owner: string | undefined;
  contentVersion: string;
  answer: AnswerResult;
  deferCinematic?: boolean;
}) {
  const event = answer.attemptAnswerId;
  const card = useRef<HTMLDivElement>(null);
  const active = useSeenTransition(
    owner,
    contentVersion,
    'xp-awards',
    answer.xpAwarded > 0 && !deferCinematic ? { [event]: true } : {},
    { celebrateInitial: true, durationMs: acquisitionDuration.xp + inlineAcquisitionDuration },
  ).includes(event);
  const identity = JSON.stringify([owner, contentVersion, event]);
  const sequence = useAcquisitionSequence(active, identity);
  const celebrating = sequence.inline;
  const description = `이번 답변으로 받은 경험치: ${answer.xpAwarded} XP`;
  if (answer.xpAwarded <= 0) return <p>{description}</p>;
  return (
    <div
      ref={card}
      tabIndex={-1}
      className="game-xp-reward"
      role="status"
      data-celebrating={celebrating || undefined}
      key={event}
    >
      {sequence.cinematic ? (
        <AcquisitionCinematic
          key={identity}
          prize={{ kind: 'xp', amount: answer.xpAwarded, level: answer.level }}
          onComplete={sequence.complete}
          returnFocus={card}
        />
      ) : null}
      <div className="game-xp-emblem" aria-hidden="true">
        {celebrating ? <CelebrationBurst /> : null}
        <span className="game-xp-star">✦</span>
        {celebrating ? <span className="game-xp-float">+{answer.xpAwarded} XP</span> : null}
      </div>
      <div className="game-xp-copy">
        <span className="game-xp-eyebrow">경험치 획득!</span>
        <strong className="game-xp-amount" aria-hidden="true">
          +{answer.xpAwarded} <small>XP</small>
        </strong>
        <p>{description}</p>
      </div>
      <div className="game-xp-total">
        <b>Lv. {answer.level}</b>
        <span>누적 {answer.totalXp} XP</span>
      </div>
    </div>
  );
}
