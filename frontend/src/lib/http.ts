import type { ApiError } from '../features/auth/types';
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
}
let csrf: { headerName: string; token: string } | undefined;
let csrfFlight: Promise<void> | undefined;
let unauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(handler?: () => void) {
  unauthorized = handler;
}
export async function refreshCsrf(): Promise<void> {
  if (csrfFlight) return csrfFlight;
  csrf = undefined;
  csrfFlight = (async () => {
    const res = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('연결을 확인하고 다시 시도해 주세요.');
    csrf = await res.json();
  })().finally(() => {
    csrfFlight = undefined;
  });
  return csrfFlight;
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf) await refreshCsrf();
    if (csrf) headers.set(csrf.headerName, csrf.token);
    if (init.body) headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    let error: ApiError;
    try {
      error = await response.json();
    } catch {
      error = {
        code: 'HTTP_ERROR',
        message: '요청을 처리할 수 없습니다. 다시 시도해 주세요.',
        fieldErrors: {},
      };
    }
    if (error.code === 'INVALID_CSRF_TOKEN') csrf = undefined;
    if (response.status === 401 && !path.endsWith('/login') && path !== '/api/auth/me')
      unauthorized?.();
    throw new HttpError(response.status, error);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export function errorMessage(error: unknown) {
  if (error instanceof HttpError)
    return [error.message, ...Object.values(error.body.fieldErrors ?? {})].join(' ');
  return '연결을 확인하고 다시 시도해 주세요.';
}
