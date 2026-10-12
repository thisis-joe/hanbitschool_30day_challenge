import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '../auth/queries';
import { getLearningStatus, getLearningSession, getPersonalQuestions } from './api';
import type { PersonalQuestionFilter } from './types';
export const learningKeys = {
  status: (accountId: string) => ['learning', accountId, 'status'] as const,
  session: (accountId: string, sessionId: string) =>
    ['learning', accountId, 'session', sessionId] as const,
  questions: (accountId: string, filter: PersonalQuestionFilter) =>
    ['learning', accountId, 'questions', filter] as const,
};
export function useLearningStatus() {
  const { data: account } = useCurrentAccount();
  const accountId = account?.role === 'STUDENT' ? account.accountId : undefined;
  return useQuery({
    queryKey: learningKeys.status(accountId ?? ''),
    queryFn: ({ signal }) => getLearningStatus(signal),
    enabled: accountId !== undefined,
  });
}
export function useLearningSession(sessionId?: string) {
  const { data: account } = useCurrentAccount();
  const accountId = account?.role === 'STUDENT' ? account.accountId : undefined;
  return useQuery({
    queryKey: learningKeys.session(accountId ?? '', sessionId ?? ''),
    queryFn: ({ signal }) => getLearningSession(sessionId!, signal),
    enabled: accountId !== undefined && !!sessionId,
  });
}
export function usePersonalQuestions(filter: PersonalQuestionFilter) {
  const { data: account } = useCurrentAccount();
  const accountId = account?.role === 'STUDENT' ? account.accountId : undefined;
  return useQuery({
    queryKey: learningKeys.questions(accountId ?? '', filter),
    queryFn: ({ signal }) => getPersonalQuestions(filter, signal),
    enabled: accountId !== undefined,
  });
}
