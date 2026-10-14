import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, it } from 'vitest';
import { meKey, replaceAccountCache } from '../auth/queries';
import { student } from '../../test/server';
import { useSeenTransition } from './useSeenTransition';

function Events({
  observations,
  owner = student.accountId,
  surface = 'rewards',
}: {
  observations: Record<string, boolean>;
  owner?: string;
  surface?: string;
}) {
  const events = useSeenTransition(owner, 'course-v1', surface, observations);
  return <output aria-label="새로 열린 선물">{events.join(',') || '없음'}</output>;
}
function mount(observations: Record<string, boolean>) {
  const client = new QueryClient();
  client.setQueryData(meKey, student);
  const ui = (
    next: Record<string, boolean>,
    owner = student.accountId,
    surface = 'rewards',
    present = true,
  ) => (
    <StrictMode>
      <QueryClientProvider client={client}>
        {present ? (
          <Events observations={next} owner={owner} surface={surface} />
        ) : (
          <p>다른 화면</p>
        )}
      </QueryClientProvider>
    </StrictMode>
  );
  const result = render(ui(observations));
  return {
    client,
    update: (
      next: Record<string, boolean>,
      owner = student.accountId,
      surface = 'rewards',
      present = true,
    ) => result.rerender(ui(next, owner, surface, present)),
  };
}

// A partial reward view must not erase observations for other cards; surface namespaces must stay separate.
it('merges partial observations and keeps map and reward events independent under StrictMode', () => {
  const { update } = mount({ glasses: false, hat: false });
  update({ glasses: false });
  update({ hat: true });
  expect(screen.getByLabelText('새로 열린 선물')).toHaveTextContent('hat');
  update({ glasses: true }, student.accountId, 'map');
  expect(screen.getByLabelText('새로 열린 선물')).toHaveTextContent('없음');
  update({ glasses: true });
  expect(screen.getByLabelText('새로 열린 선물')).toHaveTextContent('glasses');
});

// An obsolete mounted component after account replacement must not resurrect the previous owner's baseline.
it('refuses obsolete owner writes after logout and cache replacement', () => {
  const { client, update } = mount({ hat: false });
  act(() => replaceAccountCache(client, null));
  update({ hat: false });
  expect(screen.getByLabelText('새로 열린 선물')).toHaveTextContent('없음');
  act(() => replaceAccountCache(client, { ...student, role: 'STUDENT' }));
  update({ hat: true });
  expect(screen.getByLabelText('새로 열린 선물')).toHaveTextContent('없음');
});

// A key remount should consume a transition once, then treat a repeated snapshot as already seen.
it('consumes transitions once across full unmounts even with StrictMode effect replay', () => {
  const { update } = mount({ hat: false });
  update({}, student.accountId, 'rewards', false);
  update({ hat: true });
  expect(screen.getByLabelText('새로 열린 선물')).toHaveTextContent('hat');
  update({}, student.accountId, 'rewards', false);
  update({ hat: true });
  expect(screen.getByLabelText('새로 열린 선물')).toHaveTextContent('없음');
});
