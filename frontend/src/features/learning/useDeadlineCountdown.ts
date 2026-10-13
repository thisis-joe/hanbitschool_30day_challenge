import { useEffect, useState } from 'react';
import { learningClock } from './serverClock';

export function useDeadlineCountdown(deadlineAt: string, timeLimitSeconds: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.ceil((Date.parse(deadlineAt) - learningClock.now()) / 1000);
  const seconds = Number.isFinite(remaining)
    ? Math.max(0, Math.min(timeLimitSeconds, remaining))
    : 0;
  return { seconds, expired: seconds === 0 };
}
