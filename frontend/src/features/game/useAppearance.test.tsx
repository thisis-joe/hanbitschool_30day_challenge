import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, student, teacher } from '../../test/server';
import { gameView, journeyView } from '../../test/gameFixtures';
import { deferred } from '../../test/learningFixtures';
import { meKey, replaceAccountCache } from '../auth/queries';
import { clearAllPendingCommands } from '../learning/pendingCommands';
import type { AccountMe } from '../auth/types';
import { gameKeys, useGame, useJourney } from './queries';
import { useAppearance } from './useAppearance';
import type { Equipment } from './types';

const studentA: AccountMe = { ...student, role: 'STUDENT' };
const studentB: AccountMe = { ...studentA, accountId: 'student-b' };
const wanted: Equipment = {
  face: 'face-1',
  hat: 'hat-1',
  top: null,
  bottom: null,
  shoes: null,
  hand: null,
};
function mount(account: AccountMe = studentA) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(meKey, account);
  client.setQueryData(gameKeys.view(account.accountId), gameView);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useAppearance(), { wrapper }) };
}
afterEach(() => clearAllPendingCommands());

// A retry PUT would overwrite the newer tab; a stale cache would hide its canonical appearance.
it.each(['lostResponse', 'conflict'])(
  'uncertainSaveRecoversWithoutOverwritingAnotherTab: %s',
  async (failure) => {
    let puts = 0,
      gets = 0;
    const canonical = { ...gameView, characterId: 'sion' as const, revision: 9 };
    server.use(
      http.put('*/api/student/game/appearance', () => {
        puts++;
        return failure === 'lostResponse'
          ? HttpResponse.error()
          : HttpResponse.json(
              {
                code: 'APPEARANCE_CONFLICT',
                message: '다른 화면에서 변경했어요.',
                fieldErrors: {},
              },
              { status: 409 },
            );
      }),
      http.get('*/api/student/game', () => {
        gets++;
        return HttpResponse.json(canonical);
      }),
    );
    const { client, result } = mount();
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save(null, wanted);
    });
    expect(saved).toBe(false);
    expect(puts).toBe(1);
    expect(gets).toBe(1);
    expect(result.current.error).toMatch(/다른 화면|다시 확인/);
    expect(result.current.busy).toBe(false);
    expect(client.getQueryData(gameKeys.view('student-a'))).toMatchObject({
      characterId: 'sion',
      revision: 9,
    });
  },
);

it('lostResponseResolvesOnlyTheMatchingCanonicalIntent', async () => {
  let puts = 0;
  server.use(
    http.put('*/api/student/game/appearance', () => {
      puts++;
      return HttpResponse.error();
    }),
    http.get('*/api/student/game', () =>
      HttpResponse.json({ ...gameView, revision: 8, equippedBySlot: wanted }),
    ),
  );
  const { result } = mount();
  let saved: boolean | undefined;
  await act(async () => {
    saved = await result.current.save(null, wanted);
  });
  expect(saved).toBe(true);
  expect(puts).toBe(1);
  expect(result.current.error).toBeNull();
});

// Resolving a request after logout/login must never reintroduce the previous owner's game data.
it('latePreviousOwnerSaveNeverEntersNewAccountCache', async () => {
  const entered = deferred<void>(),
    release = deferred<void>();
  let aborted = false;
  server.use(
    http.put('*/api/student/game/appearance', async ({ request }) => {
      request.signal.addEventListener('abort', () => {
        aborted = true;
      });
      entered.resolve();
      await release.promise;
      return HttpResponse.json({ ...gameView, characterId: 'haru', revision: 8 });
    }),
  );
  const { client, result } = mount();
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.save('haru', gameView.equippedBySlot);
  });
  await entered.promise;
  act(() => {
    clearAllPendingCommands();
    replaceAccountCache(client, studentB);
    client.setQueryData(gameKeys.view('student-b'), {
      ...gameView,
      characterId: 'bora',
      revision: 20,
    });
  });
  await act(async () => {
    release.resolve();
    expect(await pending).toBe(false);
  });
  expect(aborted).toBe(true);
  expect(client.getQueryData(gameKeys.view('student-a'))).toBeUndefined();
  expect(client.getQueryData(gameKeys.view('student-b'))).toMatchObject({
    characterId: 'bora',
    revision: 20,
  });
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(false);
});

it('unmountedSaveCannotPublishOrRecover', async () => {
  const entered = deferred<void>(),
    release = deferred<void>();
  let gets = 0;
  server.use(
    http.put('*/api/student/game/appearance', async () => {
      entered.resolve();
      await release.promise;
      return HttpResponse.error();
    }),
    http.get('*/api/student/game', () => {
      gets++;
      return HttpResponse.json(gameView);
    }),
  );
  const { client, result, unmount } = mount();
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.save('haru', wanted);
  });
  await entered.promise;
  unmount();
  release.resolve();
  expect(await pending).toBe(false);
  expect(gets).toBe(0);
  expect(client.getQueryData(gameKeys.view('student-a'))).toEqual(gameView);
});

it('busySaveDoesNotSendOrAcceptANewerConcurrentIntent', async () => {
  const entered = deferred<void>(),
    release = deferred<void>();
  let puts = 0;
  server.use(
    http.put('*/api/student/game/appearance', async () => {
      puts++;
      entered.resolve();
      await release.promise;
      return HttpResponse.json({ ...gameView, characterId: 'haru', revision: 8 });
    }),
  );
  const { result, client } = mount();
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.save('haru', gameView.equippedBySlot);
  });
  await entered.promise;
  await waitFor(() => expect(result.current.busy).toBe(true));
  expect(await result.current.save('bora', wanted)).toBe(false);
  await act(async () => {
    release.resolve();
    expect(await pending).toBe(true);
  });
  expect(puts).toBe(1);
  expect(client.getQueryData(gameKeys.view('student-a'))).toMatchObject({
    characterId: 'haru',
    revision: 8,
  });
});

it('definiteRejectionAndFailedRecoveryRemainRecoverableWithoutPutRetry', async () => {
  let puts = 0,
    gets = 0;
  server.use(
    http.put('*/api/student/game/appearance', () => {
      puts++;
      return HttpResponse.json(
        { code: 'VALIDATION_ERROR', message: '장비를 확인해 주세요.', fieldErrors: {} },
        { status: 400 },
      );
    }),
    http.get('*/api/student/game', () => {
      gets++;
      return new HttpResponse(null, { status: 503 });
    }),
  );
  const { result, client } = mount();
  await act(async () => expect(await result.current.save('haru', wanted)).toBe(false));
  expect(puts).toBe(1);
  expect(gets).toBe(0);
  expect(result.current.error).toMatch(/장비/);
  server.use(
    http.put('*/api/student/game/appearance', () => {
      puts++;
      return HttpResponse.error();
    }),
  );
  await act(async () => expect(await result.current.save('haru', wanted)).toBe(false));
  expect(puts).toBe(2);
  expect(gets).toBe(1);
  expect(result.current.error).not.toBeNull();
  expect(result.current.busy).toBe(false);
  expect(client.getQueryData(gameKeys.view('student-a'))).toEqual(gameView);
});

it('newerCacheRevisionCannotBeOverwrittenByALateSave', async () => {
  const entered = deferred<void>(),
    release = deferred<void>();
  server.use(
    http.put('*/api/student/game/appearance', async () => {
      entered.resolve();
      await release.promise;
      return HttpResponse.json({ ...gameView, revision: 8, characterId: 'haru' });
    }),
  );
  const { client, result } = mount();
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.save('haru', gameView.equippedBySlot);
  });
  await entered.promise;
  act(() =>
    client.setQueryData(gameKeys.view('student-a'), {
      ...gameView,
      characterId: 'bora',
      revision: 10,
    }),
  );
  await act(async () => {
    release.resolve();
    expect(await pending).toBe(false);
  });
  expect(client.getQueryData(gameKeys.view('student-a'))).toMatchObject({
    characterId: 'bora',
    revision: 10,
  });
  expect(result.current.error).not.toBeNull();
});

it('accountQueriesAreIsolatedDisabledForStaffAndAbortOnDeparture', async () => {
  const entered = deferred<void>(),
    release = deferred<void>();
  let gets = 0,
    maps = 0;
  const outgoing = vi.spyOn(globalThis, 'fetch');
  server.use(
    http.get('*/api/student/game', async () => {
      gets++;
      entered.resolve();
      await release.promise;
      return HttpResponse.json(gameView);
    }),
    http.get('*/api/student/learning/map', () => {
      maps++;
      return HttpResponse.json(journeyView);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(meKey, { ...teacher, role: 'TEACHER' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => ({ game: useGame(), journey: useJourney() }), { wrapper });
  expect(result.current.game.fetchStatus).toBe('idle');
  expect(result.current.journey.fetchStatus).toBe('idle');
  expect(gets).toBe(0);
  expect(maps).toBe(0);
  act(() => client.setQueryData(meKey, studentA));
  await entered.promise;
  await waitFor(() => expect(result.current.journey.data?.calendarCap).toBe(1));
  const oldSignal = outgoing.mock.calls.find(([url]) => url === '/api/student/game')?.[1]?.signal;
  expect(oldSignal?.aborted).toBe(false);
  server.use(
    http.get('*/api/student/game', () => {
      gets++;
      return HttpResponse.json(gameView);
    }),
  );
  act(() => {
    clearAllPendingCommands();
    replaceAccountCache(client, studentB);
  });
  await waitFor(() => expect(oldSignal?.aborted).toBe(true));
  await act(async () => release.resolve());
  await waitFor(() => expect(result.current.game.data?.revision).toBe(7));
  expect(client.getQueryData(gameKeys.view('student-a'))).toBeUndefined();
  expect(client.getQueryData(gameKeys.journey('student-a'))).toBeUndefined();
  expect(gameKeys.view('student-a')).not.toEqual(gameKeys.view('student-b'));
});
