import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { meKey, replaceAccountCache } from '../auth/queries';
import { student } from '../../test/server';
import { journeyView } from '../../test/gameFixtures';
import type { JourneyView } from './types';
import { JourneyMap } from './JourneyMap';

afterEach(() => vi.unstubAllGlobals());

function mapView(firstAvailable = 1): JourneyView {
  return {
    ...journeyView,
    days: Array.from({ length: 30 }, (_, i) => ({
      ...journeyView.days[0],
      dayNumber: i + 1,
      availability: i + 1 === firstAvailable ? 'AVAILABLE' : 'LOCKED_PREVIOUS',
    })),
  };
}
function mount(view = mapView(), owner = student.accountId) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(meKey, { ...student, accountId: owner });
  const ui = (next: JourneyView, nextOwner = owner, present = true) => (
    <QueryClientProvider client={client}>
      {present ? (
        <JourneyMap owner={nextOwner} journey={next} appearance={undefined} />
      ) : (
        <p>학습 중</p>
      )}
    </QueryClientProvider>
  );
  const result = render(ui(view));
  return {
    ...result,
    client,
    update: (next: JourneyView, nextOwner = owner, present = true) =>
      result.rerender(ui(next, nextOwner, present)),
  };
}
function terrain(day: number) {
  return document.querySelector(`[data-region-start="${day}"]`)!;
}

// A color cutoff tied to avatar progress conceals part of an available region and reveals failed progress.
it('colors the complete five-session terrain only from its first server-confirmed day', () => {
  const view = mapView();
  view.firstAnswerCount = 25;
  view.journeyPosition = 25;
  view.days[4] = { ...view.days[4], state: 'RETRY_REQUIRED', firstAnsweredCount: 5 };
  const { update } = mount(view);
  expect(terrain(1)).toHaveAttribute('data-revealed', 'true');
  expect(terrain(6)).toHaveAttribute('data-revealed', 'false');
  expect(screen.getByRole('link', { name: '7회차 살펴보기' })).toHaveClass('game-map-locked');
  update({
    ...view,
    days: view.days.map((day) =>
      day.dayNumber === 6 ? { ...day, availability: 'AVAILABLE' } : day,
    ),
  });
  expect(terrain(6)).toHaveAttribute('data-revealed', 'true');
  expect(terrain(11)).toHaveAttribute('data-revealed', 'false');
  expect(screen.getByRole('link', { name: '7회차 살펴보기' })).toHaveClass('game-map-locked');
});

// Equal height slices split the uneven original terrain and do not align the five-day route groups.
it('places all six terrain slices on the uneven route boundaries and labels their ranges', () => {
  mount();
  const expected = [
    [1, '77.6%', '22.4%', '1~5회차'],
    [6, '54.1%', '23.5%', '6~10회차'],
    [11, '35.4%', '18.7%', '11~15회차'],
    [16, '20%', '15.4%', '16~20회차'],
    [21, '10.46%', '9.54%', '21~25회차'],
    [26, '0%', '10.46%', '26~30회차'],
  ] as const;
  for (const [day, top, height, range] of expected) {
    expect(terrain(day)).toHaveStyle({ '--region-top': top, '--region-height': height });
    expect(screen.getByText(range)).toBeVisible();
  }
});

// Pre-start waits and the lighthouse avatar must not grant any terrain unlock.
it('conceals every region before start even at position150 and keeps completion independent', () => {
  const view = {
    ...mapView(0),
    calendarCap: 0,
    nextAction: 'WAIT_FOR_START_DATE' as const,
    firstAnswerCount: 150,
    journeyPosition: 150,
  };
  mount(view);
  for (const day of [1, 6, 11, 16, 21, 26])
    expect(terrain(day)).toHaveAttribute('data-revealed', 'false');
  expect(
    screen.getByText('등대에 도착했어요. 아직 통과하지 못한 회차에 다시 도전해요.'),
  ).toBeVisible();
});

// Day30 availability and first-answer progress cannot stand in for the final region's first day.
it('reveals the final region for a passed day26 despite a current date lock', () => {
  const view = mapView(30);
  const { update } = mount(view);
  expect(terrain(26)).toHaveAttribute('data-revealed', 'false');
  update({
    ...view,
    days: view.days.map((day) =>
      day.dayNumber === 26 ? { ...day, state: 'PASSED', availability: 'LOCKED_DATE' } : day,
    ),
  });
  expect(terrain(26)).toHaveAttribute('data-revealed', 'true');
});

// First observations are a baseline, not newly earned transitions.
it('does not animate initial available regions or unchanged refetch snapshots', () => {
  const view = mapView();
  const { update } = mount(view);
  expect(terrain(1)).not.toHaveClass('game-map-region-revealing');
  update({ ...view, days: [...view.days] });
  expect(terrain(1)).not.toHaveClass('game-map-region-revealing');
});

// Component-local history loses the real map -> learn -> return unlock; cache-wide replay repeats it.
it('animates once when returning from learning after observing a locked region', async () => {
  const locked = mapView();
  const unlocked = mapView(6);
  const { update } = mount(locked);
  update(locked, student.accountId, false);
  update(unlocked);
  expect(terrain(6)).toHaveClass('game-map-region-revealing');
  await act(() => new Promise((resolve) => setTimeout(resolve, 950)));
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
  update(unlocked, student.accountId, false);
  update(unlocked);
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
  update(locked);
  update(unlocked);
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
});

// Account/content switches and auth-cache replacement must never replay the former identity's event.
it('drops active clouds and seen history on identity changes and cache replacement', () => {
  const { update, client } = mount();
  update(mapView(6));
  expect(terrain(6)).toHaveClass('game-map-region-revealing');
  act(() => replaceAccountCache(client, { ...student, role: 'STUDENT', accountId: 'student-b' }));
  update(mapView(6), 'student-b');
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
  update(mapView(), 'student-b');
  update({ ...mapView(11), contentVersion: 'new-course' }, 'student-b');
  expect(terrain(11)).not.toHaveClass('game-map-region-revealing');
  act(() => replaceAccountCache(client, { ...student, role: 'STUDENT' }));
  update(mapView(6));
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
});

// Returning to a content identity within the timer must not restore its old active event.
it('never replays an in-flight reveal after a content identity round trip', () => {
  const { update } = mount();
  update(mapView(6));
  expect(terrain(6)).toHaveClass('game-map-region-revealing');
  update({ ...mapView(6), contentVersion: 'different-course' });
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
  update(mapView(6));
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
});

// Reduced motion must render the unlocked state immediately without an active finite cloud animation.
it('reveals immediately with reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const { update } = mount();
  update(mapView(6));
  expect(terrain(6)).toHaveAttribute('data-revealed', 'true');
  expect(terrain(6)).not.toHaveClass('game-map-region-revealing');
});

// A wider desktop canvas must recenter using its measured dimensions, not the narrow reference width.
it('recenters the canonical avatar against the actual responsive canvas size', () => {
  const scroll = vi.fn();
  const descriptors = {
    width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
    height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
    scroll: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo'),
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList.contains('game-map-world') ? 1260 : 900;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return this.classList.contains('game-map-world') ? 3780 : 600;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scroll });
  try {
    mount({ ...mapView(), journeyPosition: 47 });
    expect(scroll.mock.lastCall![0].left).toBeCloseTo(185.44644);
    expect(scroll.mock.lastCall![0].top).toBeCloseTo(1925.664);
  } finally {
    for (const [name, descriptor] of [
      ['clientWidth', descriptors.width],
      ['clientHeight', descriptors.height],
      ['scrollTo', descriptors.scroll],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
    }
  }
});
