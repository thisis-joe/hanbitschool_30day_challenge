import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCurrentAccount } from '../auth/queries';
import { getGame, getJourney } from './api';
import type { GameView, JourneyView } from './types';

// Both caches describe this fixed course; keep callable account-key interfaces stable.
export const gameKeys = {
  view: (accountId: string) => ['game', accountId, 'hanbit-v1', 'game-v1', 'view'] as const,
  journey: (accountId: string) => ['game', accountId, 'hanbit-v1', 'game-v1', 'journey'] as const,
};
export function useGame(): UseQueryResult<GameView> {
  const { data: account } = useCurrentAccount();
  const owner = account?.role === 'STUDENT' ? account.accountId : undefined;
  return useQuery({
    queryKey: gameKeys.view(owner ?? ''),
    queryFn: ({ signal }) => getGame(signal),
    enabled: owner !== undefined,
  });
}
export function useJourney(): UseQueryResult<JourneyView> {
  const { data: account } = useCurrentAccount();
  const owner = account?.role === 'STUDENT' ? account.accountId : undefined;
  return useQuery({
    queryKey: gameKeys.journey(owner ?? ''),
    queryFn: ({ signal }) => getJourney(signal),
    enabled: owner !== undefined,
  });
}
