import { useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useCurrentAccount } from '../auth/queries';
import { errorMessage, HttpError } from '../../lib/http';
import { useLearningSession, useLearningStatus } from './queries';
import { useLearningActions } from './useLearningActions';
import { useDeadlineCountdown } from './useDeadlineCountdown';
import { QuestionFeedbackActions } from './QuestionFeedbackActions';
import { useGame, useJourney } from '../game/queries';
import { AnswerGameScene } from '../game/AnswerGameScene';
import { ExperienceReward } from '../game/ExperienceReward';

const outcomes = {
  CORRECT: '정답이에요',
  WRONG: '오답이에요',
  TIMED_OUT: '시간이 초과되었어요',
};

export function LearningSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const session = useLearningSession(sessionId);
  const status = useLearningStatus();
  const actions = useLearningActions(session.data);
  const game = useGame();
  const journey = useJourney();
  const heading = useRef<HTMLHeadingElement>(null);
  const accountId = account.data?.role === 'STUDENT' ? account.data.accountId : undefined;
  const view = session.data;
  const question = view?.question;
  const { seconds, expired } = useDeadlineCountdown(
    question?.deadlineAt ?? '',
    question?.timeLimitSeconds ?? 0,
  );
  const active = view?.state === 'QUESTION_ACTIVE';
  const unavailable =
    session.error instanceof HttpError && [401, 404].includes(session.error.status);
  const waitingForServer = active && expired && !unavailable;
  const { refetch } = session;

  useEffect(() => {
    if (!accountId || !sessionId || unavailable) return;
    const refresh = () => void refetch({ cancelRefetch: false });
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [accountId, sessionId, unavailable, refetch]);

  useEffect(() => {
    if (!accountId || !sessionId || !waitingForServer) return;
    void refetch({ cancelRefetch: false });
    const timer = window.setInterval(() => void refetch({ cancelRefetch: false }), 1000);
    return () => window.clearInterval(timer);
  }, [accountId, sessionId, waitingForServer, refetch]);

  useEffect(() => {
    heading.current?.focus();
  }, [accountId, view?.state, question?.questionId, view?.lastAnswer?.attemptAnswerId]);

  useEffect(() => {
    if (!accountId || !active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '현재 문항의 제한시간은 계속 흘러요';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [accountId, active]);

  async function retryPending() {
    const result = await actions.retryPending();
    if (result && result.kind !== 'ANSWER')
      navigate(`/student/learning/sessions/${result.view.sessionId}`);
  }

  if (account.isSuccess && !account.data) return <Navigate replace to="/login" />;
  if (account.data && account.data.role !== 'STUDENT')
    return <Navigate replace to="/staff/classrooms" />;

  const queryError = session.error ?? account.error;
  if (!sessionId || (queryError instanceof HttpError && queryError.status === 404))
    return (
      <section className="learning-page learning-card">
        <h1>학습을 찾을 수 없어요</h1>
        <p role="alert">{queryError ? errorMessage(queryError) : '학습 주소를 확인해 주세요.'}</p>
        <Link className="button secondary" to="/student/learning">
          학습 홈으로
        </Link>
      </section>
    );
  if (queryError instanceof HttpError && queryError.status === 401)
    return <Navigate replace to="/login" />;
  const error =
    actions.error ??
    (queryError ? errorMessage(queryError) : status.error ? errorMessage(status.error) : undefined);
  if (!view && !error)
    return (
      <p className="learning-page" role="status">
        학습을 불러오고 있어요
      </p>
    );

  const feedback = !active ? view?.lastAnswer : null;
  const pending = actions.pendingCommand;
  const pendingChoice =
    pending?.kind === 'ANSWER' &&
    pending.sessionId === sessionId &&
    pending.command.questionId === question?.questionId
      ? pending.command.choice
      : undefined;
  const confirmedChoice =
    feedback?.outcome === 'CORRECT'
      ? feedback.correctChoice
      : feedback?.outcome === 'WRONG'
        ? feedback.correctChoice === 'O'
          ? 'X'
          : 'O'
        : undefined;
  const blocked = actions.busy || !!pending || session.isError;
  const retryLabel =
    pending?.kind === 'ANSWER'
      ? '같은 답변 다시 확인'
      : pending?.kind === 'ADVANCE'
        ? '같은 다음 문제 다시 확인'
        : '같은 학습 시작 다시 확인';
  const activeSession = status.data?.activeSession;

  return (
    <section className="learning-page game-learning-page">
      {error ? (
        <div className="learning-error">
          <p role="alert">{error}</p>
          <p>최신 상태를 다시 불러오거나 학습 홈에서 진행 중인 학습을 확인해 주세요.</p>
          <button
            className="secondary"
            disabled={session.isFetching || actions.busy}
            onClick={() => void Promise.all([session.refetch(), status.refetch()])}
          >
            최신 상태 다시 불러오기
          </button>
        </div>
      ) : null}
      {activeSession && activeSession.sessionId !== sessionId ? (
        <Link
          className="button secondary learning-recovery"
          to={`/student/learning/sessions/${activeSession.sessionId}`}
        >
          진행 중인 학습 이어풀기
        </Link>
      ) : null}
      {view ? (
        <div className="learning-card">
          <div className="learning-session-meta">
            <p className="learning-eyebrow">
              {view.mode === 'REVIEW'
                ? '선택 복습'
                : `${view.dayNumber}회차${view.mode === 'REPLAY' ? ' · 다시 풀기' : ''}`}
            </p>
            <p>
              답변 {view.answeredCount} / {view.questionCount}
            </p>
          </div>
          <progress
            className="learning-progress"
            aria-label="문항 진행"
            value={view.answeredCount}
            max={view.questionCount}
          />
          <AnswerGameScene
            key={`${accountId}:${sessionId}:${question?.questionId ?? feedback?.questionId}`}
            appearance={game.data}
            journey={journey.data}
            outcome={feedback?.outcome}
            choice={confirmedChoice ?? pendingChoice}
          />
          {active && question ? (
            <>
              <div className="learning-question-header">
                <h1 ref={heading} tabIndex={-1}>
                  문항 {question.position} / {view.questionCount}
                </h1>
                <time className="learning-timer" dateTime={question.deadlineAt}>
                  남은 시간 {seconds}초
                </time>
              </div>
              <p className="learning-source">{question.text}</p>
              <p className="learning-description">문장을 읽고 사실인지 해석인지 골라 주세요.</p>
              <div className="learning-choices" aria-label="사실 또는 해석 선택">
                <button
                  disabled={blocked || expired}
                  onClick={() => void actions.answer(view.sessionId, question.questionId, 'O')}
                >
                  O · 사실
                </button>
                <button
                  className="secondary"
                  disabled={blocked || expired}
                  onClick={() => void actions.answer(view.sessionId, question.questionId, 'X')}
                >
                  X · 해석
                </button>
              </div>
              {waitingForServer ? <p role="status">서버에서 답변을 확인하고 있어요</p> : null}
            </>
          ) : feedback ? (
            <div className="learning-feedback" data-outcome={feedback.outcome}>
              <h1 ref={heading} tabIndex={-1}>
                {outcomes[feedback.outcome]}
              </h1>
              <ExperienceReward
                owner={accountId}
                contentVersion={view.contentVersion}
                answer={feedback}
              />
              {question?.questionId === feedback.questionId ? (
                <p className="learning-source">{question.text}</p>
              ) : null}
              <p className="learning-correct-choice">
                정답은 {feedback.correctChoice === 'O' ? 'O · 사실' : 'X · 해석'}
              </p>
              <p className="learning-explanation">{feedback.explanation}</p>
              <QuestionFeedbackActions questionId={feedback.questionId} result={feedback} />
              {view.state === 'COMPLETED' ? (
                <Link
                  className="button learning-completion"
                  to={`/student/learning/sessions/${view.sessionId}/result`}
                  aria-disabled={blocked}
                  onClick={(event) => {
                    if (blocked) event.preventDefault();
                  }}
                >
                  완료하기
                </Link>
              ) : (
                <button disabled={blocked} onClick={() => void actions.advance(view.sessionId)}>
                  다음 문제
                </button>
              )}
            </div>
          ) : (
            <p role="alert">현재 문항을 확인할 수 없어요. 최신 상태를 다시 불러와 주세요.</p>
          )}
        </div>
      ) : null}
      {actions.busy ? (
        <p role="status">
          {pending?.kind === 'ANSWER'
            ? '답변을 확인하고 있어요'
            : pending?.kind === 'ADVANCE'
              ? '다음 문제를 불러오고 있어요'
              : '학습을 확인하고 있어요'}
        </p>
      ) : null}
      {pending ? (
        <div className="learning-pending">
          <p>이전 요청의 결과가 아직 확인되지 않았어요. 같은 요청으로 다시 확인해 주세요.</p>
          <button className="secondary" disabled={actions.busy} onClick={() => void retryPending()}>
            {retryLabel}
          </button>
        </div>
      ) : null}
      <div className="learning-exit">
        {active ? <p>현재 문항의 제한시간은 계속 흘러요</p> : null}
        <Link className="button secondary" to="/student/learning">
          학습 홈으로
        </Link>
      </div>
    </section>
  );
}
