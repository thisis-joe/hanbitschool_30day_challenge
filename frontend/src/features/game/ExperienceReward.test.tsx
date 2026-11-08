import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { answerResult } from '../../test/learningFixtures';
import { ExperienceReward } from './ExperienceReward';

it('keeps the award and total readable without a modal or moving focus', () => {
  const view = render(
    <>
      <button autoFocus>다음 문제</button>
      <ExperienceReward answer={answerResult} />
    </>,
  );
  expect(screen.getByRole('status', { name: '이번 답변으로 받은 경험치: 100 XP' })).toBeVisible();
  expect(screen.getByText('+100')).toBeVisible();
  expect(screen.getByText('누적 100 XP')).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '다음 문제' })).toHaveFocus();
  view.rerender(<ExperienceReward answer={{ ...answerResult, xpAwarded: 0 }} />);
  expect(screen.getByRole('status', { name: '이번 답변으로 받은 경험치: 0 XP' })).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
});
