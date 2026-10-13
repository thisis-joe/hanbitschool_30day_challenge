import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LearningGameScene } from './LearningGameScene';
import { gameView, journeyView } from '../../test/gameFixtures';

it('restoredAppearanceHasNoTravelUntilANewCanonicalPositionArrives', () => {
  const restored = { ...journeyView, journeyPosition: 10, firstAnswerCount: 10 };
  const view = render(<LearningGameScene appearance={gameView} journey={restored} />);
  const avatar = screen.getByRole('img', { name: /캐릭터 미선택/ });
  expect(avatar.parentElement).not.toHaveClass('game-learning-travel');
  view.rerender(<LearningGameScene appearance={gameView} journey={restored} outcome="CORRECT" />);
  expect(screen.getByRole('img', { name: /캐릭터 미선택/ })).toBe(avatar);
  expect(avatar.parentElement).not.toHaveClass('game-learning-travel');
  view.rerender(
    <LearningGameScene
      appearance={gameView}
      journey={{ ...restored, journeyPosition: 11, firstAnswerCount: 11 }}
    />,
  );
  const traveler = screen.getByRole('img', { name: /캐릭터 미선택/ }).parentElement!;
  expect(traveler).toHaveClass('game-learning-travel');
  view.rerender(
    <LearningGameScene
      appearance={{ ...gameView, revision: 8 }}
      journey={{ ...restored, journeyPosition: 11, firstAnswerCount: 11 }}
      outcome="TIMED_OUT"
    />,
  );
  expect(screen.getByRole('img', { name: /캐릭터 미선택/ }).parentElement).toBe(traveler);
});

it.each([
  [0, 'forest'],
  [49, 'forest'],
  [50, 'village'],
  [99, 'village'],
  [100, 'beach'],
  [150, 'beach'],
] as const)('canonical journey position %s selects %s scenery', (journeyPosition, region) => {
  render(<LearningGameScene appearance={gameView} journey={{ ...journeyView, journeyPosition }} />);
  expect(screen.getByRole('region', { name: '학습 여행 장면' })).toHaveClass(
    `game-scene-${region}`,
  );
  expect(screen.queryByRole('button')).toBeNull();
});

it('missingCosmeticDataKeepsTheLearningSceneReadable', () => {
  render(<LearningGameScene appearance={undefined} />);
  expect(screen.getByText('여행 장면을 준비하고 있어요')).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
});
