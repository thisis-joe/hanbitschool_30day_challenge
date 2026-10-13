import { expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { gameView, journeyView } from '../../test/gameFixtures';
import { deferred } from '../../test/learningFixtures';
import { getGame, getJourney, saveAppearance } from './api';

// A wrong path/verb, omitted revision/slot, or missing CSRF/abort breaks the HTTP contract.
it('gameRequestsUseExactPathsCompleteCommandCsrfAndAbort', async () => {
  const outgoing = vi.spyOn(globalThis, 'fetch');
  const commands: unknown[] = [];
  server.use(
    http.get('*/api/student/game', () => HttpResponse.json(gameView)),
    http.get('*/api/student/learning/map', () => HttpResponse.json(journeyView)),
    http.put('*/api/student/game/appearance', async ({ request }) => {
      expect(request.headers.get('X-CSRF-TOKEN')).toBe('test-token');
      commands.push(await request.json());
      return HttpResponse.json({ ...gameView, revision: 8, characterId: 'bora' });
    }),
  );
  expect((await getGame()).characterId).toBeNull();
  expect((await getJourney()).activeSessionId).toBeNull();
  expect(
    (
      await saveAppearance({
        characterId: 'bora',
        expectedRevision: 7,
        equippedBySlot: gameView.equippedBySlot,
      })
    ).revision,
  ).toBe(8);
  expect(commands).toEqual([
    {
      characterId: 'bora',
      expectedRevision: 7,
      equippedBySlot: {
        face: 'face-1',
        hat: null,
        top: null,
        bottom: null,
        shoes: null,
        hand: null,
      },
    },
  ]);
  expect(
    outgoing.mock.calls.every(
      ([, init]) => init?.credentials === 'same-origin' && init.cache === 'no-store',
    ),
  ).toBe(true);
  outgoing.mockRestore();
  const entered = deferred<void>(),
    release = deferred<void>();
  server.use(
    http.get('*/api/student/game', async () => {
      entered.resolve();
      await release.promise;
      return HttpResponse.json(gameView);
    }),
  );
  const controller = new AbortController();
  const read = getGame(controller.signal);
  const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  controller.abort();
  await rejected;
  release.resolve();
});
