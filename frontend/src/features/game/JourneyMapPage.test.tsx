import { beforeEach, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { renderPage } from '../../test/render';
import { server, student } from '../../test/server';
import { gameView, journeyView } from '../../test/gameFixtures';
import { activeSession, learningStatus } from '../../test/learningFixtures';
import { JourneyMapPage } from './JourneyMapPage';
import { JourneyMap } from './JourneyMap';

beforeEach(() =>
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/student/game', () => HttpResponse.json(gameView)),
    http.get('*/api/student/learning/map', () => HttpResponse.json(journeyView)),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({ ...learningStatus, activeSession: null, nextAction: 'START_FIRST' }),
    ),
  ),
);
function renderMap() {
  return renderPage(
    <Routes>
      <Route path="/student/map" element={<JourneyMapPage />} />
      <Route path="/student/learning/sessions/:id" element={<p>실제 세션 화면</p>} />
    </Routes>,
    '/student/map',
  );
}

// Combining date and sequence locks hides the server's actual prerequisite.
it('mapShowsLockedDateAndPreviousPassSeparately', async () => {
  server.use(
    http.get('*/api/student/learning/map', () =>
      HttpResponse.json({
        ...journeyView,
        days: [
          journeyView.days[0],
          { ...journeyView.days[0], dayNumber: 2, availability: 'LOCKED_PREVIOUS' },
          { ...journeyView.days[0], dayNumber: 3, availability: 'LOCKED_DATE' },
        ],
      }),
    ),
  );
  renderMap();
  const list = await screen.findByRole('list', { name: '회차별 학습' });
  expect(within(list).getByText('이전 회차를 먼저 통과해 주세요')).toBeVisible();
  expect(within(list).getByText('학습 날짜를 기다려 주세요')).toBeVisible();
  expect(within(list).getByRole('button', { name: '2회차 시작하기' })).toBeDisabled();
  expect(within(list).getByRole('button', { name: '3회차 시작하기' })).toBeDisabled();
});

// A FIRST command or guessed ID would lose the active REVIEW/day session.
it.each(['REVIEW', 'FIRST'] as const)(
  'mapContinueUsesReviewOrDayActiveSession %s',
  async (mode) => {
    let starts = 0;
    server.use(
      http.get('*/api/student/learning/status', () =>
        HttpResponse.json({
          ...learningStatus,
          activeSession: { ...activeSession, mode, dayNumber: mode === 'REVIEW' ? null : 1 },
        }),
      ),
      http.post('*/api/student/learning/sessions', () => {
        starts++;
        return HttpResponse.json(activeSession);
      }),
    );
    renderMap();
    await userEvent.click(await screen.findByRole('link', { name: '이어풀기' }));
    expect(await screen.findByText('실제 세션 화면')).toBeVisible();
    expect(starts).toBe(0);
  },
);

// Deriving completion from position150 incorrectly hides day30 retry.
it('lighthousePositionDoesNotClaimThirtyPasses', async () => {
  server.use(
    http.get('*/api/student/learning/map', () =>
      HttpResponse.json({
        ...journeyView,
        journeyPosition: 150,
        firstAnswerCount: 150,
        days: [{ ...journeyView.days[0], dayNumber: 30, state: 'RETRY_REQUIRED' }],
      }),
    ),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({
        ...learningStatus,
        activeSession: null,
        earliestUnpassedDay: 30,
        passedDayCount: 29,
        calendarCap: 30,
        nextAction: 'START_REPLAY',
      }),
    ),
  );
  renderMap();
  expect(await screen.findByRole('button', { name: '다시 도전하기' })).toBeEnabled();
  expect(screen.queryByText('30회차 학습을 모두 마쳤어요.')).toBeNull();
  expect(
    await screen.findByText('등대에 도착했어요. 아직 통과하지 못한 회차에 다시 도전해요.'),
  ).toBeVisible();
});

// Recentering must use the canonical first-answer position and respect motion preference.
it('recenterUsesTheCanonicalStepAndReducedMotion', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const scroll = vi.fn();
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scroll });
  try {
    renderPage(
      <JourneyMap journey={{ ...journeyView, journeyPosition: 47 }} appearance={undefined} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '현재 위치로 돌아가기' }));
    const position = scroll.mock.lastCall![0];
    expect(position.left).toBeCloseTo(529.5387);
    expect(position.top).toBeCloseTo(1854.72);
    expect(position.behavior).toBe('auto');
  } finally {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollTo', descriptor);
    else delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    vi.unstubAllGlobals();
  }
});

// A stale map may advertise a day that has become date locked; no command may be written.
it('refreshesMapAvailabilityBeforeStarting', async () => {
  let reads = 0;
  let starts = 0;
  server.use(
    http.get('*/api/student/learning/map', () =>
      HttpResponse.json(
        ++reads === 1
          ? journeyView
          : { ...journeyView, days: [{ ...journeyView.days[0], availability: 'LOCKED_DATE' }] },
      ),
    ),
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return HttpResponse.json(activeSession);
    }),
  );
  renderMap();
  await screen.findByRole('list', { name: '회차별 학습' });
  await userEvent.click(screen.getByRole('button', { name: '1회차 시작하기' }));
  expect(await screen.findByText('학습 날짜를 기다려 주세요')).toBeVisible();
  expect(starts).toBe(0);
});
