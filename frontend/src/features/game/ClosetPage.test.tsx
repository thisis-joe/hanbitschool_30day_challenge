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

// Dropping a category or rendering every slot at once breaks browsable inventory.
it('filters inventory by category and keeps all six slots reachable without saving', async () => {
  const { user, commands } = setup();
  await screen.findByRole('button', { name: '동그란 안경 미리보기' });
  expect(screen.queryByRole('button', { name: '작은 모자 미리보기' })).toBeNull();
  for (const name of ['얼굴', '모자', '상의', '하의', '신발', '손']) {
    const category = screen.getByRole('button', { name: `${name} 장비 보기` });
    await user.click(category);
    expect(category).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name })).toBeVisible();
    expect(screen.queryByRole('button', { name: `${name} 기본 모습` })).toBeNull();
    expect(category).toHaveFocus();
  }
  expect(screen.getByRole('button', { name: /빛나는 지팡이.*30회차 통과 시 획득/ })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '동그란 안경 미리보기' })).toBeNull();
  expect(commands).toHaveLength(0);
});

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

it('keeps locked equipment hidden and restores saved gear when undoing an owned preview', async () => {
  const { user, commands } = setup();
  await user.click(await screen.findByRole('button', { name: '손 장비 보기' }));
  const locked = screen.getByRole('button', { name: /빛나는 지팡이.*30회차 통과 시 획득/ });
  expect(locked).toBeDisabled();
  await user.click(locked);

  const preview = screen.getByRole('region', { name: '외형 미리보기' });
  const avatar = within(preview).getByRole('img');
  const save = within(preview).getByRole('button', { name: '저장' });
  const undo = within(preview).getByRole('button', { name: '되돌리기' });
  expect(avatar).toHaveAccessibleName(/동그란 안경/);
  expect(avatar).not.toHaveAccessibleName(/빛나는 지팡이/);
  expect(save).toBeDisabled();
  expect(undo).toBeDisabled();

  await user.click(screen.getByRole('button', { name: '모자 장비 보기' }));
  await user.click(screen.getByRole('button', { name: '작은 모자 미리보기' }));
  expect(avatar).toHaveAccessibleName(/작은 모자/);
  expect(within(preview).queryByText(/작은 모자/)).toBeNull();
  expect(save).toBeEnabled();
  await user.click(undo);
  expect(avatar).not.toHaveAccessibleName(/작은 모자/);
  expect(save).toBeDisabled();
  expect(undo).toBeDisabled();
  expect(commands).toHaveLength(0);
});

// Saving a partial slot map or inventing haru would erase another slot/character choice.
it('ownedEquipSendsSixSlotsAndRevision', async () => {
  const { user, commands } = setup();
  await user.click(await screen.findByRole('button', { name: '모자 장비 보기' }));
  await user.click(await screen.findByRole('button', { name: '작은 모자 미리보기' }));
  await user.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(commands).toHaveLength(1));
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
});

it('unknownCatalogArtDoesNotExecuteMarkup', async () => {
  const bad = '<img src=x onerror="window.pwned=true">';
  const { user, container } = setup({
    ...gameView,
    items: [{ itemId: bad, assetKey: bad, name: bad, slot: 'hand', value: 6, rewardDay: 30 }],
    inventory: [{ itemId: bad, owned: true, acquiredAt: null }],
  });
  await user.click(await screen.findByRole('button', { name: '손 장비 보기' }));
  await user.click(await screen.findByRole('button', { name: `${bad} 미리보기` }));
  expect(container.querySelector('img[src="x"]')).toBeNull();
  expect(container.querySelector('[onerror]')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
});

it('previewClearsImmediatelyWhenOwnerChanges', async () => {
  const { user, client } = setup();
  await user.click(await screen.findByRole('button', { name: '모자 장비 보기' }));
  await user.click(await screen.findByRole('button', { name: '작은 모자 미리보기' }));
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
  expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled();
});
