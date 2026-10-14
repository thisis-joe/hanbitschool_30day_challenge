import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderPage } from '../../test/render';
import { server, student } from '../../test/server';
import {
  activeSession,
  deferred,
  learningStatus,
  requestId,
  sessionId,
} from '../../test/learningFixtures';
import { useAcceptAccount } from '../auth/queries';
import * as learningApi from './api';
import { clearAllPendingCommands, writePendingCommand } from './pendingCommands';
import type { LearningStatus } from './types';
import { LearningDashboardPage } from './LearningDashboardPage';
import { gameView, journeyView } from '../../test/gameFixtures';

const ready: LearningStatus = { ...learningStatus, activeSession: null, nextAction: 'START_FIRST' };
beforeEach(() => server.use(http.get('*/api/auth/me', () => HttpResponse.json(student))));
afterEach(() => clearAllPendingCommands());
function renderHome() {
  return renderPage(
    <Routes>
      <Route path="/student/learning" element={<LearningDashboardPage />} />
      <Route path="/student/learning/sessions/:sessionId" element={<p>실제 세션 화면</p>} />
    </Routes>,
    '/student/learning',
  );
}

// The camp must expose canonical learning action and six real regions, not local demo progress.
it('homeUsesAReferenceWithCanonicalNextAction', async () => {
  server.use(http.get('*/api/student/learning/status', () => HttpResponse.json(ready)));
  renderHome();
  const camp = await screen.findByRole('region', { name: '오늘의 탐험' });
  expect(await within(camp).findByRole('button', { name: '오늘 학습 시작' })).toBeEnabled();
  expect(within(camp).getByRole('link', { name: '탐험 지도' })).toHaveAttribute(
    'href',
    '/student/map',
  );
  expect(screen.getByRole('navigation', { name: '여행 지역' })).toHaveTextContent('숲 입구');
  expect(screen.getByRole('navigation', { name: '여행 지역' })).toHaveTextContent('작은 섬');
});

// A fallback portrait must not imply a saved choice or gate a real start.
it.each([null, 'bora'] as const)(
  'homeGuidesOnlyUnselectedCharacter%sWithoutSaving',
  async (characterId) => {
    let puts = 0;
    server.use(
      http.get('*/api/student/learning/status', () => HttpResponse.json(ready)),
      http.get('*/api/student/game', () => HttpResponse.json({ ...gameView, characterId })),
      http.put('*/api/student/game/appearance', () => {
        puts++;
        return HttpResponse.json(gameView);
      }),
    );
    renderHome();
    expect(
      await screen.findByRole('img', { name: characterId ? '보라' : /캐릭터 미선택/ }),
    ).toBeVisible();
    if (characterId === null) {
      expect(screen.getByText('아직 여행 친구를 선택하지 않았어요.')).toBeVisible();
      expect(screen.getByRole('link', { name: '캐릭터 선택하기' })).toHaveAttribute(
        'href',
        '/student/character',
      );
    } else {
      expect(screen.queryByRole('link', { name: '캐릭터 선택하기' })).toBeNull();
    }
    expect(screen.getByRole('button', { name: '오늘 학습 시작' })).toBeEnabled();
    expect(puts).toBe(0);
  },
);

// Cosmetic failures have GET-only recovery and never lock canonical learning actions.
it.each(['game', 'journey'] as const)(
  'homeRecoversFailed%sReadWhileStartRemainsUsable',
  async (read) => {
    let reads = 0;
    let puts = 0;
    server.use(
      http.get('*/api/student/learning/status', () => HttpResponse.json(ready)),
      http.get(read === 'game' ? '*/api/student/game' : '*/api/student/learning/map', () => {
        reads++;
        return reads === 1
          ? HttpResponse.error()
          : HttpResponse.json(read === 'game' ? gameView : journeyView);
      }),
      http.put('*/api/student/game/appearance', () => {
        puts++;
        return HttpResponse.json(gameView);
      }),
      http.post('*/api/student/learning/sessions', () => HttpResponse.json(activeSession)),
      http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(activeSession)),
    );
    renderHome();
    const retry = await screen.findByRole('button', {
      name: read === 'game' ? '여행 친구 다시 불러오기' : '지도 다시 불러오기',
    });
    expect(screen.getByRole('button', { name: '오늘 학습 시작' })).toBeEnabled();
    if (read === 'game') expect(screen.queryByText('여행 친구를 불러오고 있어요.')).toBeNull();
    await userEvent.click(retry);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: retry.textContent! })).toBeNull(),
    );
    expect(reads).toBe(2);
    expect(puts).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: '오늘 학습 시작' }));
    expect(await screen.findByText('실제 세션 화면')).toBeVisible();
  },
);

it.each(['FIRST', 'REVIEW'] as const)(
  'homeKeeps%sContinueWhenBothCosmeticReadsFail',
  async (mode) => {
    server.use(
      http.get('*/api/student/learning/status', () =>
        HttpResponse.json({
          ...learningStatus,
          activeSession: { ...learningStatus.activeSession!, mode },
        }),
      ),
      http.get('*/api/student/game', () => HttpResponse.error()),
      http.get('*/api/student/learning/map', () => HttpResponse.error()),
    );
    renderHome();
    await screen.findByRole('button', { name: '여행 친구 다시 불러오기' });
    expect(screen.getByRole('link', { name: '이어풀기' })).toHaveAttribute(
      'href',
      `/student/learning/sessions/${sessionId}`,
    );
  },
);

it('homeStartsWhileBothCosmeticReadsRemainPending', async () => {
  const release = deferred<void>();
  server.use(
    http.get('*/api/student/learning/status', () => HttpResponse.json(ready)),
    http.get('*/api/student/game', async () => {
      await release.promise;
      return HttpResponse.json(gameView);
    }),
    http.get('*/api/student/learning/map', async () => {
      await release.promise;
      return HttpResponse.json(journeyView);
    }),
    http.post('*/api/student/learning/sessions', () => HttpResponse.json(activeSession)),
    http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(activeSession)),
  );
  renderHome();
  try {
    await userEvent.click(await screen.findByRole('button', { name: '오늘 학습 시작' }));
    expect(await screen.findByText('실제 세션 화면')).toBeVisible();
  } finally {
    release.resolve();
  }
});

// A wrong nextAction branch would hide the required action or allow a locked start.
it.each([
  ['WAIT_FOR_START_DATE', '학습 시작일을 기다리고 있어요.'],
  ['WAIT_FOR_NEXT_DAY', '다음 회차는 다음 학습 날짜에 열려요.'],
  ['COURSE_COMPLETE', '30회차 학습을 모두 마쳤어요.'],
] as const)('homeHandles%sWithoutStarting', async (nextAction, message) => {
  server.use(
    http.get('*/api/student/learning/status', () => HttpResponse.json({ ...ready, nextAction })),
  );
  renderHome();
  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.queryByRole('button', { name: /오늘 학습 시작|다시 도전하기/ })).toBeNull();
});
it.each([
  ['START_FIRST', '오늘 학습 시작', 'FIRST'],
  ['START_REPLAY', '다시 도전하기', 'REPLAY'],
] as const)('homeStartsCanonical%sTarget', async (nextAction, label, mode) => {
  let command: unknown;
  server.use(
    http.get('*/api/student/learning/status', () => HttpResponse.json({ ...ready, nextAction })),
    http.post('*/api/student/learning/sessions', async ({ request }) => {
      command = await request.json();
      return HttpResponse.json(activeSession);
    }),
    http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(activeSession)),
  );
  renderHome();
  await userEvent.click(await screen.findByRole('button', { name: label }));
  expect(await screen.findByText('실제 세션 화면')).toBeVisible();
  expect(command).toMatchObject({
    mode,
    dayNumber: 1,
    questionIds: null,
    requestId: expect.any(String),
  });
});
it('homeContinueUsesActualSessionId', async () => {
  server.use(http.get('*/api/student/learning/status', () => HttpResponse.json(learningStatus)));
  renderHome();
  expect(await screen.findByRole('link', { name: '이어풀기' })).toHaveAttribute(
    'href',
    `/student/learning/sessions/${sessionId}`,
  );
});
it('thirtyDayCardsDistinguishPassedSequenceAndDateLocks', async () => {
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({
        ...ready,
        calendarCap: 3,
        passedDayCount: 1,
        earliestUnpassedDay: 2,
      }),
    ),
  );
  renderHome();
  const list = await screen.findByRole('list', { name: '회차별 학습' });
  const cards = within(list).getAllByRole('listitem');
  expect(cards).toHaveLength(30);
  expect(within(cards[0]).getByRole('button', { name: /1회차.*다시 풀기/ })).toBeEnabled();
  expect(within(cards[1]).getByRole('button', { name: /2회차.*시작하기/ })).toBeEnabled();
  expect(within(cards[2]).getByText('이전 회차를 먼저 통과해 주세요')).toBeVisible();
  expect(within(cards[2]).getByRole('button')).toBeDisabled();
  expect(within(cards[3]).getByText('학습 날짜를 기다려 주세요')).toBeVisible();
  expect(within(cards[29]).getByRole('button')).toBeDisabled();
});
it('activeSessionBlocksStartingAnotherTarget', async () => {
  let starts = 0;
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({ ...learningStatus, passedDayCount: 2, calendarCap: 4 }),
    ),
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return HttpResponse.json(activeSession);
    }),
  );
  renderHome();
  const list = await screen.findByRole('list', { name: '회차별 학습' });
  for (const button of within(list).getAllByRole('button')) expect(button).toBeDisabled();
  await userEvent.click(within(list).getAllByRole('button')[0]);
  expect(starts).toBe(0);
  expect(screen.getByRole('link', { name: '이어풀기' })).toHaveAttribute(
    'href',
    `/student/learning/sessions/${sessionId}`,
  );
});
it('freshActiveSessionPreventsStaleHomeStart', async () => {
  let reads = 0;
  let starts = 0;
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json(++reads === 1 ? ready : learningStatus),
    ),
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return HttpResponse.json(activeSession);
    }),
  );
  renderHome();
  await userEvent.click(await screen.findByRole('button', { name: '오늘 학습 시작' }));
  expect(await screen.findByText('실제 세션 화면')).toBeVisible();
  expect(starts).toBe(0);
});
it('homeOffersSamePendingStartRetryAfterReload', async () => {
  const command = { mode: 'FIRST' as const, dayNumber: 1, questionIds: null, requestId };
  writePendingCommand(student.accountId, { kind: 'START', command });
  let received: unknown;
  server.use(
    http.get('*/api/student/learning/status', () => HttpResponse.json(ready)),
    http.post('*/api/student/learning/sessions', async ({ request }) => {
      received = await request.json();
      return HttpResponse.json(activeSession);
    }),
    http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(activeSession)),
  );
  renderHome();
  await userEvent.click(await screen.findByRole('button', { name: '같은 요청 다시 확인' }));
  expect(await screen.findByText('실제 세션 화면')).toBeVisible();
  expect(received).toEqual(command);
});
it('homeShowsLoadingAndRetryableReadError', async () => {
  server.use(http.get('*/api/student/learning/status', () => HttpResponse.error()));
  renderHome();
  expect(screen.getByRole('status')).toHaveTextContent('불러오고');
  expect(await screen.findByRole('alert')).toHaveTextContent('연결');
  server.use(http.get('*/api/student/learning/status', () => HttpResponse.json(ready)));
  await userEvent.click(screen.getByRole('button', { name: '최신 상태 다시 불러오기' }));
  expect(await screen.findByRole('button', { name: '오늘 학습 시작' })).toBeEnabled();
});

// Using passed-day progress or a local answer counter would display a different value than 47.
it('homeShowsServerFirstAnswerProgressWithoutDerivingFromPassedDays', async () => {
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({
        ...ready,
        calendarCap: 10,
        earliestUnpassedDay: 9,
        passedDayCount: 8,
        firstAnswerCount: 47,
        totalXp: 286,
        level: 3,
      }),
    ),
  );
  renderHome();
  const metric = (await screen.findByText('첫 답변한 문항')).parentElement!;
  expect(within(metric).getByText('47 / 150')).toBeVisible();
  expect(screen.getByText('8 / 30')).toBeVisible();
});

// An A-owned checking flag that survives cleanup blocks the returning A's start/retry controls.
it.each(['start', 'retry'] as const)(
  'returningStudentRecovers%sAfterDelayedStatusAccountCleanup',
  async (action) => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const handlerFinished = deferred<void>();
    const statusReads = vi.spyOn(learningApi, 'getLearningStatus');
    const studentB = {
      ...student,
      role: 'STUDENT' as const,
      accountId: 'student-b',
      nickname: '새친구',
    };
    const nextStatus: LearningStatus = {
      ...ready,
      calendarCap: 2,
      earliestUnpassedDay: 2,
      passedDayCount: 1,
      firstAnswerCount: 5,
    };
    const resumedSession = {
      ...activeSession,
      dayNumber: 2,
      question: { ...activeSession.question!, questionId: 6, dayNumber: 2 },
    };
    const retryCommand = { mode: 'FIRST' as const, dayNumber: 2, questionIds: null, requestId };
    let current = student;
    let switched = false;
    let aReads = 0;
    const commands: unknown[] = [];
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json(current)),
      http.get('*/api/student/learning/status', async () => {
        if (current.accountId === 'student-a' && ++aReads === 2 && !switched) {
          entered.resolve();
          await release.promise;
          handlerFinished.resolve();
          return HttpResponse.json(ready);
        }
        return HttpResponse.json(switched ? nextStatus : ready);
      }),
      http.post('*/api/student/learning/sessions', async ({ request }) => {
        commands.push(await request.json());
        return HttpResponse.json(resumedSession);
      }),
      http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(resumedSession)),
    );
    function AccountSwitch() {
      const accept = useAcceptAccount();
      return (
        <>
          <button
            onClick={() => {
              switched = true;
              current = studentB;
              void accept(studentB);
            }}
          >
            학생 B로 전환
          </button>
          <button
            onClick={() => {
              current = student;
              void accept({ ...student, role: 'STUDENT' }).then(() => {
                if (action === 'retry')
                  writePendingCommand(student.accountId, { kind: 'START', command: retryCommand });
              });
            }}
          >
            학생 A로 복귀
          </button>
        </>
      );
    }
    renderPage(
      <>
        <AccountSwitch />
        <Routes>
          <Route path="/student/learning" element={<LearningDashboardPage />} />
          <Route path="/student/learning/sessions/:sessionId" element={<p>실제 세션 화면</p>} />
        </Routes>
      </>,
      '/student/learning',
    );
    await userEvent.click(await screen.findByRole('button', { name: '오늘 학습 시작' }));
    await entered.promise;
    const oldRequest = statusReads.mock.results.at(-1)!.value as Promise<unknown>;
    expect(screen.getByRole('button', { name: '오늘 학습 시작' })).toBeDisabled();
    try {
      await userEvent.click(screen.getByRole('button', { name: '학생 B로 전환' }));
      expect(await screen.findByText('새친구의 배움')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: '학생 A로 복귀' }));
      expect(await screen.findByText('숲친구의 배움')).toBeVisible();
      const control = await screen.findByRole('button', {
        name: action === 'retry' ? '같은 요청 다시 확인' : '오늘 학습 시작',
      });
      await waitFor(() => expect(control).toBeEnabled());
      release.resolve();
      await handlerFinished.promise;
      await Promise.allSettled([oldRequest]);
      expect(commands).toEqual([]);
      expect(control).toBeEnabled();
      await userEvent.click(control);
      expect(await screen.findByText('실제 세션 화면')).toBeVisible();
      expect(commands).toEqual([
        { ...retryCommand, requestId: action === 'retry' ? requestId : expect.any(String) },
      ]);
    } finally {
      release.resolve();
    }
  },
);
