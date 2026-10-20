import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnswerGameScene } from './AnswerGameScene';
import { gameView } from '../../test/gameFixtures';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const scene = () => screen.getByRole('region', { name: '학습 여행 장면' });

it.each(['O', 'X'] as const)(
  'walks to selected %s before celebrating even when scoring is immediate',
  (choice) => {
    const view = render(<AnswerGameScene appearance={gameView} />);
    view.rerender(<AnswerGameScene appearance={gameView} choice={choice} outcome="CORRECT" />);
    expect(scene()).toHaveAttribute('data-choice', choice);
    expect(scene()).toHaveAttribute('data-phase', 'walking');
    act(() => vi.advanceTimersByTime(480));
    expect(scene()).toHaveAttribute('data-phase', 'correct');
    expect(screen.getByText('정답! 정말 잘했어요')).toBeVisible();
  },
);

it('waits at the chosen position for the server, then slumps on a wrong answer', () => {
  const view = render(<AnswerGameScene appearance={gameView} />);
  view.rerender(<AnswerGameScene appearance={gameView} choice="X" />);
  act(() => vi.advanceTimersByTime(480));
  expect(scene()).toHaveAttribute('data-phase', 'waiting');
  view.rerender(<AnswerGameScene appearance={gameView} choice="X" outcome="WRONG" />);
  expect(scene()).toHaveAttribute('data-phase', 'wrong');
  expect(scene()).toHaveAttribute('data-choice', 'X');
  act(() => vi.advanceTimersByTime(5000));
  expect(scene()).toHaveAttribute('data-phase', 'wrong');
});

it('restoring a saved answer shows its final pose without replaying the walk or jump', () => {
  const view = render(<AnswerGameScene appearance={gameView} choice="O" outcome="CORRECT" />);
  expect(scene()).toHaveAttribute('data-phase', 'correct');
  expect(scene()).toHaveAttribute('data-animate', 'false');
  view.rerender(
    <AnswerGameScene appearance={{ ...gameView, revision: 8 }} choice="O" outcome="CORRECT" />,
  );
  expect(scene()).toHaveAttribute('data-animate', 'false');
});

it('a timeout without a choice stays at the center and a rejected choice resets the walk', () => {
  const view = render(<AnswerGameScene appearance={gameView} />);
  view.rerender(<AnswerGameScene appearance={gameView} choice="X" />);
  view.rerender(<AnswerGameScene appearance={gameView} />);
  act(() => vi.advanceTimersByTime(480));
  expect(scene()).toHaveAttribute('data-phase', 'idle');
  expect(scene()).not.toHaveAttribute('data-choice');
  view.rerender(<AnswerGameScene appearance={gameView} outcome="TIMED_OUT" />);
  expect(scene()).toHaveAttribute('data-phase', 'timeout');
  expect(scene()).not.toHaveAttribute('data-choice');
});

it('missing cosmetic data does not prevent reaching the answer result', () => {
  const view = render(<AnswerGameScene appearance={undefined} />);
  view.rerender(<AnswerGameScene appearance={undefined} choice="O" outcome="WRONG" />);
  act(() => vi.advanceTimersByTime(480));
  expect(scene()).toHaveAttribute('data-phase', 'wrong');
  expect(screen.getByText('괜찮아요, 다시 도전해요')).toBeVisible();
});

it('a new question resets the destination and cancels the previous arrival timer', () => {
  const view = render(<AnswerGameScene key="q1" appearance={gameView} />);
  view.rerender(<AnswerGameScene key="q1" appearance={gameView} choice="O" />);
  act(() => vi.advanceTimersByTime(400));
  view.rerender(<AnswerGameScene key="q2" appearance={gameView} />);
  act(() => vi.advanceTimersByTime(400));
  expect(scene()).toHaveAttribute('data-phase', 'idle');
  expect(scene()).not.toHaveAttribute('data-choice');
  view.rerender(<AnswerGameScene key="q2" appearance={gameView} choice="O" outcome="CORRECT" />);
  expect(scene()).toHaveAttribute('data-phase', 'walking');
  act(() => vi.advanceTimersByTime(480));
  expect(scene()).toHaveAttribute('data-phase', 'correct');
});

it('releases the reward cinematic only after walking and the complete character reaction', () => {
  const complete = vi.fn();
  const view = render(<AnswerGameScene appearance={gameView} onReactionComplete={complete} />);
  view.rerender(
    <AnswerGameScene
      appearance={gameView}
      choice="O"
      outcome="CORRECT"
      answerId="answer-1"
      onReactionComplete={complete}
    />,
  );
  act(() => vi.advanceTimersByTime(480));
  expect(scene()).toHaveAttribute('data-phase', 'correct');
  expect(complete).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(899));
  expect(complete).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(complete).toHaveBeenCalledExactlyOnceWith('answer-1');
});
