import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { meKey } from '../auth/queries';
import { student } from '../../test/server';
import { answerResult } from '../../test/learningFixtures';
import { ExperienceReward } from './ExperienceReward';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('celebrates each confirmed XP award once, stays finite and retains the awarded amount', () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  client.setQueryData(meKey, student);
  const ui = (id = answerResult.attemptAnswerId, xp = 100) => (
    <QueryClientProvider client={client}>
      <ExperienceReward
        owner={student.accountId}
        contentVersion="v1"
        answer={{ ...answerResult, attemptAnswerId: id, xpAwarded: xp }}
      />
    </QueryClientProvider>
  );
  const view = render(ui());
  expect(screen.getByRole('dialog', { name: '경험치 획득 연출' })).toBeVisible();
  expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrating', 'true');
  act(() => vi.advanceTimersByTime(2700));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status')).toHaveAttribute('data-celebrating', 'true');
  act(() => vi.advanceTimersByTime(2500));
  expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrating', 'true');
  expect(screen.getByText('이번 답변으로 받은 경험치: 100 XP')).toBeVisible();
  view.unmount();
  const again = render(ui());
  expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrating', 'true');
  again.rerender(ui('next-answer'));
  expect(screen.getByRole('dialog', { name: '경험치 획득 연출' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '연출 건너뛰기' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status')).toHaveFocus();
  again.rerender(ui('review-answer', 0));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText('이번 답변으로 받은 경험치: 0 XP')).toBeVisible();
});

it('keeps the XP reward readable without animation for reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const client = new QueryClient();
  client.setQueryData(meKey, student);
  render(
    <QueryClientProvider client={client}>
      <ExperienceReward owner={student.accountId} contentVersion="v1" answer={answerResult} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrating', 'true');
  expect(screen.getByText('이번 답변으로 받은 경험치: 100 XP')).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
});
