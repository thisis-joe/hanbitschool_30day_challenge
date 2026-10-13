import type { ApiError } from '../features/auth/types';
import { learningClock } from '../features/learning/serverClock';
import { getPendingCommandEpoch } from '../features/learning/pendingCommands';
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
}
let csrf: { headerName: string; token: string; epoch: number } | undefined;
let csrfFlight: Promise<void> | undefined;
let csrfFlightEpoch: number | undefined;
let unauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(handler?: () => void) {
  unauthorized = handler;
}
export async function refreshCsrf(): Promise<void> {
  const epoch = getPendingCommandEpoch();
  if (csrfFlight && csrfFlightEpoch === epoch) return csrfFlight;
  csrf = undefined;
  csrfFlightEpoch = epoch;
  const flight: Promise<void> = (async () => {
    const res = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('연결을 확인하고 다시 시도해 주세요.');
    const token = await res.json();
    if (epoch === getPendingCommandEpoch()) csrf = { ...token, epoch };
  })().finally(() => {
    if (csrfFlight === flight) csrfFlight = undefined;
  });
  csrfFlight = flight;
  return flight;
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const epoch = getPendingCommandEpoch();
  const assertCurrent = () => {
    init.signal?.throwIfAborted();
    if (epoch !== getPendingCommandEpoch())
      throw new DOMException('The account changed during the request.', 'AbortError');
  };
  assertCurrent();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf || csrf.epoch !== epoch) await refreshCsrf();
    assertCurrent();
    if (csrf) headers.set(csrf.headerName, csrf.token);
    if (init.body) headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  assertCurrent();
  learningClock.observeHttpDate(response.headers.get('Date'));
  if (!response.ok) {
    let error: ApiError;
    try {
      error = await response.json();
    } catch (cause) {
      assertCurrent();
      if (cause instanceof Error && cause.name === 'AbortError') throw cause;
      error = {
        code: 'HTTP_ERROR',
        message: '요청을 처리할 수 없습니다. 다시 시도해 주세요.',
        fieldErrors: {},
      };
    }
    assertCurrent();
    if (error.code === 'INVALID_CSRF_TOKEN') csrf = undefined;
    if (response.status === 401 && !path.endsWith('/login') && path !== '/api/auth/me')
      unauthorized?.();
    throw new HttpError(response.status, error);
  }
  if (response.status === 204) return undefined as T;
  const result: T = await response.json();
  assertCurrent();
  return result;
}
export function errorMessage(error: unknown) {
  if (error instanceof HttpError)
    return [error.message, ...Object.values(error.body.fieldErrors ?? {})].join(' ');
  return '연결을 확인하고 다시 시도해 주세요.';
}
