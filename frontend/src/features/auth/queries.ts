import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from './api';
import { HttpError, refreshCsrf } from '../../lib/http';
import type { AccountMe } from './types';
export const meKey = ['auth', 'me'] as const;
export function useCurrentAccount() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await getMe();
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}
export function accountPath(me: AccountMe) {
  return me.role === 'STUDENT'
    ? '/student/account'
    : me.mustChangePassword
      ? '/account/password'
      : '/staff/classrooms';
}
export function useAcceptAccount() {
  const client = useQueryClient();
  return async (me: AccountMe | null) => {
    await client.cancelQueries();
    client.clear();
    client.setQueryData(meKey, me);
    // Authentication has committed; the next mutation can recover its CSRF token.
    void refreshCsrf().catch(() => undefined);
  };
}
