import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, student } from '../../test/server';
import {
  activeSession,
  answerResult,
  deferred,
  learningStatus,
  requestId,
  sessionId,
} from '../../test/learningFixtures';
import { meKey, useAcceptAccount, useCurrentAccount } from '../auth/queries';
import * as learningApi from './api';
import { LearningSessionPage } from './LearningSessionPage';
import { LearningResultPage } from './LearningResultPage';
import {
  clearAllPendingCommands,
  readPendingCommand,
  writePendingCommand,
} from './pendingCommands';
import { learningKeys } from './queries';
import type { LearningSessionView, LearningStatus } from './types';
import { gameView, journeyView } from '../../test/gameFixtures';
import { gameKeys } from '../game/queries';
import * as avatarRenderer from '../game/avatarRenderer';
import * as gameApi from '../game/api';

const reward = { itemId: 'face-1', dayNumber: 1, acquiredAt: '2026-10-13T00:00:00Z' };

// A gift preview must replace only its slot locally, leaving the saved cache and XP unchanged.
it.each([null, 'bora'] as const)(
  'savedGiftPreviewsOnCurrentCharacter%sBeforeExplicitSave',
  async (characterId) => {
    const renderAvatar = vi.spyOn(avatarRenderer, 'renderAvatar').mockResolvedValue(undefined);
    const release = deferred<void>();
    const saved = {
      ...gameView,
      characterId,
      equippedBySlot: { ...gameView.equippedBySlot, face: null, hat: 'hat-1' },
    };
    const bodies: unknown[] = [];
    server.use(
      http.get('*/api/student/learning/sessions/:id', () =>
        json({ ...completed, lastAnswer: { ...completed.lastAnswer!, rewardGranted: reward } }),
      ),
      http.get('*/api/student/game', () => HttpResponse.json(saved)),
      http.put('*/api/student/game/appearance', async ({ request }) => {
        bodies.push(await request.json());
        await release.promise;
        return HttpResponse.json({
          ...saved,
          revision: 8,
          equippedBySlot: { ...saved.equippedBySlot, face: 'face-1' },
        });
      }),
    );
    const { client } = setup();
    try {
      const preview = await screen.findByRole('region', { name: '선물 착용 미리보기' });
      expect(
        within(preview).getByText('미리보기예요. 지금 착용하기를 누르면 저장돼요.'),
      ).toBeVisible();
      const canvas = within(preview).getByRole('img', {
        name: characterId ? /보라/ : /캐릭터 미선택/,
      });
      await waitFor(() =>
        expect(renderAvatar).toHaveBeenCalledWith(
          canvas,
          characterId ?? 'haru',
          { face: 'face-1', hat: 'hat-1', top: null, bottom: null, shoes: null, hand: null },
          expect.any(AbortSignal),
        ),
      );
      expect(client.getQueryData(gameKeys.view(student.accountId))).toEqual(saved);
      expect(bodies).toEqual([]);
      expect(screen.getByText('301 XP')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: '지금 착용하기' }));
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(client.getQueryData(gameKeys.view(student.accountId))).toEqual(saved);
      expect(bodies[0]).toEqual({
        characterId,
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
      release.resolve();
      await waitFor(() =>
        expect(client.getQueryData(gameKeys.view(student.accountId))).toMatchObject({
          revision: 8,
          characterId,
          equippedBySlot: { face: 'face-1' },
        }),
      );
      expect(screen.getByText('301 XP')).toBeVisible();
    } finally {
      release.resolve();
      renderAvatar.mockRestore();
    }
  },
);

it.each(['game', 'journey'] as const)(
  'resultRecoversFailed%sReadWithoutWritingOrBlockingNextLearning',
  async (read) => {
    const cosmeticReads = vi.spyOn(gameApi, read === 'game' ? 'getGame' : 'getJourney');
    let reads = 0;
    let writes = 0;
    server.use(
      http.get('*/api/student/learning/sessions/:id', () =>
        json({ ...completed, lastAnswer: { ...completed.lastAnswer!, rewardGranted: reward } }),
      ),
      http.get('*/api/student/learning/status', () =>
        HttpResponse.json({ ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 }),
      ),
      http.get(read === 'game' ? '*/api/student/game' : '*/api/student/learning/map', () => {
        reads++;
        return HttpResponse.error();
      }),
      http.put('*/api/student/game/appearance', () => {
        writes++;
        return HttpResponse.json(gameView);
      }),
      http.post('*/api/student/learning/*', () => {
        writes++;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const { client } = setup();
    const retryName = read === 'game' ? '여행 친구 다시 불러오기' : '지도 다시 불러오기';
    await screen.findByRole('button', { name: retryName });
    // Restored lastAnswer cancels the initial cosmetic read and explicitly refetches it.
    await waitFor(() => {
      expect(cosmeticReads.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(
        client.getQueryState(
          read === 'game' ? gameKeys.view(student.accountId) : gameKeys.journey(student.accountId),
        ),
      ).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });
    expect(screen.getByRole('button', { name: '다음 회차 시작' })).toBeEnabled();
    if (read === 'game') {
      await screen.findByText('다시 불러오면 저장된 선물을 확인할 수 있어요.');
      expect(screen.queryByText('저장된 선물 정보를 불러오고 있어요.')).toBeNull();
    }
    const failedReads = reads;
    server.use(
      http.get(read === 'game' ? '*/api/student/game' : '*/api/student/learning/map', () => {
        reads++;
        return HttpResponse.json(
          read === 'game' ? gameView : { ...journeyView, journeyPosition: 5, firstAnswerCount: 5 },
        );
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: retryName })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: retryName }));
    await waitFor(() => expect(screen.queryByRole('button', { name: retryName })).toBeNull());
    expect(await screen.findByRole('region', { name: '선물 착용 미리보기' })).toBeVisible();
    expect(reads).toBeGreaterThan(failedReads);
    expect(writes).toBe(0);
    expect(screen.getByText('301 XP')).toBeVisible();
  },
);

it.each(['failed', 'held'] as const)(
  'resultStartsCanonicalNextDayWith%sCosmeticReads',
  async (cosmetics) => {
    const release = deferred<void>();
    const other = '44444444-4444-4444-8444-444444444444';
    const started = { ...activeSession, sessionId: other, dayNumber: 2 };
    let command: unknown;
    server.use(
      http.get('*/api/student/learning/status', () =>
        HttpResponse.json({ ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 }),
      ),
      http.get('*/api/student/game', async () => {
        if (cosmetics === 'held') await release.promise;
        return HttpResponse.error();
      }),
      http.get('*/api/student/learning/map', async () => {
        if (cosmetics === 'held') await release.promise;
        return HttpResponse.error();
      }),
      http.post('*/api/student/learning/sessions', async ({ request }) => {
        command = await request.json();
        return json(started);
      }),
      http.get(`*/api/student/learning/sessions/${other}`, () => json(started)),
    );
    setup();
    try {
      await userEvent.click(await screen.findByRole('button', { name: '다음 회차 시작' }));
      expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeEnabled();
      expect(command).toMatchObject({ mode: 'FIRST', dayNumber: 2, questionIds: null });
    } finally {
      release.resolve();
    }
  },
);

it.each(['FIRST', 'REVIEW'] as const)(
  'resultContinuesCanonical%sSessionWithFailedCosmetics',
  async (mode) => {
    const other = '44444444-4444-4444-8444-444444444444';
    let starts = 0;
    const active = {
      ...activeSession,
      sessionId: other,
      mode,
      dayNumber: mode === 'REVIEW' ? null : 1,
    };
    server.use(
      http.get('*/api/student/learning/status', () =>
        HttpResponse.json({
          ...finishedStatus,
          nextAction: 'CONTINUE_SESSION',
          activeSession: { sessionId: other, mode, dayNumber: active.dayNumber },
        }),
      ),
      http.get('*/api/student/game', () => HttpResponse.error()),
      http.get('*/api/student/learning/map', () => HttpResponse.error()),
      http.post('*/api/student/learning/sessions', () => {
        starts++;
        return json(active);
      }),
      http.get(`*/api/student/learning/sessions/${other}`, () => json(active)),
    );
    setup();
    await screen.findByRole('button', { name: '여행 친구 다시 불러오기' });
    await userEvent.click(screen.getByRole('button', { name: '이어풀기' }));
    expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeEnabled();
    expect(starts).toBe(0);
  },
);

it('fifthFeedbackLeavesWithoutFinishAndRestoresGift', async () => {
  const writes: string[] = [];
  const saved = { ...completed, lastAnswer: { ...completed.lastAnswer!, rewardGranted: reward } };
  server.use(
    http.get('*/api/student/learning/sessions/:id', () => json(saved)),
    http.post('*/api/student/learning/*', ({ request }) => {
      writes.push(request.url);
      return new HttpResponse(null, { status: 500 });
    }),
  );
  const first = setup(`/student/learning/sessions/${sessionId}`);
  await userEvent.click(await screen.findByRole('link', { name: '학습 홈으로' }));
  first.unmount();
  setup();
  expect(await screen.findByText('새 선물')).toBeVisible();
  expect(await screen.findByRole('heading', { name: '동그란 안경' })).toBeVisible();
  expect(screen.getByRole('img', { name: '동그란 안경' })).toBeVisible();
  expect(screen.getByText('301 XP')).toBeVisible();
  expect(writes).toEqual([]);
});

it.each([
  { name: 'wearSavedRewardUsesOwnedAppearanceMutationOnly', characterId: 'haru' as const },
  { name: 'wearRewardKeepsUnselectedCharacterNull', characterId: null },
])('$name', async ({ characterId }) => {
  const bodies: unknown[] = [];
  const writes: string[] = [];
  const appearance = {
    ...gameView,
    characterId,
    equippedBySlot: { ...gameView.equippedBySlot, face: null, hat: 'hat-1' },
  };
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json({ ...completed, lastAnswer: { ...completed.lastAnswer!, rewardGranted: reward } }),
    ),
    http.get('*/api/student/game', () => HttpResponse.json(appearance)),
    http.put('*/api/student/game/appearance', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({
        ...appearance,
        revision: 8,
        equippedBySlot: { ...appearance.equippedBySlot, face: 'face-1' },
      });
    }),
    http.post('*/api/student/learning/*', ({ request }) => {
      writes.push(request.url);
      return new HttpResponse(null, { status: 500 });
    }),
  );
  setup();
  const wear = await screen.findByRole('button', { name: '지금 착용하기' });
  await userEvent.dblClick(wear);
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]).toEqual({
    characterId,
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
  expect(screen.getByText('301 XP')).toBeVisible();
  expect(writes).toEqual([]);
});

it('legacySavedResultWithoutRewardStillRestores', async () => {
  setup();
  expect(await screen.findByRole('heading', { name: '회차 통과' })).toBeVisible();
  expect(screen.queryByText('새 선물')).toBeNull();
  expect(screen.queryByRole('button', { name: '지금 착용하기' })).toBeNull();
  expect(screen.queryByRole('region', { name: '선물 착용 미리보기' })).toBeNull();
  expect(screen.getByText('301 XP')).toBeVisible();
});

const completed: LearningSessionView = {
  ...activeSession,
  state: 'COMPLETED',
  answeredCount: 5,
  question: { ...activeSession.question!, questionId: 5, position: 5 },
  lastAnswer: {
    ...answerResult,
    questionId: 5,
    attemptCorrectCount: 3,
    attemptAnsweredCount: 5,
    attemptState: 'PASSED',
    dayState: 'PASSED',
    totalXp: 301,
    level: 2,
  },
};
const finishedStatus: LearningStatus = {
  ...learningStatus,
  activeSession: null,
  nextAction: 'WAIT_FOR_NEXT_DAY',
  earliestUnpassedDay: 2,
  passedDayCount: 1,
  firstAnswerCount: 5,
  totalXp: 301,
  level: 2,
};
const json = (view: LearningSessionView) =>
  HttpResponse.json(view, { headers: { Date: 'Tue, 13 Oct 2026 00:00:00 GMT' } });

function setup(
  path = `/student/learning/sessions/${sessionId}/result`,
  cachedStatus?: LearningStatus,
  controls?: ReactNode,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(meKey, student);
  if (cachedStatus) client.setQueryData(learningKeys.status('student-a'), cachedStatus);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          {controls}
          <Routes>
            <Route path="/student/learning/sessions/:sessionId" element={<LearningSessionPage />} />
            <Route
              path="/student/learning/sessions/:sessionId/result"
              element={<LearningResultPage />}
            />
            <Route path="/student/learning" element={<h1>학습 홈</h1>} />
            <Route path="/student/questions" element={<h1>나의 문제</h1>} />
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
    http.get('*/api/student/learning/status', () => HttpResponse.json(finishedStatus)),
    http.get('*/api/student/learning/sessions/:id', () => json(completed)),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  clearAllPendingCommands();
});

// Resetting only by account ID strands returning A's next/retry controls in the old check.
it.each(['next', 'retry'] as const)(
  'returningAccountCanUse%sAfterACanceledResultStatusRead',
  async (action) => {
    const oldEntered = deferred<void>();
    const oldRelease = deferred<void>();
    const newerEntered = deferred<void>();
    const newerRelease = deferred<void>();
    const statusReads = vi.spyOn(learningApi, 'getLearningStatus');
    const nextStatus: LearningStatus = {
      ...finishedStatus,
      nextAction: 'START_FIRST',
      calendarCap: 2,
    };
    const studentA = { ...student, role: 'STUDENT' as const };
    const studentB = { ...studentA, accountId: 'student-b' };
    const command = { requestId, mode: 'FIRST' as const, dayNumber: 2, questionIds: null };
    const commands: unknown[] = [];
    let current = studentA;
    let aReads = 0;
    let holdNewer = false;
    let started = false;
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json(current)),
      http.get('*/api/student/learning/status', async () => {
        if (current.accountId === 'student-a') {
          if (++aReads === 2) {
            oldEntered.resolve();
            await oldRelease.promise;
          } else if (holdNewer) {
            holdNewer = false;
            newerEntered.resolve();
            await newerRelease.promise;
          }
        }
        return HttpResponse.json(nextStatus);
      }),
      http.get('*/api/student/learning/sessions/:id', () =>
        json(started ? activeSession : completed),
      ),
      http.post('*/api/student/learning/sessions', async ({ request }) => {
        commands.push(await request.json());
        started = true;
        return json(activeSession);
      }),
    );
    function SwitchAccount() {
      const accept = useAcceptAccount();
      const account = useCurrentAccount();
      return (
        <>
          <p>{account.data?.accountId}</p>
          <button
            onClick={() => {
              current = studentB;
              void accept(studentB);
            }}
          >
            학생 B로 전환
          </button>
          <button
            onClick={() => {
              current = studentA;
              void accept(studentA).then(() => {
                if (action === 'retry')
                  writePendingCommand(student.accountId, { kind: 'START', command });
              });
            }}
          >
            학생 A로 복귀
          </button>
        </>
      );
    }
    setup(undefined, undefined, <SwitchAccount />);
    await userEvent.click(await screen.findByRole('button', { name: '다음 회차 시작' }));
    await oldEntered.promise;
    const oldRead = statusReads.mock.results.at(-1)!.value as Promise<unknown>;
    try {
      await userEvent.click(screen.getByRole('button', { name: '학생 B로 전환' }));
      await screen.findByText('student-b');
      await userEvent.click(screen.getByRole('button', { name: '학생 A로 복귀' }));
      await screen.findByText('student-a');
      expect(commands).toEqual([]);
      const control = await screen.findByRole('button', {
        name: action === 'retry' ? '같은 학습 시작 다시 확인' : '다음 회차 시작',
      });
      await waitFor(() => expect(control).toBeEnabled());
      if (action === 'next') {
        holdNewer = true;
        await userEvent.click(control);
        await newerEntered.promise;
      }
      await act(async () => {
        oldRelease.resolve();
        await Promise.allSettled([oldRead]);
      });
      expect(commands).toEqual([]);
      if (action === 'next') {
        expect(control).toBeDisabled();
        expect(screen.getByText('다음 학습을 확인하고 있어요')).toBeVisible();
        newerRelease.resolve();
      } else {
        expect(control).toBeEnabled();
        expect(screen.queryByText('다음 학습을 확인하고 있어요')).toBeNull();
        await userEvent.click(control);
      }
      expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeVisible();
      expect(commands).toEqual([
        { ...command, requestId: action === 'retry' ? requestId : expect.any(String) },
      ]);
    } finally {
      oldRelease.resolve();
      newerRelease.resolve();
    }
  },
);

// Even after returning to A, an old request's finalizer cannot unlock A's newer status check.
it('oldResultOperationFinalizerCannotUnlockANewerCheckForTheReturningOwner', async () => {
  const releaseOldBody = deferred<void>();
  const newerEntered = deferred<void>();
  const releaseNewer = deferred<void>();
  const studentA = { ...student, role: 'STUDENT' as const };
  const studentB = { ...studentA, accountId: 'student-b' };
  const ready: LearningStatus = { ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 };
  let current = studentA;
  let holdNewer = false;
  let posts = 0;
  let oldResponse: Response | undefined;
  let oldSignal: AbortSignal | undefined;
  const starts = vi.spyOn(learningApi, 'startLearningSession');
  const upstream = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    init?.signal?.throwIfAborted();
    if (input === '/api/student/learning/sessions' && init?.method === 'POST') {
      posts++;
      if (posts === 1) {
        oldSignal = init.signal!;
        oldResponse = new Response(
          new ReadableStream({
            start(controller) {
              oldSignal!.addEventListener(
                'abort',
                () => {
                  void releaseOldBody.promise.then(() =>
                    controller.error(new DOMException('Aborted', 'AbortError')),
                  );
                },
                { once: true },
              );
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
        return oldResponse;
      }
    }
    return upstream(input, init);
  });
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(current)),
    http.get('*/api/student/learning/status', async () => {
      if (holdNewer) {
        holdNewer = false;
        newerEntered.resolve();
        await releaseNewer.promise;
        return HttpResponse.json(finishedStatus);
      }
      return HttpResponse.json(ready);
    }),
  );
  function SwitchAccount() {
    const accept = useAcceptAccount();
    const account = useCurrentAccount();
    return (
      <>
        <p>{account.data?.accountId}</p>
        <button
          onClick={() => {
            current = studentB;
            void accept(studentB);
          }}
        >
          학생 B로 전환
        </button>
        <button
          onClick={() => {
            current = studentA;
            void accept(studentA);
          }}
        >
          학생 A로 복귀
        </button>
      </>
    );
  }
  setup(undefined, undefined, <SwitchAccount />);
  await userEvent.click(await screen.findByRole('button', { name: '다음 회차 시작' }));
  await waitFor(() => expect(oldResponse?.bodyUsed).toBe(true));
  const oldStart = starts.mock.results[0].value as Promise<unknown>;
  try {
    await userEvent.click(screen.getByRole('button', { name: '학생 B로 전환' }));
    await screen.findByText('student-b');
    expect(oldSignal?.aborted).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: '학생 A로 복귀' }));
    await screen.findByText('student-a');
    const next = await screen.findByRole('button', { name: '다음 회차 시작' });
    await waitFor(() => expect(next).toBeEnabled());
    holdNewer = true;
    await userEvent.click(next);
    await newerEntered.promise;
    await act(async () => {
      releaseOldBody.resolve();
      await Promise.allSettled([oldStart]);
    });
    expect(next).toBeDisabled();
    expect(screen.getByText('다음 학습을 확인하고 있어요')).toBeVisible();
    expect(screen.getByRole('heading', { name: '회차 통과' })).toBeVisible();
    expect(posts).toBe(1);
    releaseNewer.resolve();
    expect(await screen.findByText('다음 회차는 다음 학습 날짜에 열려요.')).toBeVisible();
    expect(screen.queryByText('다음 학습을 확인하고 있어요')).toBeNull();
    expect(readPendingCommand(studentA.accountId)).toBeNull();
    expect(posts).toBe(1);
  } finally {
    releaseOldBody.resolve();
    releaseNewer.resolve();
  }
});

// Finish is navigation: a complete GET restores the result without another save request.
it('completedSessionRestoresWithoutAFinishMutation', async () => {
  let writes = 0;
  server.use(
    http.post('*/api/student/learning/*', () => {
      writes++;
      return HttpResponse.json({});
    }),
  );
  const page = setup(`/student/learning/sessions/${sessionId}`);
  expect(await screen.findByRole('heading', { name: '정답이에요' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '다음 문제' })).not.toBeInTheDocument();
  const finish = screen.getByRole('link', { name: '완료하기' });
  expect(finish).toHaveAttribute('href', `/student/learning/sessions/${sessionId}/result`);
  await userEvent.click(finish);
  expect(await screen.findByRole('heading', { name: '회차 통과' })).toHaveFocus();
  expect(screen.getByText('3 / 5')).toBeVisible();
  expect(screen.getByText('301 XP')).toBeVisible();
  expect(screen.getByText('레벨 2')).toBeVisible();
  expect(screen.queryByText(/이번 학습.*XP/)).not.toBeInTheDocument();
  page.unmount();
  setup();
  expect(await screen.findByRole('heading', { name: '회차 통과' })).toBeVisible();
  expect(screen.getByText('3 / 5')).toBeVisible();
  expect(writes).toBe(0);
});

// An unsuccessful replay cannot revoke the already-passed server day state.
it('passedReplayNeverDisplaysRevokedProgress', async () => {
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json({
        ...completed,
        mode: 'REPLAY',
        lastAnswer: {
          ...completed.lastAnswer!,
          attemptCorrectCount: 1,
          attemptState: 'RETRY_REQUIRED',
          dayState: 'PASSED',
        },
      }),
    ),
  );
  setup();
  expect(await screen.findByRole('heading', { name: '재학습 완료' })).toBeVisible();
  expect(screen.getByText('이 회차의 통과 상태는 그대로 유지돼요.')).toBeVisible();
  expect(screen.queryByText('다시 도전해요')).not.toBeInTheDocument();
});

// REVIEW null day/attempt fields do not imply every question has attained mastery.
it('reviewCompletionDoesNotClaimEveryQuestionIsMastered', async () => {
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json({
        ...completed,
        mode: 'REVIEW',
        dayNumber: null,
        lastAnswer: {
          ...completed.lastAnswer!,
          attemptState: null,
          dayState: null,
          attemptCorrectCount: 2,
        },
      }),
    ),
  );
  setup();
  expect(await screen.findByRole('heading', { name: '복습 풀이를 마쳤어요' })).toBeVisible();
  expect(screen.getByText('2 / 5')).toBeVisible();
  expect(screen.queryByText(/모든 문항.*완료|모두.*마스터|회차 통과/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '나의 문제 보기' })).toHaveAttribute(
    'href',
    '/student/questions?filter=REVIEW_QUEUE',
  );
});

// A FIRST/REPLAY failed attempt on an unpassed day must invite a complete replay.
it('retryRequiredResultStartsAllFiveQuestionsAsReplay', async () => {
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      json({
        ...completed,
        lastAnswer: {
          ...completed.lastAnswer!,
          attemptCorrectCount: 2,
          attemptState: 'RETRY_REQUIRED',
          dayState: 'RETRY_REQUIRED',
        },
      }),
    ),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({
        ...finishedStatus,
        nextAction: 'START_REPLAY',
        earliestUnpassedDay: 1,
        passedDayCount: 0,
      }),
    ),
  );
  const bodies: unknown[] = [];
  server.use(
    http.post('*/api/student/learning/sessions', async ({ request }) => {
      bodies.push(await request.json());
      return json(activeSession);
    }),
  );
  setup();
  expect(await screen.findByRole('heading', { name: '다시 도전해요' })).toBeVisible();
  await userEvent.click(await screen.findByRole('button', { name: '다시 도전하기' }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]).toMatchObject({ mode: 'REPLAY', dayNumber: 1, questionIds: null });
});

// An incomplete result URL must take the learner to the canonical current phase.
it('unfinishedResultRedirectsToCurrentSession', async () => {
  server.use(http.get('*/api/student/learning/sessions/:id', () => json(activeSession)));
  setup();
  expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '회차 통과' })).not.toBeInTheDocument();
});

// A stale result next-day flag cannot override a new status date cap.
it('nextActionUsesFreshStatusAndForbidsDateCapBypass', async () => {
  let current: LearningStatus = { ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 };
  let reads = 0;
  let starts = 0;
  server.use(
    http.get('*/api/student/learning/status', () => {
      reads++;
      return HttpResponse.json(current);
    }),
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return json(activeSession);
    }),
  );
  setup();
  await screen.findByRole('button', { name: '다음 회차 시작' });
  current = { ...current, nextAction: 'WAIT_FOR_NEXT_DAY', calendarCap: 1 };
  const previousReads = reads;
  await userEvent.click(screen.getByRole('button', { name: '다음 회차 시작' }));
  expect(await screen.findByText('다음 회차는 다음 학습 날짜에 열려요.')).toBeVisible();
  expect(reads).toBeGreaterThan(previousReads);
  expect(starts).toBe(0);
});

// Even inconsistent START_FIRST status must pass the explicit cap/sequence guard.
it('aStartActionCannotStartADayBeyondTheServerCalendarCap', async () => {
  const status = {
    ...finishedStatus,
    nextAction: 'START_FIRST' as const,
    calendarCap: 1,
    earliestUnpassedDay: 2,
  };
  server.use(http.get('*/api/student/learning/status', () => HttpResponse.json(status)));
  setup();
  await screen.findByRole('heading', { name: '회차 통과' });
  expect(screen.queryByRole('button', { name: '다음 회차 시작' })).not.toBeInTheDocument();
  expect(
    await screen.findByText('지금은 이 회차를 시작할 수 없어요. 학습 홈에서 확인해 주세요.'),
  ).toBeVisible();
});

// A fresh active session takes priority over creating another session from stale result UI.
it('nextActionRecoversANewActiveSessionInsteadOfStartingAnother', async () => {
  const other = '44444444-4444-4444-8444-444444444444';
  let status: LearningStatus = { ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 };
  let starts = 0;
  server.use(
    http.get('*/api/student/learning/status', () => HttpResponse.json(status)),
    http.get(`*/api/student/learning/sessions/${other}`, () =>
      json({
        ...activeSession,
        sessionId: other,
        question: { ...activeSession.question!, text: '진행 중인 다른 문항입니다.' },
      }),
    ),
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return json(activeSession);
    }),
  );
  setup();
  await screen.findByRole('button', { name: '다음 회차 시작' });
  status = {
    ...status,
    nextAction: 'CONTINUE_SESSION',
    activeSession: { ...activeSession, sessionId: other },
  };
  await userEvent.click(screen.getByRole('button', { name: '다음 회차 시작' }));
  expect(await screen.findByText('진행 중인 다른 문항입니다.')).toBeVisible();
  expect(starts).toBe(0);
});

// A lost start response must restore and retry the same command instead of using a new target.
it('resultReloadRestoresAndRetriesTheSameUncertainStart', async () => {
  writePendingCommand('student-a', {
    kind: 'START',
    command: { requestId, mode: 'FIRST', dayNumber: 2, questionIds: null },
  });
  const bodies: unknown[] = [];
  let session: LearningSessionView = completed;
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({ ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 }),
    ),
    http.get('*/api/student/learning/sessions/:id', () => json(session)),
    http.post('*/api/student/learning/sessions', async ({ request }) => {
      bodies.push(await request.json());
      session = { ...activeSession, dayNumber: 2 };
      return json(session);
    }),
  );
  setup();
  expect(await screen.findByRole('button', { name: '다음 회차 시작' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '같은 학습 시작 다시 확인' }));
  expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeVisible();
  expect(bodies).toEqual([{ requestId, mode: 'FIRST', dayNumber: 2, questionIds: null }]);
  expect(readPendingCommand('student-a')).toBeNull();
});

// A retained START must not block direct recovery to the active session from fresh conflict status.
it('resultConflictRecoveryLinkRemainsUsableWhenCanonicalReadFails', async () => {
  const other = '44444444-4444-4444-8444-444444444444';
  const pending = {
    kind: 'START' as const,
    command: { requestId, mode: 'FIRST' as const, dayNumber: 2, questionIds: null },
  };
  writePendingCommand('student-a', pending);
  let conflict = false;
  let otherReads = 0;
  const bodies: unknown[] = [];
  const otherSession = {
    ...activeSession,
    sessionId: other,
    question: { ...activeSession.question!, text: '복구할 활성 세션 문항입니다.' },
  };
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json(
        conflict
          ? { ...finishedStatus, nextAction: 'CONTINUE_SESSION', activeSession: otherSession }
          : finishedStatus,
      ),
    ),
    http.get('*/api/student/learning/sessions/:id', ({ params }) => {
      if (params.id !== other) return json(completed);
      otherReads++;
      return otherReads === 1 ? HttpResponse.error() : json(otherSession);
    }),
    http.post('*/api/student/learning/sessions', async ({ request }) => {
      bodies.push(await request.json());
      conflict = true;
      return HttpResponse.json(
        { code: 'SESSION_CONFLICT', message: '진행 중인 학습이 있어요.', fieldErrors: {} },
        { status: 409 },
      );
    }),
  );
  setup();
  await userEvent.click(await screen.findByRole('button', { name: '같은 학습 시작 다시 확인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('연결을 확인하고 다시 시도해 주세요.');
  expect(screen.getByRole('button', { name: '이어풀기' })).toBeDisabled();
  expect(readPendingCommand('student-a')).toEqual(pending);
  const recovery = screen.getByRole('link', { name: '진행 중인 학습 이어풀기' });
  expect(recovery).toHaveAttribute('href', `/student/learning/sessions/${other}`);
  await userEvent.click(recovery);
  expect(await screen.findByText('복구할 활성 세션 문항입니다.')).toBeVisible();
  expect(bodies).toEqual([pending.command]);
  expect(readPendingCommand('student-a')).toEqual(pending);
});

// A failed result GET after reload must not hide a persisted start's recovery control.
it('uncertainStartCanBeRetriedWhenTheReloadResultReadFails', async () => {
  writePendingCommand('student-a', {
    kind: 'START',
    command: { requestId, mode: 'FIRST', dayNumber: 2, questionIds: null },
  });
  let started = false;
  server.use(
    http.get('*/api/student/learning/sessions/:id', () =>
      started ? json(activeSession) : HttpResponse.error(),
    ),
    http.post('*/api/student/learning/sessions', () => {
      started = true;
      return json(activeSession);
    }),
  );
  setup();
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: '같은 학습 시작 다시 확인' }));
  expect(await screen.findByRole('button', { name: 'O · 사실' })).toBeVisible();
  expect(readPendingCommand('student-a')).toBeNull();
});

// A failed fresh status read cannot be swallowed into a start with a cached day.
it('failedNextActionStatusReadShowsAnErrorAndNeverStarts', async () => {
  let fail = false;
  let starts = 0;
  server.use(
    http.get('*/api/student/learning/status', () =>
      fail
        ? HttpResponse.error()
        : HttpResponse.json({ ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 }),
    ),
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return json(activeSession);
    }),
  );
  setup();
  await screen.findByRole('button', { name: '다음 회차 시작' });
  fail = true;
  await userEvent.click(screen.getByRole('button', { name: '다음 회차 시작' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('연결을 확인하고 다시 시도해 주세요.');
  expect(starts).toBe(0);
});

// Leaving during the pre-start status read must not start a timed session after navigation.
it('leavingTheResultDuringFreshStatusReadNeverStartsLearning', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let reads = 0;
  let starts = 0;
  server.use(
    http.get('*/api/student/learning/status', async () => {
      reads++;
      if (reads > 1) {
        entered.resolve();
        await release.promise;
      }
      return HttpResponse.json({ ...finishedStatus, nextAction: 'START_FIRST', calendarCap: 2 });
    }),
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return json(activeSession);
    }),
  );
  setup();
  await userEvent.click(await screen.findByRole('button', { name: '다음 회차 시작' }));
  await entered.promise;
  await userEvent.click(screen.getByRole('link', { name: '학습 홈으로' }));
  await act(async () => {
    release.resolve();
  });
  expect(starts).toBe(0);
  expect(screen.getByRole('heading', { name: '학습 홈' })).toBeVisible();
  expect(readPendingCommand('student-a')).toBeNull();
});

// Waiting and terminal actions remain honest without deriving dates from local time.
it.each([
  ['WAIT_FOR_START_DATE', '학습 시작일을 기다리고 있어요.'],
  ['WAIT_FOR_NEXT_DAY', '다음 회차는 다음 학습 날짜에 열려요.'],
  ['COURSE_COMPLETE', '30회차 학습을 모두 마쳤어요.'],
] as const)('resultDisplaysServerWaitingAndCompletionActions: %s', async (nextAction, message) => {
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({ ...finishedStatus, nextAction }),
    ),
  );
  setup();
  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.queryByRole('button', { name: '다음 회차 시작' })).not.toBeInTheDocument();
});
