import { it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { refreshCsrf, request } from './http';
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
