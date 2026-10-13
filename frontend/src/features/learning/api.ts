import { request } from '../../lib/http';
import type {
  AnswerResult,
  LearningSessionView,
  LearningStatus,
  PersonalQuestionFilter,
  PersonalQuestionView,
  StartLearningSessionCommand,
  SubmitAnswerCommand,
  AdvanceLearningSessionCommand,
} from './types';
const root = '/api/student/learning';
const sessionPath = (sessionId: string) => `${root}/sessions/${encodeURIComponent(sessionId)}`;
const post = <T>(path: string, command: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(command), signal });
export const getLearningStatus = (signal?: AbortSignal) =>
  request<LearningStatus>(`${root}/status`, { signal });
export const getLearningSession = (sessionId: string, signal?: AbortSignal) =>
  request<LearningSessionView>(sessionPath(sessionId), { signal });
export const getPersonalQuestions = (filter: PersonalQuestionFilter, signal?: AbortSignal) =>
  request<PersonalQuestionView[]>(`${root}/questions?filter=${encodeURIComponent(filter)}`, {
    signal,
  });
export const startLearningSession = (command: StartLearningSessionCommand, signal?: AbortSignal) =>
  post<LearningSessionView>(`${root}/sessions`, command, signal);
export const submitLearningAnswer = (
  sessionId: string,
  command: SubmitAnswerCommand,
  signal?: AbortSignal,
) => post<AnswerResult>(`${sessionPath(sessionId)}/answers`, command, signal);
export const advanceLearningSession = (
  sessionId: string,
  command: AdvanceLearningSessionCommand,
  signal?: AbortSignal,
) => post<LearningSessionView>(`${sessionPath(sessionId)}/advance`, command, signal);
export const addReviewQueue = (questionId: number, signal?: AbortSignal) =>
  request<void>(`${root}/review-queue/${questionId}`, { method: 'PUT', signal });
export const removeReviewQueue = (questionId: number, signal?: AbortSignal) =>
  request<void>(`${root}/review-queue/${questionId}`, { method: 'DELETE', signal });
export const addBookmark = (questionId: number, signal?: AbortSignal) =>
  request<void>(`${root}/bookmarks/${questionId}`, { method: 'PUT', signal });
export const removeBookmark = (questionId: number, signal?: AbortSignal) =>
  request<void>(`${root}/bookmarks/${questionId}`, { method: 'DELETE', signal });
