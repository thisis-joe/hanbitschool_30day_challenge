import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { errorMessage } from '../../lib/http';
import { addBookmark, removeBookmark, addReviewQueue } from './api';
import { usePersonalQuestions } from './queries';
import { getPendingCommandEpoch, subscribePendingCommandCleanup } from './pendingCommands';
import type { AnswerResult } from './types';

interface Props {
  questionId: number;
  result: AnswerResult | null;
}
export function QuestionFeedbackActions(props: Props) {
  const { data: account } = useCurrentAccount();
  if (account?.role !== 'STUDENT') return null;
  return (
    <FeedbackTools
      key={`${account.accountId}:${props.questionId}:${props.result?.attemptAnswerId ?? 'list'}`}
      {...props}
      accountId={account.accountId}
    />
  );
}
function FeedbackTools({ questionId, result, accountId }: Props & { accountId: string }) {
  const bookmarkTipId = useId();
  const queue = usePersonalQuestions('REVIEW_QUEUE');
  const mastered = usePersonalQuestions('MASTERED');
  const bookmarks = usePersonalQuestions('BOOKMARKED');
  const queries = [queue, mastered, bookmarks];
  const client = useQueryClient();
  const flight = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [dismissed, setDismissed] = useState(false);
  const [bookmarkTipDismissed, setBookmarkTipDismissed] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const abort = () => flight.current?.abort();
    const unsubscribe = subscribePendingCommandCleanup(abort);
    return () => {
      mounted.current = false;
      abort();
      unsubscribe();
    };
  }, []);
  const question = queries
    .flatMap((query) => query.data ?? [])
    .find((row) => row.questionId === questionId);
  const bookmarked = question?.bookmarked ?? false;
  const ready = queries.every((query) => query.isSuccess);
  const queryError = queries.find((query) => query.error)?.error;
  const prompt = result?.reviewPromptEligible && !dismissed && !question?.inReviewQueue;
  function owns(controller: AbortController, epoch: number) {
    const account = client.getQueryData<AccountMe | null>(meKey);
    return (
      mounted.current &&
      !controller.signal.aborted &&
      epoch === getPendingCommandEpoch() &&
      account?.role === 'STUDENT' &&
      account.accountId === accountId
    );
  }
  async function write(kind: 'STAR' | 'QUEUE') {
    if (!ready || flight.current) return;
    const controller = new AbortController();
    const epoch = getPendingCommandEpoch();
    flight.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      await (kind === 'QUEUE'
        ? addReviewQueue(questionId, controller.signal)
        : bookmarked
          ? removeBookmark(questionId, controller.signal)
          : addBookmark(questionId, controller.signal));
      if (!owns(controller, epoch)) return;
      await client.invalidateQueries({ queryKey: ['learning', accountId, 'questions'] });
      if (owns(controller, epoch) && kind === 'QUEUE') setDismissed(true);
    } catch (failure) {
      if (owns(controller, epoch)) setError(errorMessage(failure));
    } finally {
      if (flight.current === controller) flight.current = null;
      if (owns(controller, epoch)) setBusy(false);
    }
  }
  return (
    <div className="learning-feedback-tools" role="group" aria-label={`문항 ${questionId} 관리`}>
      {result ? (
        <span
          className="learning-bookmark"
          onMouseEnter={() => setBookmarkTipDismissed(false)}
          onFocus={() => setBookmarkTipDismissed(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setBookmarkTipDismissed(true);
          }}
        >
          <button
            className="learning-bookmark-toggle"
            aria-label="즐겨찾기"
            aria-describedby={bookmarkTipId}
            aria-pressed={bookmarked}
            disabled={!ready || busy}
            onClick={() => void write('STAR')}
          >
            <svg
              viewBox="0 0 40 40"
              shapeRendering="crispEdges"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M18 4h4v4h2v4h2v2h10v4h-4v2h-2v2h-2v6h2v6h-4v-2h-4v-2h-4v2h-4v2h-4v-6h2v-6h-2v-2H8v-2H4v-4h10v-2h2V8h2Z" />
            </svg>
          </button>
          <span
            className="learning-bookmark-tooltip"
            id={bookmarkTipId}
            role="tooltip"
            hidden={bookmarkTipDismissed}
          >
            {bookmarked ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          </span>
        </span>
      ) : (
        <button
          className="secondary"
          aria-label="별표"
          aria-pressed={bookmarked}
          disabled={!ready || busy}
          onClick={() => void write('STAR')}
        >
          {bookmarked ? '★ 별표' : '☆ 별표'}
        </button>
      )}
      {prompt ? (
        <div className="learning-consent">
          <p>다시 볼 문제로 추가할까요?</p>
          <div className="learning-tool-buttons">
            <button disabled={!ready || busy} onClick={() => void write('QUEUE')}>
              추가하기
            </button>
            <button className="secondary" disabled={busy} onClick={() => setDismissed(true)}>
              지금은 괜찮아요
            </button>
          </div>
        </div>
      ) : null}
      {error || queryError ? <p role="alert">{error ?? errorMessage(queryError)}</p> : null}
      {queryError ? (
        <button
          className="secondary"
          disabled={busy || queries.some((query) => query.isFetching)}
          onClick={() => void Promise.all(queries.map((query) => query.refetch()))}
        >
          개인 상태 다시 불러오기
        </button>
      ) : null}
    </div>
  );
}
