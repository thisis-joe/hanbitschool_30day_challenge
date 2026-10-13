import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from './api';
import { HttpError, refreshCsrf } from '../../lib/http';
import type { AccountMe } from './types';
import { clearAllPendingCommands, getPendingCommandEpoch } from '../learning/pendingCommands';
export const meKey = ['auth', 'me'] as const;
export function replaceAccountCache(client: QueryClient, account: AccountMe | null) {
  // Keep /me observers attached so mounted guards receive the accepted account immediately.
  const current = client.getQueryCache().find({ queryKey: meKey, exact: true });
  client.removeQueries({ predicate: (query) => query !== current });
  client.getMutationCache().clear();
  client.setQueryData(meKey, account);
}
export function useCurrentAccount() {
  const client = useQueryClient();
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      const epoch = getPendingCommandEpoch();
      let account: AccountMe | null;
      try {
        account = await getMe();
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 401) throw error;
        account = null;
      }
      // An explicit acceptance may have superseded this /me request while it was pending.
      if (epoch !== getPendingCommandEpoch())
        return client.getQueryData<AccountMe | null>(meKey) ?? null;
      const previous = client.getQueryData<AccountMe | null>(meKey);
      if (
        account === null ||
        (previous !== undefined && previous?.accountId !== account.accountId)
      ) {
        clearAllPendingCommands();
        replaceAccountCache(client, account);
      }
      return account;
    },
    retry: false,
  });
}
export function accountPath(me: AccountMe) {
  return me.role === 'STUDENT'
    ? '/student/learning'
    : me.mustChangePassword
      ? '/account/password'
      : '/staff/classrooms';
}
export function studentReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value))
    return '/student/learning';
  // Match the original path, before URL normalization can resolve traversal segments.
  const [path] = value.split(/[?#]/);
  const session =
    /^\/student\/learning\/sessions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/result)?$/i;
  return ['/student/learning', '/student/questions', '/student/account'].includes(path) ||
    session.test(path)
    ? value
    : '/student/learning';
}
export function useAcceptAccount() {
  const client = useQueryClient();
  return async (me: AccountMe | null) => {
    clearAllPendingCommands();
    await client.cancelQueries();
    replaceAccountCache(client, me);
    // Authentication has committed; the next mutation can recover its CSRF token.
    void refreshCsrf().catch(() => undefined);
  };
}
