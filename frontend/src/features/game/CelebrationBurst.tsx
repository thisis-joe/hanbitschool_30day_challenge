import type { CSSProperties } from 'react';

// Fixed trajectories keep rerenders stable. All motion ends within 2.4 seconds.
const particles = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const radius = 68 + (i % 3) * 20;
  return {
    '--spark-x': `${Math.cos(angle) * radius}px`,
    '--spark-y': `${Math.sin(angle) * radius * 0.72}px`,
    '--spark-delay': `${(i % 5) * 65}ms`,
    '--spark-turn': `${i % 2 ? 100 : -80}deg`,
  } as CSSProperties;
});

export function CelebrationBurst() {
  return (
    <div className="game-celebration-burst" aria-hidden="true">
      <span className="game-celebration-halo" />
      <span className="game-celebration-ring" />
      <span className="game-celebration-ring game-celebration-ring-late" />
      {particles.map((style, i) => (
        <span className="game-celebration-particle" key={i} style={style} />
      ))}
    </div>
  );
}
