import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, student, teacher } from '../../test/server';
import {
  activeSession,
  answeredSession,
  answerResult,
  learningStatus,
  personalQuestion,
  sessionId,
  requestId,
  deferred,
} from '../../test/learningFixtures';
import { meKey, useAcceptAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import type { LearningOperationResponse, LearningSessionView } from './types';
import {
  learningKeys,
  useLearningStatus,
  useLearningSession,
  usePersonalQuestions,
} from './queries';
import { useLearningActions } from './useLearningActions';
import {
  clearAllPendingCommands,
  readPendingCommand,
  writePendingCommand,
} from './pendingCommands';

afterEach(() => {
  clearAllPendingCommands();
  sessionStorage.clear();
});

function setup(account: AccountMe | null = student as AccountMe, reads = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(meKey, account);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => ({
      actions: useLearningActions(),
      accept: useAcceptAccount(),
      status: useLearningStatus(),
      session: useLearningSession(reads ? sessionId : undefined),
      questions: usePersonalQuestions('REVIEW_QUEUE'),
    }),
    { wrapper },
  );
  return { ...hook, client };
}

function serveReads(view: LearningSessionView = activeSession) {
  server.use(
    http.get('*/api/student/learning/status', () => HttpResponse.json(learningStatus)),
    http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(view)),
    http.get('*/api/student/learning/questions', () => HttpResponse.json([personalQuestion])),
  );
}

// Generating a second UUID, accepting a changed choice, or failing to GET committed state duplicates logical answers.
it('lostResponseRetryKeepsTheSamePayloadAndRequestId', async () => {
  serveReads(answeredSession);
  const bodies: unknown[] = [];
  let committed = false;
  server.use(
    http.post('*/api/student/learning/sessions/:id/answers', async ({ request }) => {
      bodies.push(await request.json());
      if (!committed) {
        committed = true;
        return HttpResponse.error();
      }
      return HttpResponse.json(answerResult);
    }),
  );
  const { result, client } = setup();
  await act(async () => {
    expect(await result.current.actions.answer(sessionId, 1, 'O')).toBeNull();
  });
  expect(result.current.actions.error).toBeDefined();
  const pending = readPendingCommand('student-a');
  expect(pending?.kind).toBe('ANSWER');
  expect(pending?.command.requestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  await act(async () => {
    expect(await result.current.actions.answer(sessionId, 1, 'X')).toBeNull();
  });
  expect(bodies).toHaveLength(1);
  let retried: LearningOperationResponse | null = null;
  await act(async () => {
    retried = await result.current.actions.retryPending();
  });
  expect(retried).toEqual({ kind: 'ANSWER', sessionId, answer: answerResult });
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[0]).toMatchObject({ questionId: 1, choice: 'O' });
  expect(client.getQueryData(learningKeys.session('student-a', sessionId))).toEqual(
    answeredSession,
  );
  expect(readPendingCommand('student-a')).toBeNull();
  expect(result.current.actions.pendingCommand).toBeNull();
});

// A state-only busy guard has a render gap; a synchronous lock must stop the second call.
it('fastDoubleClickSubmitsOnlyOneLogicalAnswer', async () => {
  serveReads(answeredSession);
  const entered = deferred<void>();
  const release = deferred<void>();
  let answers = 0;
  server.use(
    http.post('*/api/student/learning/sessions/:id/answers', async () => {
      answers++;
      entered.resolve();
      await release.promise;
      return HttpResponse.json(answerResult);
    }),
  );
  const { result } = setup();
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = result.current.actions.answer(sessionId, 1, 'O');
    second = result.current.actions.answer(sessionId, 1, 'O');
  });
  await entered.promise;
  expect(await second).toBeNull();
  expect(answers).toBe(1);
  expect(result.current.actions.busy).toBe(true);
  await act(async () => {
    release.resolve();
    expect(await first).toEqual(answerResult);
  });
  expect(result.current.actions.busy).toBe(false);
});

// Missing signals or checking only the mounted hook (not auth epoch) lets old student data reappear.
it('accountChangeAbortsReadsAndIgnoresLateMutationCompletion', async () => {
  const outgoing = vi.spyOn(globalThis, 'fetch');
  const release = deferred<void>();
  let reads = 0;
  let posts = 0;
  const studentB = { ...student, accountId: 'student-b' } as AccountMe;
  server.use(
    http.get('*/api/student/learning/*', async ({ request }) => {
      reads++;
      await release.promise;
      return HttpResponse.json(
        new URL(request.url).pathname.endsWith('/questions')
          ? [personalQuestion]
          : new URL(request.url).pathname.endsWith('/status')
            ? learningStatus
            : activeSession,
      );
    }),
    http.post('*/api/student/learning/sessions/:id/answers', async () => {
      posts++;
      await release.promise;
      return HttpResponse.json(answerResult);
    }),
  );
  const { result, client } = setup(student as AccountMe, true);
  await waitFor(() => expect(reads).toBe(3));
  let oldAnswer!: Promise<unknown>;
  act(() => {
    oldAnswer = result.current.actions.answer(sessionId, 1, 'O');
  });
  await waitFor(() => expect(posts).toBe(1));
  const oldRequests = outgoing.mock.calls.filter(
    ([path]) => typeof path === 'string' && path.startsWith('/api/student/learning/'),
  );
  expect(oldRequests).toHaveLength(4);
  await act(async () => {
    await result.current.accept(studentB);
  });
  // Observe our actual fetch signals; MSW's reconstructed signal can lose abort linkage after response errors.
  expect(oldRequests.every(([, init]) => init?.signal?.aborted === true)).toBe(true);
  await act(async () => {
    release.resolve();
    expect(await oldAnswer).toBeNull();
  });
  expect(client.getQueryData(learningKeys.session('student-a', sessionId))).toBeUndefined();
  expect(readPendingCommand('student-a')).toBeNull();
  expect(readPendingCommand('student-b')).toBeNull();
  expect(result.current.actions.pendingCommand).toBeNull();
});

// INVALID_CSRF_TOKEN is recoverable and must keep the logical request while obtaining a fresh token.
it('csrfRecoveryReusesThePersistedCommandAfterRemount', async () => {
  serveReads(answeredSession);
  const bodies: unknown[] = [];
  const tokens: (string | null)[] = [];
  server.use(
    http.post('*/api/student/learning/sessions/:id/answers', async ({ request }) => {
      bodies.push(await request.json());
      tokens.push(request.headers.get('X-CSRF-TOKEN'));
      return bodies.length === 1
        ? HttpResponse.json(
            { code: 'INVALID_CSRF_TOKEN', message: '다시 시도', fieldErrors: {} },
            { status: 403 },
          )
        : HttpResponse.json(answerResult);
    }),
  );
  const first = setup();
  await act(async () => {
    await first.result.current.actions.answer(sessionId, 1, 'O');
  });
  expect(readPendingCommand('student-a')).not.toBeNull();
  const stored = sessionStorage.getItem('hanbit.learning.pending.v1:student-a')!;
  first.unmount();
  // Simulate a fresh tab module's empty memory while keeping the sessionStorage command.
  clearAllPendingCommands();
  sessionStorage.setItem('hanbit.learning.pending.v1:student-a', stored);
  server.use(
    http.get('*/api/auth/csrf', () =>
      HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'fresh-learning-token' }),
    ),
  );
  const next = setup();
  expect(next.result.current.actions.pendingCommand?.kind).toBe('ANSWER');
  await act(async () => {
    await next.result.current.actions.retryPending();
  });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(tokens[1]).toBe('fresh-learning-token');
  expect(readPendingCommand('student-a')).toBeNull();
});

// Confirmed conflicts need a canonical GET and must not invent feedback or loop automatically.
it('finalizedConflictRecoversCanonicalFeedbackAndInvalidatesRelatedReads', async () => {
  serveReads(answeredSession);
  let posts = 0;
  let statuses = 0;
  let lists = 0;
  server.use(
    http.get('*/api/student/learning/status', () => {
      statuses++;
      return HttpResponse.json({ ...learningStatus, totalXp: statuses > 1 ? 100 : 0 });
    }),
    http.get('*/api/student/learning/questions', () => {
      lists++;
      return HttpResponse.json([{ ...personalQuestion, mastered: lists > 1 }]);
    }),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      posts++;
      return HttpResponse.json(
        { code: 'ANSWER_ALREADY_FINALIZED', message: '이미 확정', fieldErrors: {} },
        { status: 409 },
      );
    }),
  );
  const { result } = setup();
  await waitFor(() => expect(result.current.status.data?.totalXp).toBe(0));
  await waitFor(() => expect(result.current.questions.data?.[0].mastered).toBe(false));
  await act(async () => {
    expect(await result.current.actions.answer(sessionId, 1, 'X')).toEqual(answerResult);
  });
  expect(result.current.status.data?.totalXp).toBe(100);
  expect(result.current.questions.data?.[0].mastered).toBe(true);
  expect(posts).toBe(1);
  expect(readPendingCommand('student-a')).toBeNull();
});

it('failedConflictRecoveryRetainsTheRequestForAnExplicitRetry', async () => {
  serveReads();
  server.use(
    http.post('*/api/student/learning/sessions/:id/answers', () =>
      HttpResponse.json(
        { code: 'QUESTION_MISMATCH', message: '문항 불일치', fieldErrors: {} },
        { status: 409 },
      ),
    ),
    http.get('*/api/student/learning/sessions/:id', () => HttpResponse.error()),
  );
  const { result } = setup();
  await act(async () => {
    expect(await result.current.actions.answer(sessionId, 1, 'O')).toBeNull();
  });
  expect(readPendingCommand('student-a')?.kind).toBe('ANSWER');
  expect(result.current.actions.error).toBeDefined();
});

it('definiteRejectionClearsThePendingCommandAndSurfacesTheServerError', async () => {
  serveReads();
  server.use(
    http.post('*/api/student/learning/sessions', () =>
      HttpResponse.json(
        {
          code: 'DAY_NOT_YET_AVAILABLE',
          message: '아직 시작할 수 없는 회차입니다.',
          fieldErrors: {},
        },
        { status: 403 },
      ),
    ),
  );
  const { result } = setup();
  await act(async () => {
    expect(
      await result.current.actions.start({ mode: 'FIRST', dayNumber: 1, questionIds: null }),
    ).toBeNull();
  });
  expect(readPendingCommand('student-a')).toBeNull();
  expect(result.current.actions.error).toBe('아직 시작할 수 없는 회차입니다.');
});

// Mutation snapshots can be stale on replay; consumers must receive the new GET snapshot.
it('startAndAdvanceReturnTheFreshCanonicalSession', async () => {
  const nextSession: LearningSessionView = {
    ...activeSession,
    answeredCount: 1,
    question: {
      ...activeSession.question!,
      questionId: 2,
      position: 2,
      deadlineAt: '2026-10-13T00:00:20Z',
    },
  };
  serveReads(nextSession);
  server.use(
    http.post('*/api/student/learning/sessions', () => HttpResponse.json(activeSession)),
    http.post('*/api/student/learning/sessions/:id/advance', () =>
      HttpResponse.json(activeSession),
    ),
  );
  const { result } = setup();
  await act(async () => {
    expect(
      await result.current.actions.start({ mode: 'FIRST', dayNumber: 1, questionIds: null }),
    ).toEqual(nextSession);
  });
  await act(async () => {
    expect(await result.current.actions.advance(sessionId)).toEqual(nextSession);
  });
});

it.each([teacher as AccountMe, null])(
  'nonStudentsNeverIssueLearningReadsOrWrites: %s',
  async (account) => {
    let requests = 0;
    server.use(
      http.all('*/api/student/learning/*', () => {
        requests++;
        return HttpResponse.json(learningStatus);
      }),
    );
    const { result } = setup(account, true);
    await act(async () => {
      expect(
        await result.current.actions.start({ mode: 'FIRST', dayNumber: 1, questionIds: null }),
      ).toBeNull();
    });
    expect(requests).toBe(0);
    expect(result.current.status.data).toBeUndefined();
    expect(result.current.session.data).toBeUndefined();
    expect(result.current.questions.data).toBeUndefined();
  },
);

it('anExistingPendingStartCannotBeOverwrittenByANewTarget', async () => {
  serveReads();
  writePendingCommand('student-a', {
    kind: 'START',
    command: { mode: 'REVIEW', dayNumber: null, questionIds: [1], requestId },
  });
  let posts = 0;
  server.use(
    http.post('*/api/student/learning/sessions', () => {
      posts++;
      return HttpResponse.json(activeSession);
    }),
  );
  const { result } = setup();
  await act(async () => {
    expect(
      await result.current.actions.start({ mode: 'FIRST', dayNumber: 2, questionIds: null }),
    ).toBeNull();
  });
  expect(posts).toBe(0);
  expect(readPendingCommand('student-a')).toMatchObject({
    command: { mode: 'REVIEW', questionIds: [1], requestId },
  });
});
