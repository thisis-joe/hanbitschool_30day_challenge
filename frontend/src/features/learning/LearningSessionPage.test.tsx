import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, student, teacher } from '../../test/server';
import {
  activeSession,
  answeredSession,
  answerResult,
  deferred,
  learningStatus,
  personalQuestion,
  requestId,
  sessionId,
} from '../../test/learningFixtures';
import { meKey } from '../auth/queries';
import { LearningSessionPage } from './LearningSessionPage';
import { LearningResultPage } from './LearningResultPage';
import { App } from '../../app/App';
import { renderPage } from '../../test/render';
import {
  clearAllPendingCommands,
  readPendingCommand,
  writePendingCommand,
} from './pendingCommands';
import { learningKeys } from './queries';
import type { LearningSessionView } from './types';
import { gameKeys } from '../game/queries';
import { gameView, journeyView } from '../../test/gameFixtures';

it('preAnswerInitialCosmeticReadsCannotPublishStaleMapAfterCanonicalAnswer', async () => {
  const oldRelease = deferred<void>();
  let gameReads = 0;
  let mapReads = 0;
  let view = activeSession;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.get('*/api/student/game', async () => {
      const old = ++gameReads === 1;
      if (old) await oldRelease.promise;
      return HttpResponse.json({ ...gameView, revision: old ? 7 : 8 });
    }),
    http.get('*/api/student/learning/map', async () => {
      const old = ++mapReads === 1;
      if (old) await oldRelease.promise;
      return HttpResponse.json({
        ...journeyView,
        journeyPosition: old ? 0 : 1,
        firstAnswerCount: old ? 0 : 1,
      });
    }),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      view = answeredSession;
      return HttpResponse.json(answerResult);
    }),
  );
  const { client } = setup();
  try {
    await screen.findByRole('button', { name: 'O · 사실' });
    await waitFor(() => {
      expect(gameReads).toBe(1);
      expect(mapReads).toBe(1);
    });
    await userEvent.click(screen.getByRole('button', { name: 'O · 사실' }));
    await screen.findByRole('heading', { name: '정답이에요' });
    await waitFor(() => expect(screen.getByRole('button', { name: '다음 문제' })).toBeEnabled());
    await waitFor(() =>
      expect(client.getQueryData(gameKeys.journey('student-a'))).toMatchObject({
        journeyPosition: 1,
      }),
    );
    expect(client.getQueryData(gameKeys.view('student-a'))).toMatchObject({ revision: 8 });
    await act(async () => {
      oldRelease.resolve();
    });
    expect(client.getQueryData(gameKeys.journey('student-a'))).toMatchObject({
      journeyPosition: 1,
    });
    expect(client.getQueryData(gameKeys.view('student-a'))).toMatchObject({ revision: 8 });
  } finally {
    await act(async () => {
      oldRelease.resolve();
    });
  }
});

it('heldCosmeticRefreshDoesNotKeepCanonicalFeedbackOrNextPending', async () => {
  const release = deferred<void>();
  const learningRelease = deferred<void>();
  const learningEntered = deferred<void>();
  let view = activeSession;
  let advances = 0;
  const held: Promise<unknown>[] = [];
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.get('*/api/student/learning/status', async () => {
      if (view !== activeSession) {
        learningEntered.resolve();
        await learningRelease.promise;
      }
      return HttpResponse.json(learningStatus);
    }),
    http.get('*/api/student/learning/questions', async () => {
      if (view !== activeSession) await learningRelease.promise;
      return HttpResponse.json([]);
    }),
    http.get('*/api/student/game', async () => {
      if (view !== activeSession) {
        held.push(release.promise);
        await release.promise;
      }
      return HttpResponse.json(gameView);
    }),
    http.get('*/api/student/learning/map', async () => {
      if (view !== activeSession) {
        held.push(release.promise);
        await release.promise;
      }
      return HttpResponse.json(journeyView);
    }),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      view = answeredSession;
      return HttpResponse.json(answerResult);
    }),
    http.post('*/api/student/learning/sessions/:id/advance', () => {
      advances++;
      view = {
        ...activeSession,
        question: { ...activeSession.question!, questionId: 2, position: 2 },
      };
      return json(view);
    }),
  );
  const { client } = setup();
  try {
    await screen.findByRole('button', { name: 'O · 사실' });
    await waitFor(() => expect(client.isFetching({ queryKey: ['game'] })).toBe(0));
    await userEvent.click(screen.getByRole('button', { name: 'O · 사실' }));
    await screen.findByRole('heading', { name: '정답이에요' });
    await waitFor(() => expect(held).toHaveLength(2));
    await learningEntered.promise;
    expect(screen.getByRole('button', { name: '다음 문제' })).toBeDisabled();
    expect(screen.getByText('답변을 확인하고 있어요')).toBeVisible();
    expect(readPendingCommand('student-a')?.kind).toBe('ANSWER');
    await act(async () => {
      learningRelease.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '다음 문제' })).toBeEnabled());
    expect(readPendingCommand('student-a')).toBeNull();
    expect(client.isFetching({ queryKey: ['game'] })).toBe(2);
    await userEvent.click(screen.getByRole('button', { name: '다음 문제' }));
    await screen.findByRole('heading', { name: '문항 2 / 5' });
    expect(advances).toBe(1);
    expect(document.querySelector('time')).toHaveAttribute(
      'dateTime',
      activeSession.question!.deadlineAt,
    );
  } finally {
    await act(async () => {
      learningRelease.resolve();
      release.resolve();
      await Promise.all(held);
    });
  }
});

it('gameReadFailureDoesNotBlockActiveLearning', async () => {
  let view = activeSession;
  let writes = 0;
  server.use(
    http.get('*/api/student/game', () => new HttpResponse(null, { status: 503 })),
    http.get('*/api/student/learning/map', () => new HttpResponse(null, { status: 503 })),
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      writes++;
      view = answeredSession;
      return HttpResponse.json(answerResult);
    }),
  );
  setup();
  const choice = await screen.findByRole('button', { name: 'O · 사실' });
  expect(await screen.findByText('여행 장면을 준비하고 있어요')).toBeVisible();
  expect(document.querySelector('time')).toHaveAttribute(
    'dateTime',
    activeSession.question!.deadlineAt,
  );
  expect(screen.getByRole('button', { name: 'X · 해석' })).toBeEnabled();
  await userEvent.click(choice);
  expect(await screen.findByRole('heading', { name: '정답이에요' })).toBeVisible();
  expect(writes).toBe(1);
});

it('journeyAnimationCannotAdvanceOrResetDeadline', async () => {
  const writes: string[] = [];
  server.use(
    http.post('*/api/student/learning/*', ({ request }) => {
      writes.push(request.url);
      return new HttpResponse(null, { status: 500 });
    }),
  );
  const { client } = setup();
  await screen.findByRole('button', { name: 'O · 사실' });
  const scene = await screen.findByRole('region', { name: '학습 여행 장면' });
  const deadline = document.querySelector('time')!.getAttribute('dateTime');
  await act(async () => {
    client.setQueryData(gameKeys.journey('student-a'), {
      ...journeyView,
      journeyPosition: 51,
      firstAnswerCount: 51,
    });
    scene.dispatchEvent(new Event('animationend', { bubbles: true }));
  });
  expect(document.querySelector('time')).toHaveAttribute('dateTime', deadline);
  expect(screen.getByRole('button', { name: 'O · 사실' })).toBeEnabled();
  expect(writes).toEqual([]);
});

it('workerTimeoutRestorationRefreshesGameAndMap', async () => {
  let view = activeSession;
  let reads = 0;
  let mapReads = 0;
  let position = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.get('*/api/student/game', () => {
      reads++;
      return HttpResponse.json(gameView);
    }),
    http.get('*/api/student/learning/map', () => {
      mapReads++;
      return HttpResponse.json({
        ...journeyView,
        journeyPosition: position,
        firstAnswerCount: position,
      });
    }),
  );
  const { client } = setup();
  await screen.findByRole('button', { name: 'O · 사실' });
  await waitFor(() => expect(mapReads).toBe(1));
  view = { ...answeredSession, lastAnswer: { ...answerResult, outcome: 'TIMED_OUT' } };
  position = 1;
  await act(async () => {
    await client.invalidateQueries({ queryKey: learningKeys.session('student-a', sessionId) });
  });
  expect(await screen.findByRole('heading', { name: '시간이 초과되었어요' })).toBeVisible();
  await waitFor(() =>
    expect(client.getQueryData(gameKeys.journey('student-a'))).toMatchObject({
      journeyPosition: 1,
    }),
  );
  expect(reads).toBe(2);
  expect(mapReads).toBe(2);
  await act(async () => {
    await client.invalidateQueries({ queryKey: learningKeys.session('student-a', sessionId) });
  });
  expect(mapReads).toBe(2);
});

const date = 'Tue, 13 Oct 2026 00:00:00 GMT';
const json = (view: LearningSessionView, serverDate = date) =>
  HttpResponse.json(view, { headers: { Date: serverDate } });

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(meKey, student);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/student/learning/sessions/${sessionId}`]}>
          <Routes>
            <Route path="/student/learning/sessions/:sessionId" element={<LearningSessionPage />} />
            <Route
              path="/student/learning/sessions/:sessionId/result"
              element={<LearningResultPage />}
            />
            <Route path="/student/learning" element={<h1>학습 홈</h1>} />
            <Route path="/staff/classrooms" element={<h1>교직원 학급</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  clearAllPendingCommands();
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/student/learning/status', () => HttpResponse.json(learningStatus)),
    http.get('*/api/student/learning/sessions/:id', () => json(activeSession)),
  );
});
afterEach(() => {
  vi.useRealTimers();
  clearAllPendingCommands();
});

it('feedbackOffersConsentBeforeAdvanceAndDoesNotClearUserQueue', async () => {
  let queueAdds = 0;
  let queueDeletes = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json({
        ...answeredSession,
        lastAnswer: { ...answerResult, reviewPromptEligible: true, outcome: 'WRONG' },
      }),
    ),
    http.get('*/api/student/learning/questions', () => HttpResponse.json([])),
    http.put('*/api/student/learning/review-queue/1', () => {
      queueAdds++;
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete('*/api/student/learning/review-queue/1', () => {
      queueDeletes++;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  setup();
  expect(await screen.findByText('다시 볼 문제로 추가할까요?')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: '추가하기' })).toBeEnabled());
  expect(
    screen
      .getByRole('button', { name: '추가하기' })
      .compareDocumentPosition(screen.getByRole('button', { name: '다음 문제' })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(queueAdds).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: '추가하기' }));
  await waitFor(() => expect(screen.queryByText('다시 볼 문제로 추가할까요?')).toBeNull());
  expect(queueAdds).toBe(1);
  expect(queueDeletes).toBe(0);
});

it('userQueuedCorrectAnswerRemainsExplicitlyRemovable', async () => {
  let view = activeSession;
  let queuedQuestion = personalQuestion;
  let deletes = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.get('*/api/student/learning/questions', ({ request }) => {
      const filter = new URL(request.url).searchParams.get('filter');
      return HttpResponse.json(
        filter === 'BOOKMARKED' || (filter === 'MASTERED' && !queuedQuestion.mastered)
          ? []
          : [queuedQuestion],
      );
    }),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      view = answeredSession;
      queuedQuestion = {
        ...personalQuestion,
        inReviewQueue: true,
        mastered: true,
        lastOutcome: 'CORRECT',
      };
      return HttpResponse.json(answerResult);
    }),
    http.delete('*/api/student/learning/review-queue/1', () => {
      deletes++;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { client } = renderPage(<App />, `/student/learning/sessions/${sessionId}`);
  await userEvent.click(await screen.findByRole('button', { name: 'O · 사실' }));
  expect(await screen.findByRole('heading', { name: '정답이에요' })).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: '별표' })).toBeEnabled());
  expect(client.getQueryData(learningKeys.questions('student-a', 'REVIEW_QUEUE'))).toEqual([
    queuedQuestion,
  ]);
  expect(deletes).toBe(0);
  await userEvent.click(screen.getByRole('link', { name: '나의 문제' }));
  expect(await screen.findByRole('button', { name: '다시 볼 목록에서 제거' })).toBeEnabled();
  expect(screen.getByText('복습 완료 · 다시 볼 목록에 있어요')).toBeVisible();
  expect(deletes).toBe(0);
});

// Rendering lastAnswer in QUESTION_ACTIVE would reveal a previous question's result.
it('activeQuestionDoesNotRevealAnswerOrExplanation', async () => {
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json({ ...activeSession, lastAnswer: answerResult }),
    ),
  );
  setup();
  expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'X · 해석' })).toBeEnabled();
  expect(screen.getByText('테스트용 문항입니다.')).toBeVisible();
  expect(screen.queryByText('테스트용 설명입니다.')).not.toBeInTheDocument();
  expect(screen.queryByText(/정답은/)).not.toBeInTheDocument();
  expect(screen.getByText('현재 문항의 제한시간은 계속 흘러요')).toBeVisible();
  expect(screen.getByRole('heading', { name: /문항 1/ })).toHaveFocus();
});

// Client choice-based scoring would disagree with the server's WRONG/TIMED_OUT response.
it.each([
  ['CORRECT', '정답이에요'],
  ['WRONG', '오답이에요'],
  ['TIMED_OUT', '시간이 초과되었어요'],
] as const)('correctWrongAndTimeoutFeedbackUseServerResult: %s', async (outcome, label) => {
  let view = activeSession;
  const answer = { ...answerResult, outcome, correctChoice: 'X' as const, xpAwarded: 1 };
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      view = { ...answeredSession, lastAnswer: answer };
      return HttpResponse.json(answer);
    }),
  );
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'O · 사실' }));
  expect(await screen.findByRole('heading', { name: label })).toHaveFocus();
  expect(screen.getByText('정답은 X · 해석')).toBeVisible();
  expect(screen.getByText('테스트용 설명입니다.')).toBeVisible();
  expect(screen.getByText('이번 답변으로 받은 경험치: 1 XP')).toBeVisible();
  // Canonical feedback publishes before the existing learning cache refresh settles.
  await waitFor(() => expect(screen.queryByText('답변을 확인하고 있어요')).toBeNull());
  expect(screen.getByRole('button', { name: '다음 문제' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'X · 해석' })).not.toBeInTheDocument();
});

// Expiry may only read until the server changes phase; it must never write timeout or advance.
it('zeroCountdownWaitsForTheServerAndNeverAdvances', async () => {
  const expired = {
    ...activeSession,
    question: { ...activeSession.question!, deadlineAt: '2026-10-13T00:00:00Z' },
  };
  let view: LearningSessionView = expired;
  let reads = 0;
  let writes = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => {
      reads++;
      return json(view);
    }),
    http.post('*/api/student/learning/*', () => {
      writes++;
      return HttpResponse.json({});
    }),
  );
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const { client } = setup();
  expect(await screen.findByText('서버에서 답변을 확인하고 있어요')).toBeVisible();
  expect(screen.getByRole('button', { name: 'O · 사실' })).toBeDisabled();
  const query = client
    .getQueryCache()
    .find({ queryKey: learningKeys.session('student-a', sessionId) });
  // Fake intervals do not settle real MSW I/O. Finish the immediate expiry
  // refetch before checking that the next tick starts another request.
  await act(async () => {
    await query?.promise;
  });
  const startReads = reads;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
    await query?.promise;
  });
  expect(reads).toBeGreaterThan(startReads);
  view = { ...answeredSession, lastAnswer: { ...answerResult, outcome: 'TIMED_OUT' } };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(await screen.findByRole('heading', { name: '시간이 초과되었어요' })).toBeVisible();
  const confirmedReads = reads;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(reads).toBe(confirmedReads);
  expect(writes).toBe(0);
});

// A canonical 404 during expiry removes the active session, so its polling must stop.
it('missingSessionDuringExpiryStopsPollingAndOffersHome', async () => {
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => {
      reads++;
      return reads === 1
        ? json({
            ...activeSession,
            question: { ...activeSession.question!, deadlineAt: '2026-10-13T00:00:00Z' },
          })
        : HttpResponse.json(
            { code: 'NOT_FOUND', message: '학습을 찾을 수 없어요.', fieldErrors: {} },
            { status: 404 },
          );
    }),
  );
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  setup();
  await screen.findByRole('alert');
  expect(screen.getByRole('link', { name: '학습 홈으로' })).toBeVisible();
  const stoppedReads = reads;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(reads).toBe(stoppedReads);
});

// A response slower than the polling period must stay in flight until canonical feedback arrives.
it('expiryPollingKeepsASlowCanonicalReadInFlight', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', async () => {
      reads++;
      if (reads === 1)
        return json({
          ...activeSession,
          question: { ...activeSession.question!, deadlineAt: '2026-10-13T00:00:00Z' },
        });
      entered.resolve();
      await release.promise;
      return json({ ...answeredSession, lastAnswer: { ...answerResult, outcome: 'TIMED_OUT' } });
    }),
  );
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  setup();
  await screen.findByText('서버에서 답변을 확인하고 있어요');
  await entered.promise;
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(reads).toBe(2);
  } finally {
    await act(async () => {
      release.resolve();
    });
  }
  expect(await screen.findByRole('heading', { name: '시간이 초과되었어요' })).toBeVisible();
});

// A reload must hydrate the exact uncertain command and reject a second choice.
it('reloadRestoresAnUncertainAnswerWithoutOfferingAnotherChoice', async () => {
  const bodies: unknown[] = [];
  let view = activeSession;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.post('*/api/student/learning/sessions/:id/answers', async ({ request }) => {
      bodies.push(await request.json());
      if (bodies.length === 1) return HttpResponse.error();
      view = answeredSession;
      return HttpResponse.json(answerResult);
    }),
  );
  const first = setup();
  await userEvent.click(await screen.findByRole('button', { name: 'O · 사실' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('연결을 확인하고 다시 시도해 주세요.');
  const stored = sessionStorage.getItem('hanbit.learning.pending.v1:student-a')!;
  first.unmount();
  clearAllPendingCommands();
  sessionStorage.setItem('hanbit.learning.pending.v1:student-a', stored);
  setup();
  expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'X · 해석' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '같은 답변 다시 확인' }));
  expect(await screen.findByRole('heading', { name: '정답이에요' })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[0]).toMatchObject({ questionId: 1, choice: 'O' });
  expect(readPendingCommand('student-a')).toBeNull();
});

// Reload recovery must remain possible even when the initial session GET fails.
it('uncertainAnswerCanBeRetriedWhenTheReloadReadFails', async () => {
  writePendingCommand('student-a', {
    kind: 'ANSWER',
    sessionId,
    command: { requestId, questionId: 1, choice: 'O' },
  });
  let answered = false;
  const bodies: unknown[] = [];
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      answered ? json(answeredSession) : HttpResponse.error(),
    ),
    http.post('*/api/student/learning/sessions/:id/answers', async ({ request }) => {
      bodies.push(await request.json());
      answered = true;
      return HttpResponse.json(answerResult);
    }),
  );
  setup();
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: '같은 답변 다시 확인' }));
  expect(await screen.findByRole('heading', { name: '정답이에요' })).toBeVisible();
  expect(bodies).toEqual([{ requestId, questionId: 1, choice: 'O' }]);
});

// Reopening the session must use the stored deadline, and feedback must not start the next timer.
it('resumeKeepsTheOriginalDeadlineInQuestionAndFeedback', async () => {
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json(activeSession, 'Tue, 13 Oct 2026 00:00:07 GMT'),
    ),
  );
  const first = setup();
  expect(await screen.findByText('남은 시간 3초')).toBeVisible();
  expect(screen.getByText('남은 시간 3초').closest('[aria-live]')).toBeNull();
  first.unmount();
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json(answeredSession, 'Tue, 13 Oct 2026 00:00:08 GMT'),
    ),
  );
  const resumed = setup();
  expect(await screen.findByRole('heading', { name: '정답이에요' })).toBeVisible();
  expect(screen.queryByText(/남은 시간/)).not.toBeInTheDocument();
  expect(
    resumed.client.getQueryData<LearningSessionView>(learningKeys.session('student-a', sessionId))
      ?.question?.deadlineAt,
  ).toBe('2026-10-13T00:00:10Z');
});

// A stale answer POST must not attach feedback to a newer canonical active question.
it('lateGetCanonicalReconciliationDoesNotPasteLastAnswerOntoANewQuestion', async () => {
  const next = {
    ...activeSession,
    answeredCount: 1,
    question: {
      ...activeSession.question!,
      questionId: 2,
      position: 2,
      text: '새로 열린 문항입니다.',
      deadlineAt: '2026-10-13T00:00:20Z',
    },
    lastAnswer: answerResult,
  };
  let view = activeSession;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      view = next;
      return HttpResponse.json(answerResult);
    }),
  );
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'O · 사실' }));
  expect(await screen.findByText('새로 열린 문항입니다.')).toBeVisible();
  expect(screen.queryByText('테스트용 설명입니다.')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /문항 2/ })).toHaveFocus();
});

// A pending advance or start must preserve its identity rather than create another operation.
it.each(['ADVANCE', 'START'] as const)(
  'reloadRetriesTheExactPendingOperation: %s',
  async (kind) => {
    const pending =
      kind === 'ADVANCE'
        ? { kind, sessionId, command: { requestId } }
        : { kind, command: { requestId, mode: 'FIRST' as const, dayNumber: 1, questionIds: null } };
    writePendingCommand('student-a', pending);
    const bodies: unknown[] = [];
    server.use(
      http.get('*/api/student/learning/sessions/:id', () => json(answeredSession)),
      http.post(
        kind === 'START'
          ? '*/api/student/learning/sessions'
          : '*/api/student/learning/sessions/:id/advance',
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(answeredSession);
        },
      ),
    );
    setup();
    expect(await screen.findByRole('button', { name: '다음 문제' })).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', {
        name: kind === 'START' ? '같은 학습 시작 다시 확인' : '같은 다음 문제 다시 확인',
      }),
    );
    await waitFor(() => expect(readPendingCommand('student-a')).toBeNull());
    expect(bodies).toEqual([pending.command]);
  },
);

// A repeated button event while the request is in flight must not write twice.
it('answerAndAdvanceExposeLoadingAndRequireAnExplicitNextQuestion', async () => {
  const release = deferred<void>();
  let view = activeSession;
  let answers = 0;
  let advances = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(view)),
    http.post('*/api/student/learning/sessions/:id/answers', async () => {
      answers++;
      await release.promise;
      view = answeredSession;
      return HttpResponse.json(answerResult);
    }),
    http.post('*/api/student/learning/sessions/:id/advance', () => {
      advances++;
      view = {
        ...activeSession,
        answeredCount: 1,
        question: { ...activeSession.question!, position: 2, questionId: 2 },
      };
      return HttpResponse.json(view);
    }),
  );
  setup();
  await userEvent.dblClick(await screen.findByRole('button', { name: 'O · 사실' }));
  expect(await screen.findByText('답변을 확인하고 있어요')).toBeVisible();
  expect(screen.getByRole('button', { name: 'X · 해석' })).toBeDisabled();
  await act(async () => {
    release.resolve();
  });
  await screen.findByRole('button', { name: '다음 문제' });
  expect(answers).toBe(1);
  expect(advances).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: '다음 문제' }));
  expect(await screen.findByRole('heading', { name: /문항 2/ })).toBeVisible();
  expect(advances).toBe(1);
});

// Focus/visibility/network restoration must re-read; listeners must stop on page departure.
it('returningToThePageRereadsCanonicalStateAndCleansUpListeners', async () => {
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => {
      reads++;
      return json(activeSession);
    }),
  );
  const page = setup();
  await screen.findByRole('button', { name: 'O · 사실' });
  for (const event of ['focus', 'online']) {
    const previous = reads;
    await act(async () => {
      window.dispatchEvent(new Event(event));
    });
    await waitFor(() => expect(reads).toBeGreaterThan(previous));
  }
  const previous = reads;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => expect(reads).toBeGreaterThan(previous));
  page.unmount();
  const finalReads = reads;
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(reads).toBe(finalReads);
});

// An account change must remove the expired session and stop its poll/listeners.
it('accountDepartureStopsExpiredPollingAndHidesPreviousLearning', async () => {
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => {
      reads++;
      return json({
        ...activeSession,
        question: { ...activeSession.question!, deadlineAt: '2026-10-13T00:00:00Z' },
      });
    }),
  );
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const page = setup();
  await screen.findByText('서버에서 답변을 확인하고 있어요');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await act(async () => {
    page.client.setQueryData(meKey, teacher);
  });
  expect(await screen.findByRole('heading', { name: '교직원 학급' })).toBeVisible();
  const stoppedReads = reads;
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(reads).toBe(stoppedReads);
  expect(screen.queryByText('테스트용 문항입니다.')).not.toBeInTheDocument();
});

// A failed reconciliation must remain visible and preserve the logical answer for retry.
it('failedCanonicalReconciliationShowsErrorWithoutInventingFeedback', async () => {
  let recovery = false;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      recovery ? HttpResponse.error() : json(activeSession),
    ),
    http.post('*/api/student/learning/sessions/:id/answers', () => {
      recovery = true;
      return HttpResponse.json(
        { code: 'QUESTION_MISMATCH', message: '문항이 변경되었어요.', fieldErrors: {} },
        { status: 409 },
      );
    }),
  );
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'O · 사실' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('연결을 확인하고 다시 시도해 주세요.');
  expect(screen.getByRole('button', { name: '같은 답변 다시 확인' })).toBeEnabled();
  expect(screen.queryByText('테스트용 설명입니다.')).not.toBeInTheDocument();
});

// A focus refresh must join an in-flight canonical GET, or it leaves a confirmed answer pending.
it('returningToThePageDoesNotCancelAnInFlightCanonicalAnswerRead', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/sessions/:id', async () => {
      reads++;
      if (reads === 1) return json(activeSession);
      entered.resolve();
      await release.promise;
      return json(answeredSession);
    }),
    http.post('*/api/student/learning/sessions/:id/answers', () => HttpResponse.json(answerResult)),
  );
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'O · 사실' }));
  await entered.promise;
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await act(async () => {
    release.resolve();
  });
  expect(await screen.findByRole('heading', { name: '정답이에요' })).toBeVisible();
  await waitFor(() => expect(screen.queryByText('답변을 확인하고 있어요')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: '같은 답변 다시 확인' })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(readPendingCommand('student-a')).toBeNull();
});

// Known version/key conflicts must offer deliberate GET/home recovery rather than auto-posting.
it.each(['CONTENT_VERSION_MISMATCH', 'IDEMPOTENCY_KEY_REUSED'])(
  'versionAndKeyConflictsOfferExplicitReloadAndHomeRecovery: %s',
  async (code) => {
    let posts = 0;
    server.use(
      http.post('*/api/student/learning/sessions/:id/answers', () => {
        posts++;
        return HttpResponse.json(
          { code, message: '최신 상태를 다시 확인해 주세요.', fieldErrors: {} },
          { status: 409 },
        );
      }),
    );
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'O · 사실' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('최신 상태를 다시 확인해 주세요.');
    expect(screen.getByRole('button', { name: '최신 상태 다시 불러오기' })).toBeEnabled();
    expect(screen.getAllByRole('link', { name: '학습 홈으로' })[0]).toHaveAttribute(
      'href',
      '/student/learning',
    );
    expect(posts).toBe(1);
  },
);

// A conflict in a stored START should expose the server's other active session.
it('sessionConflictOffersTheCanonicalActiveSessionRecoveryLink', async () => {
  const other = '44444444-4444-4444-8444-444444444444';
  let conflict = false;
  writePendingCommand('student-a', {
    kind: 'START',
    command: { requestId, mode: 'FIRST', dayNumber: 1, questionIds: null },
  });
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({
        ...learningStatus,
        activeSession: conflict ? { ...activeSession, sessionId: other } : activeSession,
      }),
    ),
    http.get('*/api/student/learning/sessions/:id', ({ params }) =>
      params.id === other ? HttpResponse.error() : json(activeSession),
    ),
    http.post('*/api/student/learning/sessions', () => {
      conflict = true;
      return HttpResponse.json(
        { code: 'SESSION_CONFLICT', message: '진행 중인 학습이 있어요.', fieldErrors: {} },
        { status: 409 },
      );
    }),
  );
  setup();
  await userEvent.click(await screen.findByRole('button', { name: '같은 학습 시작 다시 확인' }));
  expect(await screen.findByRole('link', { name: '진행 중인 학습 이어풀기' })).toHaveAttribute(
    'href',
    `/student/learning/sessions/${other}`,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('연결을 확인하고 다시 시도해 주세요.');
  expect(readPendingCommand('student-a')?.kind).toBe('START');
});

// 404 is a safe empty state, and pending GET has an explicit loading state.
it('missingSessionOffersASafeHomeLink', async () => {
  const release = deferred<void>();
  server.use(
    http.get('*/api/student/learning/sessions/:id', async () => {
      await release.promise;
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: '학습을 찾을 수 없어요.', fieldErrors: {} },
        { status: 404 },
      );
    }),
  );
  setup();
  expect(screen.getByRole('status')).toHaveTextContent('학습을 불러오고 있어요');
  await act(async () => {
    release.resolve();
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('학습을 찾을 수 없어요.');
  expect(screen.getByRole('link', { name: '학습 홈으로' })).toHaveAttribute(
    'href',
    '/student/learning',
  );
});
