import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  nativeFetch(typeof input === 'string' ? new URL(input, window.location.origin) : input, init);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
