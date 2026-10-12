import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from './api';
import { HttpError, refreshCsrf } from '../../lib/http';
import type { AccountMe } from './types';
import { clearAllPendingCommands, getPendingCommandEpoch } from '../learning/pendingCommands';
export const meKey = ['auth', 'me'] as const;
export function useCurrentAccount() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      const epoch = getPendingCommandEpoch();
      try {
        return await getMe();
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          if (epoch === getPendingCommandEpoch()) clearAllPendingCommands();
          return null;
        }
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
    clearAllPendingCommands();
    await client.cancelQueries();
    client.clear();
    client.setQueryData(meKey, me);
    // Authentication has committed; the next mutation can recover its CSRF token.
    void refreshCsrf().catch(() => undefined);
  };
}
