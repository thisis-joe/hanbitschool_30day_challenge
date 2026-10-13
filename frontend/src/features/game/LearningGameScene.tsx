import { useState } from 'react';
import { GameAvatar } from './GameAvatar';
import type { GameView, JourneyView } from './types';
import type { AnswerOutcome } from '../learning/types';

export function LearningGameScene({
  appearance,
  outcome,
  journey,
}: {
  appearance: GameView | undefined;
  outcome?: AnswerOutcome;
  journey?: JourneyView;
}) {
  const position = journey?.journeyPosition ?? 0;
  // Restoring an existing fact is stationary. Only a later canonical first-answer
  // position replaces the keyed traveler and starts decorative motion.
  const [origin, setOrigin] = useState(journey?.journeyPosition);
  if (origin === undefined && journey) setOrigin(position);
  const traveling = origin !== undefined && position > origin;
  const region = position < 50 ? 'forest' : position < 100 ? 'village' : 'beach';
  return (
    <section
      className={`game-learning-scene game-scene-${region}`}
      aria-label="학습 여행 장면"
      data-outcome={outcome}
    >
      <div className="game-learning-road" aria-hidden="true" />
      {appearance ? (
        <div
          className={`game-learning-traveler${traveling ? ' game-learning-travel' : ''}`}
          key={position}
        >
          <GameAvatar
            characterId={appearance.characterId}
            equippedBySlot={appearance.equippedBySlot}
          />
        </div>
      ) : (
        <p className="game-scene-fallback">여행 장면을 준비하고 있어요</p>
      )}
      {journey ? (
        <p className="game-learning-location">여행 {journey.firstAnswerCount} / 150문항</p>
      ) : null}
    </section>
  );
}
