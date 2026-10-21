import { useEffect, useState, type ReactNode } from 'react';
import { CharacterExperienceEffect, type CharacterExperience } from './CharacterExperienceEffect';
import { MOTION_MS } from './motion/poses';
import { AnimatedGameAvatar } from './motion/AnimatedGameAvatar';
import type { GameView, JourneyView } from './types';
import type { AnswerChoice, AnswerOutcome } from '../learning/types';
import './answer-scene.css';

const WALK_MS = MOTION_MS.walk;
export function AnswerGameScene({
  appearance,
  journey,
  choice,
  outcome,
  answerId,
  experience,
  children,
  onChoose,
  choicesDisabled = false,
}: {
  appearance: GameView | undefined;
  journey?: JourneyView;
  choice?: AnswerChoice;
  outcome?: AnswerOutcome;
  answerId?: string;
  experience?: CharacterExperience;
  children?: ReactNode;
  onChoose?: (choice: AnswerChoice) => void;
  choicesDisabled?: boolean;
}) {
  const [initialAnswerId] = useState(answerId);
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
      className={`game-learning-scene game-answer-scene game-scene-${region}${children ? ' game-answer-immersive' : ''}`}
      aria-label="학습 여행 장면"
      style={{ '--answer-walk-duration': `${WALK_MS}ms` } as import('react').CSSProperties}
      data-choice={choice}
      data-phase={phase}
      data-animate={String(travel.animate)}
    >
      {children ? <div className="game-answer-content">{children}</div> : null}
      {children ? <div className="game-answer-clearing" aria-hidden="true" /> : null}
      <div className="game-answer-track" aria-hidden="true" />
      <div
        className={onChoose ? 'learning-choices' : undefined}
        role={onChoose ? 'group' : undefined}
        aria-label={onChoose ? '사실 또는 해석 선택' : undefined}
      >
        {(['O', 'X'] as const).map((destination) => {
          const label = destination === 'O' ? '사실' : '해석';
          const content = (
            <>
              <b>{destination}</b>
              <span>{label}</span>
            </>
          );
          const className = `game-answer-destination game-answer-${destination.toLowerCase()}`;
          return onChoose ? (
            <button
              key={destination}
              className={className}
              aria-label={`${destination} · ${label}`}
              disabled={choicesDisabled}
              onClick={() => onChoose(destination)}
            >
              {content}
            </button>
          ) : (
            <div
              key={destination}
              className={className}
              data-selected={choice === destination}
              aria-hidden="true"
            >
              {content}
            </div>
          );
        })}
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
        {experience ? (
          <CharacterExperienceEffect
            {...experience}
            ready={travel.arrived && !!answerId && answerId !== initialAnswerId}
          />
        ) : null}
      </div>
      {!children || !appearance || phase === 'walking' || phase === 'waiting' ? (
        <p className="game-answer-message" role="status">
          {messages[phase]}
        </p>
      ) : null}
      {journey ? (
        <p className="game-answer-progress">여행 {journey.firstAnswerCount} / 150문항</p>
      ) : null}
    </section>
  );
}
