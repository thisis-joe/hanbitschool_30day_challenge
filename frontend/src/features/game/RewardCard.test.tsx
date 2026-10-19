import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { meKey } from '../auth/queries';
import { gameView } from '../../test/gameFixtures';
import { student } from '../../test/server';
import { RewardCard } from './RewardCard';

function mount(owned: boolean) {
  const client = new QueryClient();
  client.setQueryData(meKey, student);
  const ui = (
    next: boolean,
    item = gameView.items[0],
    owner = student.accountId,
    version = 'v1',
  ) => (
    <QueryClientProvider client={client}>
      <RewardCard owner={owner} contentVersion={version} item={item} owned={next} />
    </QueryClientProvider>
  );
  const result = render(ui(owned));
  return {
    client,
    update: (next: boolean, item = gameView.items[0], owner = student.accountId, version = 'v1') =>
      result.rerender(ui(next, item, owner, version)),
  };
}

// Treating existing inventory as newly earned produces a false celebration on every visit.
it('celebrates only an observed ownership transition for the same reward', () => {
  const { update } = mount(true);
  const card = screen.getByRole('region', { name: '여행 선물' });
  expect(card).not.toHaveAttribute('data-revealing', 'true');
  update(false, gameView.items[1]);
  expect(card).not.toHaveAttribute('data-revealing', 'true');
  update(true, gameView.items[1]);
  expect(screen.getByRole('dialog', { name: '아이템 획득 연출' })).toBeVisible();
  expect(card).not.toHaveAttribute('data-revealing', 'true');
  fireEvent.click(screen.getByRole('button', { name: '연출 건너뛰기' }));
  expect(card).toHaveAttribute('data-revealing', 'true');
  update(true, gameView.items[0]);
  expect(card).not.toHaveAttribute('data-revealing', 'true');
});

// A different account/course must not inherit another identity's reward animation.
it('keeps reward celebrations scoped to owner and content version', () => {
  const { client, update } = mount(false);
  update(true, gameView.items[0], student.accountId, 'v2');
  expect(screen.getByRole('region', { name: '여행 선물' })).not.toHaveAttribute(
    'data-revealing',
    'true',
  );
  act(() => client.setQueryData(meKey, { ...student, accountId: 'another-student' }));
  update(true, gameView.items[0], 'another-student');
  expect(screen.getByRole('region', { name: '여행 선물' })).not.toHaveAttribute(
    'data-revealing',
    'true',
  );
});

it('reveals a confirmed gift even when inventory arrives already owned, once per acquisition', () => {
  const client = new QueryClient();
  client.setQueryData(meKey, student);
  const ui = (
    <QueryClientProvider client={client}>
      <RewardCard
        owner={student.accountId}
        contentVersion="v1"
        item={gameView.items[0]}
        owned
        acquisitionId="face-1:2026-10-19T10:00:00Z"
      />
    </QueryClientProvider>
  );
  const view = render(ui);
  expect(screen.getByRole('dialog', { name: '아이템 획득 연출' })).toBeVisible();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: '여행 선물' })).toHaveFocus();
  expect(screen.getByRole('region', { name: '여행 선물' })).toHaveAttribute(
    'data-revealing',
    'true',
  );
  expect(screen.getByText('아이템 획득!')).toBeVisible();
  view.unmount();
  render(ui);
  expect(screen.getByRole('region', { name: '여행 선물' })).not.toHaveAttribute(
    'data-revealing',
    'true',
  );
});
