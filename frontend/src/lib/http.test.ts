import { afterEach, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { refreshCsrf, request } from './http';
import { deferred } from '../test/learningFixtures';
import { clearAllPendingCommands } from '../features/learning/pendingCommands';
afterEach(() => vi.restoreAllMocks());
it('expiredCsrfIsNotReusedAfterRefreshFailure', async () => {
  await refreshCsrf();
  let mutations = 0;
  let token: string | null = null;
  server.use(
    http.get('*/api/auth/csrf', () => HttpResponse.error()),
    http.post('*/api/test/mutation', ({ request }) => {
      mutations++;
      token = request.headers.get('X-CSRF-TOKEN');
      return HttpResponse.json(
        { code: 'INVALID_CSRF_TOKEN', message: '다시 시도', fieldErrors: {} },
        { status: 403 },
      );
    }),
  );
  await expect(refreshCsrf()).rejects.toBeDefined();
  await expect(
    request<void>('/api/test/mutation', { method: 'POST', body: '{}' }),
  ).rejects.toBeDefined();
  expect(mutations).toBe(0);
  server.use(
    http.get('*/api/auth/csrf', () =>
      HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'fresh-token' }),
    ),
    http.post('*/api/test/mutation', ({ request }) => {
      mutations++;
      token = request.headers.get('X-CSRF-TOKEN');
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await request<void>('/api/test/mutation', { method: 'POST', body: '{}' });
  expect(mutations).toBe(1);
  expect(token).toBe('fresh-token');
});

// Obsolete/aborted error bodies cannot invalidate the token installed for the current account.
it.each(['abort', 'owner-change'] as const)('staleErrorBodyPreservesCsrf: %s', async (reason) => {
  const controller = new AbortController();
  const release = deferred<void>();
  const upstream = globalThis.fetch;
  let response: Response | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === '/api/test/stale-error') {
      response = new Response(
        new ReadableStream({
          start(body) {
            void release.promise.then(() => {
              body.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({
                    code: 'INVALID_CSRF_TOKEN',
                    message: '다시 시도',
                    fieldErrors: {},
                  }),
                ),
              );
              body.close();
            });
          },
        }),
        { status: 403 },
      );
      return response;
    }
    return upstream(input, init);
  });
  server.use(
    http.get('*/api/auth/csrf', () =>
      HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'kept-token' }),
    ),
  );
  await refreshCsrf();
  const oldRequest = request('/api/test/stale-error', { signal: controller.signal });
  await vi.waitFor(() => expect(response?.bodyUsed).toBe(true));
  if (reason === 'abort') controller.abort();
  else clearAllPendingCommands();
  // The next account establishes its token before the stale body finishes.
  await refreshCsrf();
  server.use(
    http.get('*/api/auth/csrf', () =>
      HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'unwanted-refresh' }),
    ),
    http.post('*/api/test/token', ({ request }) =>
      HttpResponse.json({ token: request.headers.get('X-CSRF-TOKEN') }),
    ),
  );
  release.resolve();
  await Promise.allSettled([oldRequest]);
  expect(await request('/api/test/token', { method: 'POST' })).toEqual({ token: 'kept-token' });
  await expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
});

// An older CSRF refresh must neither overwrite the new token nor coalesce the new owner's refresh.
it('csrfRefreshFromPreviousEpochCannotReplaceTheCurrentToken', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let reads = 0;
  server.use(
    http.get('*/api/auth/csrf', async () => {
      if (++reads === 1) {
        entered.resolve();
        await release.promise;
        return HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'old-owner-token' });
      }
      return HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'new-owner-token' });
    }),
    http.post('*/api/test/token', ({ request }) =>
      HttpResponse.json({ token: request.headers.get('X-CSRF-TOKEN') }),
    ),
  );
  const oldRefresh = refreshCsrf();
  await entered.promise;
  clearAllPendingCommands();
  const newRefresh = refreshCsrf();
  let refreshed = false;
  void newRefresh.then(() => {
    refreshed = true;
  });
  try {
    await vi.waitFor(() => expect(refreshed).toBe(true));
  } finally {
    release.resolve();
    await Promise.all([oldRefresh, newRefresh]);
  }
  expect(await request('/api/test/token', { method: 'POST' })).toEqual({
    token: 'new-owner-token',
  });
});

// A /me owner change must refresh the prior owner's token before the next protected write.
it('aNewAccountWriteDoesNotReuseThePreviousEpochsCsrfToken', async () => {
  await refreshCsrf();
  clearAllPendingCommands();
  server.use(
    http.get('*/api/auth/csrf', () =>
      HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'new-owner-token' }),
    ),
    http.post('*/api/test/token', ({ request }) =>
      HttpResponse.json({ token: request.headers.get('X-CSRF-TOKEN') }),
    ),
  );
  expect(await request('/api/test/token', { method: 'POST' })).toEqual({
    token: 'new-owner-token',
  });
});
