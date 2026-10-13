import { expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, student } from '../../test/server';
import { gameView } from '../../test/gameFixtures';
import { renderPage } from '../../test/render';
import { App } from '../../app/App';
import { meKey } from '../auth/queries';
import type { AppearanceCommand } from './types';

function setup(view = gameView) {
  let saved = structuredClone(view);
  const commands: AppearanceCommand[] = [];
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/student/game', () => HttpResponse.json(saved)),
    http.put('*/api/student/game/appearance', async ({ request }) => {
      const command = (await request.json()) as AppearanceCommand;
      commands.push(command);
      saved = { ...saved, ...command, revision: saved.revision + 1 };
      return HttpResponse.json(saved);
    }),
  );
  return { commands, user: userEvent.setup(), ...renderPage(<App />, '/student/closet') };
}

// Sending preview to the server or mutating canonical gear breaks cancellation and ownership.
it('unownedPreviewNeverPutsAndCancelRestoresSavedGear', async () => {
  const { user, commands } = setup();
  await user.click(await screen.findByRole('button', { name: '빛나는 지팡이 미리보기' }));
  const preview = screen.getByRole('region', { name: '외형 미리보기' });
  expect(within(preview).getByText(/미보유/)).toBeVisible();
  expect(within(preview).getByRole('img')).toHaveAccessibleName(/빛나는 지팡이/);
  expect(screen.queryByRole('button', { name: '착용하기' })).toBeNull();
  expect(commands).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: '미리보기 취소' }));
  expect(within(preview).getByRole('img')).toHaveAccessibleName(/동그란 안경/);
  expect(within(preview).queryByText(/미보유/)).toBeNull();
  expect(commands).toHaveLength(0);
});

// Saving a partial slot map or inventing haru would erase another slot/character choice.
it('ownedEquipAndBaseRestoreSendSixSlotsAndRevision', async () => {
  const { user, commands } = setup();
  await user.click(await screen.findByRole('button', { name: '작은 모자 미리보기' }));
  await user.click(screen.getByRole('button', { name: '착용하기' }));
  await waitFor(() => expect(commands).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole('button', { name: '얼굴 기본 모습' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '얼굴 기본 모습' }));
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[0]).toEqual({
    characterId: null,
    expectedRevision: 7,
    equippedBySlot: {
      face: 'face-1',
      hat: 'hat-1',
      top: null,
      bottom: null,
      shoes: null,
      hand: null,
    },
  });
  expect(commands[1]).toEqual({
    characterId: null,
    expectedRevision: 8,
    equippedBySlot: { face: null, hat: 'hat-1', top: null, bottom: null, shoes: null, hand: null },
  });
});

it('unknownCatalogArtDoesNotExecuteMarkup', async () => {
  const bad = '<img src=x onerror="window.pwned=true">';
  const { user, container } = setup({
    ...gameView,
    items: [{ itemId: bad, assetKey: bad, name: bad, slot: 'hand', value: 6, rewardDay: 30 }],
    inventory: [{ itemId: bad, owned: false, acquiredAt: null }],
  });
  await user.click(await screen.findByRole('button', { name: `${bad} 미리보기` }));
  expect(container.querySelector('img[src="x"]')).toBeNull();
  expect(container.querySelector('[onerror]')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
});

it('previewClearsImmediatelyWhenOwnerChanges', async () => {
  const { user, client } = setup();
  await user.click(await screen.findByRole('button', { name: '빛나는 지팡이 미리보기' }));
  const next = {
    ...gameView,
    characterId: 'bora' as const,
    equippedBySlot: { face: null, hat: null, top: null, bottom: null, shoes: null, hand: null },
  };
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...student, accountId: 'student-b' })),
    http.get('*/api/student/game', () => HttpResponse.json(next)),
  );
  await act(async () => client.refetchQueries({ queryKey: meKey, exact: true }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: '외형 미리보기' })).getByRole('img'),
    ).toHaveAccessibleName(/보라/),
  );
  expect(screen.queryByRole('button', { name: '미리보기 취소' })).toBeNull();
});
