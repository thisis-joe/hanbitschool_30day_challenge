import { useEffect, useRef, type CSSProperties } from 'react';
import { GameAvatar } from './GameAvatar';
import { journeyPoint, MAP_ANCHORS, MAP_TRAIL, REGIONS } from './journeyGeometry';
import type { GameView, JourneyView } from './types';

export function JourneyMap({
  journey,
  appearance,
  compact = false,
}: {
  journey: JourneyView;
  appearance: GameView | undefined;
  compact?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const point = journeyPoint(journey.journeyPosition);
  function recenter(animate: boolean) {
    const element = viewport.current;
    if (!element) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo?.({
      left: Math.max(0, point.x * 10.5 - element.clientWidth / 2),
      top: Math.max(0, point.y * 31.5 - element.clientHeight / 2),
      behavior: animate && !reduced ? 'smooth' : 'auto',
    });
  }
  useEffect(() => {
    const element = viewport.current;
    element?.scrollTo?.({
      left: Math.max(0, point.x * 10.5 - element.clientWidth / 2),
      top: Math.max(0, point.y * 31.5 - element.clientHeight / 2),
      behavior: 'auto',
    });
  }, [point.x, point.y]);
  return (
    <section
      className={`game-map-stage${compact ? ' game-map-compact' : ''}`}
      aria-label="탐험 경로"
    >
      <div className="game-map-toolbar">
        <span>↑ 숲에서 등대로 · {journey.firstAnswerCount} / 150문항</span>
        <button
          className="secondary"
          onClick={() => recenter(true)}
          aria-label="현재 위치로 돌아가기"
        >
          현재 위치
        </button>
      </div>
      <div
        className="game-map-viewport"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="아래 숲에서 위 등대로 올라가는 탐험 지도"
      >
        <div
          className="game-map-world"
          style={
            { '--game-reveal-edge': `${journey.courseCompleted ? 0 : point.y}%` } as CSSProperties
          }
        >
          <div className="game-map-image game-map-gray" aria-hidden="true" />
          <div className="game-map-image game-map-revealed" aria-hidden="true" />
          <svg
            className="game-map-route"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={MAP_TRAIL.map(([x, y]) => `${x},${y}`).join(' ')} />
          </svg>
          {journey.days.map((day) => {
            const anchor = MAP_ANCHORS[day.dayNumber];
            if (!anchor) return null;
            return (
              <a
                className={`game-map-day ${day.state === 'PASSED' ? 'game-map-passed' : day.availability === 'AVAILABLE' ? 'game-map-current' : 'game-map-locked'}`}
                key={day.dayNumber}
                href={`#journey-day-${day.dayNumber}`}
                style={{ left: `${anchor[0]}%`, top: `${anchor[1]}%` }}
                aria-label={`${day.dayNumber}회차 살펴보기`}
              >
                {day.dayNumber}
              </a>
            );
          })}
          {REGIONS.map((name, index) => {
            const [x, y] = MAP_ANCHORS[index * 5 + 2];
            return (
              <div
                key={name}
                className={`game-map-place${journey.journeyPosition < index * 25 ? ' game-map-unexplored' : ''}`}
                style={{ left: `${x < 50 ? x + 20 : x - 20}%`, top: `${y}%` }}
              >
                <strong>{name}</strong>
                <span>
                  {index * 5 + 1}~{index * 5 + 5}회차
                </span>
              </div>
            );
          })}
          <div className="game-map-hero" style={{ left: `${point.x}%`, top: `${point.y}%` }}>
            {appearance ? (
              <GameAvatar
                characterId={appearance.characterId}
                equippedBySlot={appearance.equippedBySlot}
              />
            ) : (
              <span className="game-map-location">현재 위치</span>
            )}
          </div>
        </div>
      </div>
      <p className="game-map-caption">
        지도를 위로 움직여 여행할 곳을 둘러보세요. 아래 회차 목록에서도 학습을 선택할 수 있어요.
      </p>
      {journey.journeyPosition === 150 && !journey.courseCompleted ? (
        <p>등대에 도착했어요. 아직 통과하지 못한 회차에 다시 도전해요.</p>
      ) : null}
    </section>
  );
}
