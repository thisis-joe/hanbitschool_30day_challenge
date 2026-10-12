import { afterEach, beforeEach, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderPage } from '../../test/render';
import { server, student } from '../../test/server';
import { activeSession, learningStatus, requestId, sessionId } from '../../test/learningFixtures';
import { clearAllPendingCommands, writePendingCommand } from './pendingCommands';
import type { LearningStatus } from './types';
import { LearningDashboardPage } from './LearningDashboardPage';

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
