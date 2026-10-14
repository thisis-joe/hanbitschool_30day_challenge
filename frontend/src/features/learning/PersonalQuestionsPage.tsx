import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { errorMessage } from '../../lib/http';
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
  return (
    <section className="learning-page game-personal-page">
      <h1>나의 문제</h1>
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
      {questions.isSuccess && !rows.length ? <p>이 목록에 아직 문제가 없어요.</p> : null}
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
                    복습할 문제 선택
                  </label>
                ) : null}
              </div>
              <p className="learning-personal-text">{row.text}</p>
              <p>
                최근 결과:{' '}
                {row.lastOutcome === null ? '미답변' : lastOutcomeLabels[row.lastOutcome]}
              </p>
              <p>
                {row.mastered ? '복습 완료' : '복습 미완료'}
                {row.inReviewQueue ? ' · 다시 볼 목록에 있어요' : ''}
              </p>
              <QuestionFeedbackActions questionId={row.questionId} result={null} />
              {row.inReviewQueue ? (
                <button
                  className="secondary"
                  disabled={removing !== undefined || actions.busy || checking || questions.isError}
                  onClick={() => void remove(row.questionId)}
                >
                  다시 볼 목록에서 제거
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="learning-selection">
        <p>선택한 문제 {selectedIds.length}개</p>
        <button
          disabled={blocked || removing !== undefined || !!active || !selectedIds.length}
          onClick={() => void startReview()}
        >
          선택한 문제 복습하기
        </button>
      </div>
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
