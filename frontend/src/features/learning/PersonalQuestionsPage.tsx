import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { errorMessage } from '../../lib/http';
import { useRouteHeadingFocus } from '../../lib/useRouteHeadingFocus';
import { removeReviewQueue } from './api';
import { getPendingCommandEpoch, subscribePendingCommandCleanup } from './pendingCommands';
import { useLearningStatus, usePersonalQuestions } from './queries';
import { useLearningActions } from './useLearningActions';
import { QuestionFeedbackActions } from './QuestionFeedbackActions';
import type { AnswerOutcome, PersonalQuestionFilter } from './types';

const filters: Record<PersonalQuestionFilter, string> = {
  REVIEW_QUEUE: '다시 볼 문제',
  MASTERED: '복습 완료',
  BOOKMARKED: '별표한 문제',
};
const lastOutcomeLabels: Record<AnswerOutcome, string> = {
  CORRECT: '정답',
  WRONG: '오답',
  TIMED_OUT: '시간 초과',
};
export function PersonalQuestionsPage() {
  const [params] = useSearchParams();
  const value = params.get('filter');
  const filter: PersonalQuestionFilter =
    value === 'MASTERED' || value === 'BOOKMARKED' ? value : 'REVIEW_QUEUE';
  const { data: account } = useCurrentAccount();
  const heading = useRouteHeadingFocus(account?.accountId, !!account);
  return (
    <section className="learning-page game-personal-page">
      <h1 ref={heading} tabIndex={-1}>
        나의 문제
      </h1>
      <p>다시 보고 싶은 문제와 별표한 문제를 관리해요.</p>
      <nav className="learning-filters" aria-label="개인 문제 필터">
        {(Object.keys(filters) as PersonalQuestionFilter[]).map((key) => (
          <Link
            className="button secondary"
            key={key}
            aria-current={filter === key ? 'page' : undefined}
            to={`/student/questions?filter=${key}`}
          >
            {filters[key]}
          </Link>
        ))}
      </nav>
      {account?.role === 'STUDENT' ? (
        <QuestionList
          key={`${account.accountId}:${filter}`}
          accountId={account.accountId}
          filter={filter}
        />
      ) : (
        <p role="status">문제를 불러오고 있어요</p>
      )}
      <Link className="button secondary" to="/student/learning">
        학습 홈으로
      </Link>
    </section>
  );
}
function QuestionList({
  accountId,
  filter,
}: {
  accountId: string;
  filter: PersonalQuestionFilter;
}) {
  const questions = usePersonalQuestions(filter);
  const status = useLearningStatus();
  const actions = useLearningActions();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const [removing, setRemoving] = useState<number>();
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const checkFlight = useRef(false);
  const removeFlight = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const abort = () => removeFlight.current?.abort();
    const unsubscribe = subscribePendingCommandCleanup(abort);
    return () => {
      mounted.current = false;
      abort();
      unsubscribe();
    };
  }, []);
  const rows = [...(questions.data ?? [])].sort(
    (a, b) => a.dayNumber - b.dayNumber || a.position - b.position || a.questionId - b.questionId,
  );
  const selectedIds = rows
    .filter((row) => row.inReviewQueue && selected.includes(row.questionId))
    .map((row) => row.questionId);
  const reviewIds = rows.filter((row) => row.inReviewQueue).map((row) => row.questionId);
  const allSelected = reviewIds.length > 0 && selectedIds.length === reviewIds.length;
  const blocked =
    actions.busy ||
    !!actions.pendingCommand ||
    checking ||
    questions.isError ||
    status.isError ||
    status.isPending;
  function ownsPage(epoch: number) {
    const current = client.getQueryData<AccountMe | null>(meKey);
    return (
      mounted.current &&
      epoch === getPendingCommandEpoch() &&
      current?.role === 'STUDENT' &&
      current.accountId === accountId
    );
  }
  async function startReview() {
    if (blocked || !selectedIds.length || status.data?.activeSession || checkFlight.current) return;
    const epoch = getPendingCommandEpoch();
    checkFlight.current = true;
    setChecking(true);
    try {
      const fresh = await status.refetch();
      if (!ownsPage(epoch) || fresh.error || !fresh.data) return;
      if (fresh.data.activeSession) {
        navigate(`/student/learning/sessions/${fresh.data.activeSession.sessionId}`);
        return;
      }
      // Only the current confirmed visible queue can become the REVIEW target.
      const latest = await questions.refetch();
      if (!ownsPage(epoch) || latest.error || !latest.data) return;
      const ids = latest.data
        .slice()
        .sort(
          (a, b) =>
            a.dayNumber - b.dayNumber || a.position - b.position || a.questionId - b.questionId,
        )
        .filter((row) => row.inReviewQueue && selected.includes(row.questionId))
        .map((row) => row.questionId);
      if (!ids.length) return;
      const started = await actions.start({ mode: 'REVIEW', dayNumber: null, questionIds: ids });
      if (started && ownsPage(epoch)) navigate(`/student/learning/sessions/${started.sessionId}`);
    } finally {
      checkFlight.current = false;
      if (ownsPage(epoch)) setChecking(false);
    }
  }
  async function remove(questionId: number) {
    if (removeFlight.current) return;
    const controller = new AbortController();
    const epoch = getPendingCommandEpoch();
    removeFlight.current = controller;
    setRemoving(questionId);
    setError(undefined);
    try {
      await removeReviewQueue(questionId, controller.signal);
      if (!ownsPage(epoch) || controller.signal.aborted) return;
      await client.invalidateQueries({ queryKey: ['learning', accountId, 'questions'] });
      if (ownsPage(epoch) && !controller.signal.aborted)
        setSelected((previous) => previous.filter((id) => id !== questionId));
    } catch (failure) {
      if (ownsPage(epoch) && !controller.signal.aborted) setError(errorMessage(failure));
    } finally {
      if (removeFlight.current === controller) removeFlight.current = null;
      if (ownsPage(epoch) && !controller.signal.aborted) setRemoving(undefined);
    }
  }
  async function retryPending() {
    const epoch = getPendingCommandEpoch();
    const response = await actions.retryPending();
    if (response && ownsPage(epoch))
      navigate(
        `/student/learning/sessions/${response.kind === 'ANSWER' ? response.sessionId : response.view.sessionId}`,
      );
  }
  const message =
    error ??
    actions.error ??
    (questions.error
      ? errorMessage(questions.error)
      : status.error
        ? errorMessage(status.error)
        : undefined);
  const active = status.data?.activeSession;
  return (
    <>
      {questions.isPending ? <p role="status">문제를 불러오고 있어요</p> : null}
      {message ? (
        <div className="learning-error">
          <p role="alert">{message}</p>
          <button
            className="secondary"
            disabled={questions.isFetching || status.isFetching || actions.busy || checking}
            onClick={() => void Promise.all([questions.refetch(), status.refetch()])}
          >
            목록 다시 불러오기
          </button>
        </div>
      ) : null}
      {active ? (
        <Link
          className="button secondary learning-recovery"
          to={`/student/learning/sessions/${active.sessionId}`}
        >
          진행 중인 학습 이어풀기
        </Link>
      ) : null}
      {questions.isSuccess && !rows.length ? (
        <div className="learning-empty">
          <h2>
            {filter === 'BOOKMARKED'
              ? '아직 별표한 문제가 없어요.'
              : filter === 'MASTERED'
                ? '아직 복습을 완료한 문제가 없어요.'
                : '다시 볼 문제가 없어요.'}
          </h2>
          <p>
            {filter === 'BOOKMARKED'
              ? '학습 해설이나 나의 문제에서 ☆ 별표를 누르면 여기에 모여요.'
              : filter === 'MASTERED'
                ? '다시 볼 문제를 선택해 복습하면 완료한 문제를 여기서 볼 수 있어요.'
                : '학습을 시작해 보세요. 다시 살펴볼 문제는 여기에 모아 둘게요.'}
          </p>
          {filter === 'MASTERED' ? (
            <Link to="/student/questions?filter=REVIEW_QUEUE" className="button secondary">
              다시 볼 문제로
            </Link>
          ) : null}
        </div>
      ) : null}
      {rows.length ? (
        <div className="learning-list-toolbar">
          <p>
            {filters[filter]} <strong>{rows.length}개</strong>
          </p>
          {reviewIds.length ? (
            <button
              className="secondary"
              disabled={blocked || removing !== undefined}
              onClick={() => setSelected(allSelected ? [] : reviewIds)}
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          ) : null}
        </div>
      ) : null}
      {rows.length ? (
        <ul className="learning-question-list" aria-label="개인 문제 목록">
          {rows.map((row) => (
            <li className="learning-card" key={row.questionId}>
              <div className="learning-personal-heading">
                <h2>
                  {row.dayNumber}회차 · 문항 {row.position}
                </h2>
                {row.inReviewQueue ? (
                  <label className="learning-select">
                    <input
                      type="checkbox"
                      aria-label="복습할 문제 선택"
                      checked={selected.includes(row.questionId)}
                      disabled={checking || actions.busy || removing !== undefined}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, row.questionId]
                            : previous.filter((id) => id !== row.questionId),
                        )
                      }
                    />
                    복습 선택
                  </label>
                ) : null}
              </div>
              <p className="learning-personal-text">{row.text}</p>
              <p className="learning-question-status">
                최근 결과:{' '}
                {row.lastOutcome === null ? '미답변' : lastOutcomeLabels[row.lastOutcome]}
              </p>
              <p className="learning-question-status">
                {row.mastered ? '복습 완료' : '복습 미완료'}
                {row.inReviewQueue ? ' · 다시 볼 목록에 있어요' : ''}
              </p>
              <div className="learning-question-actions">
                <QuestionFeedbackActions questionId={row.questionId} result={null} />
                {row.inReviewQueue ? (
                  <button
                    className="secondary"
                    aria-label="다시 볼 목록에서 제거"
                    disabled={
                      removing !== undefined || actions.busy || checking || questions.isError
                    }
                    onClick={() => void remove(row.questionId)}
                  >
                    목록에서 빼기
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {reviewIds.length ? (
        <div className="learning-selection">
          <p aria-live="polite">선택한 문제 {selectedIds.length}개</p>
          <button
            disabled={blocked || removing !== undefined || !!active || !selectedIds.length}
            onClick={() => void startReview()}
          >
            선택한 문제 복습하기
          </button>
        </div>
      ) : null}
      {checking || actions.busy ? <p role="status">최신 복습 상태를 확인하고 있어요</p> : null}
      {actions.pendingCommand ? (
        <div className="learning-pending">
          <p>이전 요청의 결과가 아직 확인되지 않았어요. 같은 요청으로 다시 확인해 주세요.</p>
          <button
            className="secondary"
            disabled={actions.busy || checking}
            onClick={() => void retryPending()}
          >
            같은 요청 다시 확인
          </button>
        </div>
      ) : null}
    </>
  );
}
