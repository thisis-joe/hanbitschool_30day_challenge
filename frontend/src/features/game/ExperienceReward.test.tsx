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
  const scene = screen.getByRole('dialog', { name: '경험치 획득 연출' });
  expect(scene).toBeVisible();
  expect(scene).toHaveFocus();
  expect(screen.queryByRole('button', { name: '연출 건너뛰기' })).toBeNull();
  fireEvent(scene, new Event('cancel', { cancelable: true }));
  expect(scene).toBeVisible();
  expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrating', 'true');
  act(() => vi.advanceTimersByTime(1299));
  expect(scene).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status')).toHaveAttribute('data-celebrating', 'true');
  act(() => vi.advanceTimersByTime(1199));
  expect(screen.getByRole('status')).toHaveAttribute('data-celebrating', 'true');
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrating', 'true');
  expect(screen.getByText('이번 답변으로 받은 경험치: 100 XP')).toBeVisible();
  view.unmount();
  const again = render(ui());
  expect(screen.getByRole('status')).not.toHaveAttribute('data-celebrating', 'true');
  again.rerender(ui('next-answer'));
  expect(screen.getByRole('dialog', { name: '경험치 획득 연출' })).toBeVisible();
  act(() => vi.advanceTimersByTime(1300));
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

it('keeps XP readable while the character reacts and begins the cinematic only after release', () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  client.setQueryData(meKey, student);
  const ui = (deferCinematic: boolean) => (
    <QueryClientProvider client={client}>
      <ExperienceReward
        owner={student.accountId}
        contentVersion="v1"
        answer={answerResult}
        deferCinematic={deferCinematic}
      />
    </QueryClientProvider>
  );
  const view = render(ui(true));
  expect(screen.getByText('이번 답변으로 받은 경험치: 100 XP')).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(ui(false));
  expect(screen.getByRole('dialog', { name: '경험치 획득 연출' })).toBeVisible();
  act(() => vi.advanceTimersByTime(2500));
  expect(screen.queryByRole('dialog')).toBeNull();
});
