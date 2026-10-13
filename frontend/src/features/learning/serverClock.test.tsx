import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { ServerClock, learningClock } from './serverClock';
import { useDeadlineCountdown } from './useDeadlineCountdown';

afterEach(() => vi.useRealTimers());

// A wall-clock read on every tick would give time back when the device clock moves.
it('wallClockJumpNeverExtendsTheLiteralDeadline', () => {
  let monotonic = 0;
  let wall = 1791849600000;
  const clock = new ServerClock(
    () => monotonic,
    () => wall,
  );
  expect(clock.now()).toBe(1791849600000);
  wall -= 60000;
  monotonic = 2500;
  expect(clock.now()).toBe(1791849602500);
  clock.observeHttpDate('Tue, 13 Oct 2026 00:00:00 GMT');
  monotonic = 6000;
  wall += 120000;
  clock.observeHttpDate(null);
  clock.observeHttpDate('not a date');
  expect(clock.now()).toBe(1791849603500);
  expect(Date.parse('2026-10-13T00:00:10Z') - clock.now()).toBe(6500);
});

// Rounding down, not clamping, or calling the API on expiry would break this display contract.
it('countdownCeilsClampsAndExpiresWithoutCallingAnApi', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  learningClock.observeHttpDate('Tue, 13 Oct 2026 00:00:00 GMT');
  let requests = 0;
  server.use(
    http.all('*', () => {
      requests++;
      return HttpResponse.json({});
    }),
  );
  const { result, rerender } = renderHook(({ deadline }) => useDeadlineCountdown(deadline, 5), {
    initialProps: { deadline: '2026-10-13T00:00:05Z' },
  });
  expect(result.current).toEqual({ seconds: 5, expired: false });
  act(() => vi.advanceTimersByTime(250));
  expect(result.current.seconds).toBe(5);
  act(() => vi.advanceTimersByTime(750));
  expect(result.current.seconds).toBe(4);
  act(() => vi.advanceTimersByTime(4000));
  expect(result.current).toEqual({ seconds: 0, expired: true });
  rerender({ deadline: '2026-10-13T00:01:00Z' });
  expect(result.current).toEqual({ seconds: 5, expired: false });
  expect(requests).toBe(0);
});
