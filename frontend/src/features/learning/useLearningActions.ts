import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { errorMessage, HttpError } from '../../lib/http';
import {
  advanceLearningSession,
  getLearningSession,
  getLearningStatus,
  startLearningSession,
  submitLearningAnswer,
} from './api';
import { learningKeys } from './queries';
import {
  clearPendingCommand,
  getPendingCommandEpoch,
  readPendingCommand,
  subscribePendingCommandCleanup,
  writePendingCommand,
} from './pendingCommands';
import type {
  AnswerChoice,
  AnswerResult,
  LearningOperationResponse,
  LearningSessionView,
  PendingLearningCommand,
  StartTarget,
} from './types';

interface Flight {
  owner: string;
  epoch: number;
  controller: AbortController;
}
interface ActionState {
  owner: string | undefined;
  busy: boolean;
  error?: string;
  pendingCommand: PendingLearningCommand | null;
}
const conflicts = new Set([
  'SESSION_CONFLICT',
  'ANSWER_ALREADY_FINALIZED',
  'QUESTION_MISMATCH',
  'CONTENT_VERSION_MISMATCH',
  'IDEMPOTENCY_KEY_REUSED',
  'PREVIOUS_DAY_NOT_PASSED',
]);

export function useLearningActions() {
  const client = useQueryClient();
  const { data: account } = useCurrentAccount();
  const accountId = account?.role === 'STUDENT' ? account.accountId : undefined;
  const active = useRef<Flight | null>(null);
  const [state, setState] = useState<ActionState>(() => ({
    owner: accountId,
    busy: false,
    pendingCommand: accountId ? readPendingCommand(accountId) : null,
  }));

  useEffect(() => {
    const reset = () => {
      active.current?.controller.abort();
      active.current = null;
      setState({
        owner: accountId,
        busy: false,
        pendingCommand: accountId ? readPendingCommand(accountId) : null,
      });
    };
    reset();
    const unsubscribe = subscribePendingCommandCleanup(reset);
    return () => {
      unsubscribe();
      active.current?.controller.abort();
      active.current = null;
    };
  }, [accountId]);

  function isCurrent(flight: Flight): boolean {
    const current = client.getQueryData<AccountMe | null>(meKey);
    return (
      active.current === flight &&
      flight.epoch === getPendingCommandEpoch() &&
      !flight.controller.signal.aborted &&
      current?.role === 'STUDENT' &&
      current.accountId === flight.owner
    );
  }

  async function refreshRelated(owner: string) {
    await Promise.all([
      client.invalidateQueries({ queryKey: learningKeys.status(owner), exact: true }),
      client.invalidateQueries({ queryKey: ['learning', owner, 'questions'] }),
    ]);
  }

  async function canonicalSession(id: string, flight: Flight) {
    const key = learningKeys.session(flight.owner, id);
    await client.cancelQueries({ queryKey: key, exact: true });
    if (!isCurrent(flight)) return null;
    return client.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        getLearningSession(id, AbortSignal.any([signal, flight.controller.signal])),
      staleTime: 0,
    });
  }

  async function recoverConflict(
    pending: PendingLearningCommand,
    flight: Flight,
  ): Promise<LearningSessionView | null> {
    if (pending.kind !== 'START') return canonicalSession(pending.sessionId, flight);
    const key = learningKeys.status(flight.owner);
    await client.cancelQueries({ queryKey: key, exact: true });
    if (!isCurrent(flight)) return null;
    const status = await client.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        getLearningStatus(AbortSignal.any([signal, flight.controller.signal])),
      staleTime: 0,
    });
    if (!isCurrent(flight) || !status.activeSession) return null;
    return canonicalSession(status.activeSession.sessionId, flight);
  }

  async function run(pending: PendingLearningCommand): Promise<LearningOperationResponse | null> {
    if (!accountId || active.current) return null;
    const flight: Flight = {
      owner: accountId,
      epoch: getPendingCommandEpoch(),
      controller: new AbortController(),
    };
    active.current = flight;
    if (!isCurrent(flight)) {
      active.current = null;
      return null;
    }
    writePendingCommand(accountId, pending);
    setState({ owner: accountId, busy: true, pendingCommand: pending });
    let committed = false;
    let reconciling = false;
    let conflictMessage: string | undefined;
    try {
      let response: LearningOperationResponse | null = null;
      let canonical: LearningSessionView | null;
      try {
        const signal = flight.controller.signal;
        if (pending.kind === 'START')
          response = { kind: 'START', view: await startLearningSession(pending.command, signal) };
        else if (pending.kind === 'ANSWER')
          response = {
            kind: 'ANSWER',
            sessionId: pending.sessionId,
            answer: await submitLearningAnswer(pending.sessionId, pending.command, signal),
          };
        else
          response = {
            kind: 'ADVANCE',
            view: await advanceLearningSession(pending.sessionId, pending.command, signal),
          };
        committed = true;
      } catch (error) {
        if (!isCurrent(flight)) return null;
        if (
          !(error instanceof HttpError) ||
          error.status !== 409 ||
          !conflicts.has(error.body.code)
        )
          throw error;
        reconciling = true;
        conflictMessage = errorMessage(error);
      }
      if (!isCurrent(flight)) return null;
      if (response) {
        const id = response.kind === 'ANSWER' ? response.sessionId : response.view.sessionId;
        canonical = await canonicalSession(id, flight);
      } else canonical = await recoverConflict(pending, flight);
      if (!isCurrent(flight)) return null;
      await refreshRelated(accountId);
      if (!isCurrent(flight)) return null;
      clearPendingCommand(accountId);
      if (canonical) {
        if (pending.kind === 'ANSWER') {
          const answer =
            canonical.lastAnswer?.questionId === pending.command.questionId
              ? canonical.lastAnswer
              : response?.kind === 'ANSWER'
                ? response.answer
                : null;
          response = answer ? { kind: 'ANSWER', sessionId: pending.sessionId, answer } : null;
        } else response = { kind: pending.kind, view: canonical };
      } else response = null;
      setState({
        owner: accountId,
        busy: false,
        pendingCommand: null,
        error: response ? undefined : conflictMessage,
      });
      return response;
    } catch (error) {
      if (!isCurrent(flight)) return null;
      const definiteRejection =
        !committed &&
        !reconciling &&
        error instanceof HttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429 &&
        error.body.code !== 'INVALID_CSRF_TOKEN';
      if (definiteRejection) clearPendingCommand(accountId);
      if (reconciling) await refreshRelated(accountId);
      if (!isCurrent(flight)) return null;
      setState({
        owner: accountId,
        busy: false,
        pendingCommand: readPendingCommand(accountId),
        error: errorMessage(error),
      });
      return null;
    } finally {
      if (active.current === flight) active.current = null;
    }
  }

  function canCreateCommand(): boolean {
    return !!accountId && !active.current && !readPendingCommand(accountId);
  }

  return {
    busy: state.owner === accountId && state.busy,
    error: state.owner === accountId ? state.error : undefined,
    pendingCommand:
      state.owner === accountId
        ? state.pendingCommand
        : accountId
          ? readPendingCommand(accountId)
          : null,
    start: async (target: StartTarget): Promise<LearningSessionView | null> => {
      if (!canCreateCommand()) return null;
      const response = await run({
        kind: 'START',
        command: { ...target, requestId: crypto.randomUUID() },
      });
      return response?.kind === 'START' ? response.view : null;
    },
    answer: async (
      sessionId: string,
      questionId: number,
      choice: AnswerChoice,
    ): Promise<AnswerResult | null> => {
      if (!canCreateCommand()) return null;
      const response = await run({
        kind: 'ANSWER',
        sessionId,
        command: { questionId, choice, requestId: crypto.randomUUID() },
      });
      return response?.kind === 'ANSWER' ? response.answer : null;
    },
    advance: async (sessionId: string): Promise<LearningSessionView | null> => {
      if (!canCreateCommand()) return null;
      const response = await run({
        kind: 'ADVANCE',
        sessionId,
        command: { requestId: crypto.randomUUID() },
      });
      return response?.kind === 'ADVANCE' ? response.view : null;
    },
    retryPending: async (): Promise<LearningOperationResponse | null> => {
      if (!accountId || active.current) return null;
      const pending = readPendingCommand(accountId);
      return pending ? run(pending) : null;
    },
  };
}
