import { beforeEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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

it('exploration shows the map without learning actions or round cards', async () => {
  let starts = 0;
  server.use(
    http.post('*/api/student/learning/sessions', () => {
      starts++;
      return HttpResponse.json(activeSession);
    }),
  );
  renderMap();
  expect(await screen.findByRole('region', { name: '탐험 경로' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '다음 배움' })).toBeNull();
  expect(screen.queryByRole('list', { name: '회차별 학습' })).toBeNull();
  expect(screen.queryByRole('link', { name: '이어풀기' })).toBeNull();
  expect(screen.queryByRole('button', { name: /시작하기|도전하기/ })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '현재 위치로 돌아가기' }));
  expect(starts).toBe(0);
});
it('lighthouse position does not imply all rounds passed', async () => {
  server.use(
    http.get('*/api/student/learning/map', () =>
      HttpResponse.json({ ...journeyView, journeyPosition: 150, courseCompleted: false }),
    ),
  );
  renderMap();
  expect(
    await screen.findByText('등대에 도착했어요. 아직 통과하지 못한 회차에 다시 도전해요.'),
  ).toBeVisible();
  expect(screen.queryByText('30회차 학습을 모두 마쳤어요.')).toBeNull();
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

it('map read failures can be retried without a learning command', async () => {
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/map', () =>
      ++reads === 1
        ? HttpResponse.json({ message: '지도를 다시 불러와 주세요.' }, { status: 503 })
        : HttpResponse.json(journeyView),
    ),
  );
  renderMap();
  await userEvent.click(await screen.findByRole('button', { name: '지도 다시 불러오기' }));
  expect(await screen.findByRole('region', { name: '탐험 경로' })).toBeVisible();
});
