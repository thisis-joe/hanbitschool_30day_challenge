import type { ReactNode } from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, student } from '../../test/server';
import {
  activeSession,
  deferred,
  learningStatus,
  personalQuestion,
  requestId,
  sessionId,
} from '../../test/learningFixtures';
import { renderPage } from '../../test/render';
import { App } from '../../app/App';
import { request } from '../../lib/http';
import * as learningApi from '../learning/api';
import { meKey, useCurrentAccount } from './queries';
import type { AccountMe } from './types';
import { useLearningActions } from '../learning/useLearningActions';
import { learningKeys } from '../learning/queries';
import {
  clearAllPendingCommands,
  readPendingCommand,
  writePendingCommand,
} from '../learning/pendingCommands';

const pending = { kind: 'ADVANCE' as const, sessionId, command: { requestId } };
const studentA = { ...student, role: 'STUDENT' as const };
const studentB = { ...studentA, accountId: 'student-b' };

function mountAccount(account?: AccountMe) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  if (account) client.setQueryData(meKey, account);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => ({ account: useCurrentAccount(), actions: useLearningActions() }), {
      wrapper,
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearAllPendingCommands();
  sessionStorage.clear();
});

// Aborting a real 401 body after /me accepts B must not turn cancellation into B's logout.
it('abortedPreviousOwners401BodyCannotClearTheNewAccountOrPendingCommand', async () => {
  let current = studentA;
  const aborted = deferred<void>();
  const releaseBody = deferred<void>();
  let oldResponse: Response | undefined;
  const upstream = globalThis.fetch;
  const statusReads = vi.spyOn(learningApi, 'getLearningStatus');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === '/api/student/learning/status' && !oldResponse) {
      oldResponse = new Response(
        new ReadableStream({
          start(controller) {
            init!.signal!.addEventListener(
              'abort',
              () => {
                aborted.resolve();
                void releaseBody.promise.then(() =>
                  controller.error(new DOMException('The operation was aborted.', 'AbortError')),
                );
              },
              { once: true },
            );
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
      return oldResponse;
    }
    return upstream(input, init);
  });
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(current)),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({ ...learningStatus, activeSession: null, nextAction: 'START_FIRST' }),
    ),
  );
  const { client } = renderPage(<App />, '/student/learning');
  await waitFor(() => expect(oldResponse?.bodyUsed).toBe(true));
  const oldRead = statusReads.mock.results[0].value as Promise<unknown>;
  current = studentB;
  try {
    await act(async () => client.refetchQueries({ queryKey: meKey, exact: true }));
    await aborted.promise;
    await waitFor(() =>
      expect(client.getQueryData(meKey)).toMatchObject({ accountId: 'student-b' }),
    );
    writePendingCommand(studentB.accountId, pending);
    await act(async () => {
      releaseBody.resolve();
      await Promise.allSettled([oldRead]);
    });
    expect(client.getQueryData(meKey)).toMatchObject({ accountId: 'student-b' });
    expect(readPendingCommand(studentB.accountId)).toEqual(pending);
    expect(screen.getByRole('heading', { name: '나의 학습' })).toBeVisible();
    await expect(oldRead).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    releaseBody.resolve();
  }
});

// Requests without a signal must also lose shared auth effects when their account epoch expires.
it('obsoleteUncancelled401CannotLogOutTheAcceptedAccount', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let current = studentA;
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(current)),
    http.get('*/api/student/learning/status', async () => {
      entered.resolve();
      await release.promise;
      return HttpResponse.json(
        { code: 'UNAUTHENTICATED', message: '로그인 필요', fieldErrors: {} },
        { status: 401 },
      );
    }),
  );
  const { client } = renderPage(<App />, '/student/account');
  await screen.findByText('숲친구');
  const oldRead = request('/api/student/learning/status');
  await entered.promise;
  current = studentB;
  await act(async () => client.refetchQueries({ queryKey: meKey, exact: true }));
  writePendingCommand(studentB.accountId, pending);
  await act(async () => {
    release.resolve();
    await Promise.allSettled([oldRead]);
  });
  expect(client.getQueryData(meKey)).toMatchObject({ accountId: 'student-b' });
  expect(readPendingCommand(studentB.accountId)).toEqual(pending);
  await expect(oldRead).rejects.toMatchObject({ name: 'AbortError' });
});

// Skipping successful /me departure cleanup would resurrect A's command/cache on return.
it('successfulMeTransitionsCleanDepartingOwnersWithoutDetachingObservers', async () => {
  let current = studentA;
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(current)));
  writePendingCommand(studentA.accountId, pending);
  const { client, result } = mountAccount(studentA);
  const observedMe = client.getQueryCache().find({ queryKey: meKey, exact: true });
  const privateA = learningKeys.questions(studentA.accountId, 'BOOKMARKED');
  const privateB = learningKeys.questions(studentB.accountId, 'BOOKMARKED');
  client.setQueryData(privateA, [{ ...personalQuestion, text: '이전 학생의 개인 문항' }]);
  expect(result.current.actions.pendingCommand).toEqual(pending);

  current = studentB;
  await act(async () => client.refetchQueries({ queryKey: meKey, exact: true }));
  await waitFor(() => expect(result.current.account.data?.accountId).toBe('student-b'));
  expect(readPendingCommand(studentA.accountId)).toBeNull();
  expect(client.getQueryData(privateA)).toBeUndefined();
  expect(result.current.actions.pendingCommand).toBeNull();
  writePendingCommand(studentB.accountId, pending);
  client.setQueryData(privateB, [{ ...personalQuestion, text: '두 번째 학생의 개인 문항' }]);

  current = studentA;
  await act(async () => client.refetchQueries({ queryKey: meKey, exact: true }));
  await waitFor(() => expect(result.current.account.data?.accountId).toBe('student-a'));
  expect(result.current.actions.pendingCommand).toBeNull();
  expect(readPendingCommand(studentB.accountId)).toBeNull();
  expect(client.getQueryData(privateB)).toBeUndefined();
  expect(client.getQueryCache().find({ queryKey: meKey, exact: true })).toBe(observedMe);
});

// Initial hydration and a same-owner refresh must retain reload recovery rather than clear it.
it('initialAndSameOwnerMeReadsPreservePersistedRecovery', async () => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(studentA)));
  sessionStorage.setItem('hanbit.learning.pending.v1:student-a', JSON.stringify(pending));
  const { client, result } = mountAccount();
  await waitFor(() => expect(result.current.actions.pendingCommand).toEqual(pending));
  await act(async () => client.refetchQueries({ queryKey: meKey, exact: true }));
  expect(result.current.account.data?.accountId).toBe('student-a');
  expect(result.current.actions.pendingCommand).toEqual(pending);
  expect(readPendingCommand(studentA.accountId)).toEqual(pending);
});

// Current-owner /me 401 must remove private caches as well as the persisted command.
it('currentOwnerMe401ClearsPrivateStateAndPublishesAnonymousToObservers', async () => {
  writePendingCommand(studentA.accountId, pending);
  const { client, result } = mountAccount(studentA);
  const privateKey = learningKeys.session(studentA.accountId, sessionId);
  client.setQueryData(privateKey, activeSession);
  await act(async () => client.refetchQueries({ queryKey: meKey, exact: true }));
  await waitFor(() => expect(result.current.account.data).toBeNull());
  expect(result.current.actions.pendingCommand).toBeNull();
  expect(readPendingCommand(studentA.accountId)).toBeNull();
  expect(client.getQueryData(privateKey)).toBeUndefined();
});
