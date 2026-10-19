import { useEffect, useState } from 'react';
import { AnimatedGameAvatar } from './motion/AnimatedGameAvatar';
import type { GameView, JourneyView } from './types';
import type { AnswerChoice, AnswerOutcome } from '../learning/types';
import './answer-scene.css';

const WALK_MS = 750;
export function AnswerGameScene({
  appearance,
  journey,
  choice,
  outcome,
  answerId,
  onReactionComplete,
}: {
  appearance: GameView | undefined;
  journey?: JourneyView;
  choice?: AnswerChoice;
  outcome?: AnswerOutcome;
  answerId?: string;
  onReactionComplete?: (answerId: string) => void;
}) {
  const [travel, setTravel] = useState({ choice, arrived: true, animate: false });
  if (travel.choice !== choice) setTravel({ choice, arrived: !choice, animate: !!choice });
  useEffect(() => {
    if (travel.arrived) return;
    const timer = window.setTimeout(
      () => setTravel((current) => ({ ...current, arrived: true })),
      WALK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [travel.choice, travel.arrived]);
  const phase = !travel.arrived
    ? 'walking'
    : outcome === 'CORRECT'
      ? 'correct'
      : outcome === 'WRONG'
        ? 'wrong'
        : outcome === 'TIMED_OUT'
          ? 'timeout'
          : choice
            ? 'waiting'
            : 'idle';
  const motion =
    phase === 'walking'
      ? 'walk'
      : phase === 'correct'
        ? 'happy'
        : phase === 'wrong' || phase === 'timeout'
          ? 'sad'
          : 'idle';
  useEffect(() => {
    if (!answerId || !outcome || !travel.arrived || !onReactionComplete) return;
    const duration = travel.animate ? (outcome === 'CORRECT' ? 1200 : 450) : 0;
    const timer = window.setTimeout(() => onReactionComplete(answerId), duration);
    return () => window.clearTimeout(timer);
  }, [answerId, outcome, travel.arrived, travel.animate, onReactionComplete]);
  const position = journey?.journeyPosition ?? 0;
  const region = position < 50 ? 'forest' : position < 100 ? 'village' : 'beach';
  const messages = {
    idle: appearance ? 'O와 X 중 어디로 갈까요?' : '여행 장면을 준비하고 있어요',
    walking: `${choice} 쪽으로 걸어가요`,
    waiting: '답을 확인하고 있어요',
    correct: '정답! 정말 잘했어요',
    wrong: '괜찮아요, 다시 도전해요',
    timeout: '다음 문제는 함께 풀어봐요',
  };
  return (
    <section
      className={`game-learning-scene game-answer-scene game-scene-${region}`}
      aria-label="학습 여행 장면"
      data-choice={choice}
      data-phase={phase}
      data-animate={String(travel.animate)}
    >
      <div className="game-answer-track" aria-hidden="true" />
      <div
        className="game-answer-destination game-answer-o"
        data-selected={choice === 'O'}
        aria-hidden="true"
      >
        <b>O</b>
        <span>사실</span>
      </div>
      <div
        className="game-answer-destination game-answer-x"
        data-selected={choice === 'X'}
        aria-hidden="true"
      >
        <b>X</b>
        <span>해석</span>
      </div>
      <div className="game-answer-traveler">
        <span className="game-answer-shadow" aria-hidden="true" />
        <div className="game-answer-facing">
          <AnimatedGameAvatar
            characterId={appearance?.characterId ?? null}
            equippedBySlot={appearance?.equippedBySlot}
            motion={motion}
            animate={travel.animate}
          />
        </div>
        {phase === 'correct' ? (
          <span className="game-answer-sparkles" aria-hidden="true">
            ✦
          </span>
        ) : null}
      </div>
      <p className="game-answer-message" role="status">
        {messages[phase]}
      </p>
      {journey ? (
        <p className="game-answer-progress">여행 {journey.firstAnswerCount} / 150문항</p>
      ) : null}
    </section>
  );
}
