import { expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import {
  activeSession,
  answerResult,
  learningStatus,
  personalQuestion,
  requestId,
  sessionId,
  deferred,
} from '../../test/learningFixtures';
import { refreshCsrf } from '../../lib/http';
import { learningClock } from './serverClock';
import {
  getLearningStatus,
  getLearningSession,
  getPersonalQuestions,
  startLearningSession,
  submitLearningAnswer,
  advanceLearningSession,
  addReviewQueue,
  removeReviewQueue,
  addBookmark,
  removeBookmark,
} from './api';

// Wrong routes, missing CSRF/body, lost abort signals, or bypassing HTTP Date/204 handling break these requests.
it('apiUsesStudentPathsCsrfAndAbortSignals', async () => {
  const outgoing = vi.spyOn(globalThis, 'fetch');
  const seen: {
    method: string;
    path: string;
    csrf: string | null;
    body: unknown;
    credentials: string;
    cache: string;
  }[] = [];
  server.use(
    http.all('*/api/student/learning/*', async ({ request }) => {
      const path = new URL(request.url).pathname + new URL(request.url).search;
      seen.push({
        method: request.method,
        path,
        csrf: request.headers.get('X-CSRF-TOKEN'),
        body: request.headers.get('content-type') ? await request.json() : null,
        credentials: request.credentials,
        cache: request.cache,
      });
      const headers = { Date: 'Tue, 13 Oct 2026 00:00:00 GMT' };
      if (['PUT', 'DELETE'].includes(request.method))
        return new HttpResponse(null, { status: 204, headers });
      const data = path.endsWith('/status')
        ? learningStatus
        : path.includes('/questions?')
          ? [personalQuestion]
          : path.endsWith('/answers')
            ? answerResult
            : activeSession;
      return HttpResponse.json(data, { headers });
    }),
  );
  await refreshCsrf();
  expect((await getLearningStatus()).totalXp).toBe(0);
  expect((await getLearningSession(sessionId)).question?.deadlineAt).toBe('2026-10-13T00:00:10Z');
  expect((await getPersonalQuestions('REVIEW_QUEUE'))[0].lastOutcome).toBe('WRONG');
  await startLearningSession({ mode: 'FIRST', dayNumber: 1, questionIds: null, requestId });
  await submitLearningAnswer(sessionId, { questionId: 1, choice: 'O', requestId });
  await advanceLearningSession(sessionId, { requestId });
  expect(await addReviewQueue(1)).toBeUndefined();
  expect(await removeReviewQueue(1)).toBeUndefined();
  expect(await addBookmark(1)).toBeUndefined();
  expect(await removeBookmark(1)).toBeUndefined();
  expect(seen.map(({ method, path }) => [method, path])).toEqual([
    ['GET', '/api/student/learning/status'],
    ['GET', '/api/student/learning/sessions/11111111-1111-4111-8111-111111111111'],
    ['GET', '/api/student/learning/questions?filter=REVIEW_QUEUE'],
    ['POST', '/api/student/learning/sessions'],
    ['POST', '/api/student/learning/sessions/11111111-1111-4111-8111-111111111111/answers'],
    ['POST', '/api/student/learning/sessions/11111111-1111-4111-8111-111111111111/advance'],
    ['PUT', '/api/student/learning/review-queue/1'],
    ['DELETE', '/api/student/learning/review-queue/1'],
    ['PUT', '/api/student/learning/bookmarks/1'],
    ['DELETE', '/api/student/learning/bookmarks/1'],
  ]);
  expect(seen.slice(3).every((item) => item.csrf === 'test-token')).toBe(true);
  expect(seen.every((item) => item.credentials === 'same-origin')).toBe(true);
  // MSW reconstructs Request.cache; inspect the actual fetch boundary while still forwarding to MSW.
  expect(
    outgoing.mock.calls.every(
      ([, init]) => init?.cache === 'no-store' && init.credentials === 'same-origin',
    ),
  ).toBe(true);
  expect(seen[4].body).toEqual({
    questionId: 1,
    choice: 'O',
    requestId: '22222222-2222-4222-8222-222222222222',
  });
  expect(seen[3].body).toEqual({
    mode: 'FIRST',
    dayNumber: 1,
    questionIds: null,
    requestId: '22222222-2222-4222-8222-222222222222',
  });
  expect(seen[5].body).toEqual({ requestId: '22222222-2222-4222-8222-222222222222' });
  expect(learningClock.now()).toBeGreaterThanOrEqual(1791849600000);
  expect(learningClock.now()).toBeLessThan(1791849605000);
  const entered = deferred<void>();
  const released = deferred<void>();
  let aborted = false;
  server.use(
    http.get('*/api/student/learning/status', async ({ request }) => {
      request.signal.addEventListener('abort', () => {
        aborted = true;
      });
      entered.resolve();
      await released.promise;
      return HttpResponse.json(learningStatus);
    }),
  );
  const controller = new AbortController();
  const read = getLearningStatus(controller.signal);
  const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  controller.abort();
  await rejected;
  expect(aborted).toBe(true);
  released.resolve();
});
