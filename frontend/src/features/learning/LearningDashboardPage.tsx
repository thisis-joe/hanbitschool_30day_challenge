import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { errorMessage } from '../../lib/http';
import { getPendingCommandEpoch } from './pendingCommands';
import { useLearningStatus } from './queries';
import { useLearningActions } from './useLearningActions';
import type { LearningMode } from './types';

const messages = {
  WAIT_FOR_START_DATE: '학습 시작일을 기다리고 있어요.',
  WAIT_FOR_NEXT_DAY: '다음 회차는 다음 학습 날짜에 열려요.',
  COURSE_COMPLETE: '30회차 학습을 모두 마쳤어요.',
};
const days = Array.from({ length: 30 }, (_, index) => index + 1);

export function LearningDashboardPage() {
  const { data: account } = useCurrentAccount();
  const accountId = account?.role === 'STUDENT' ? account.accountId : undefined;
  const status = useLearningStatus();
  const actions = useLearningActions();
  const client = useQueryClient();
  const navigate = useNavigate();
  const mounted = useRef(false);
  const checking = useRef(false);
  const [checkingOwner, setCheckingOwner] = useState<string>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const view = status.data;
  const isChecking = !!accountId && checkingOwner === accountId;
  const blocked =
    status.isPending || status.isError || actions.busy || !!actions.pendingCommand || isChecking;

  function ownsPage(epoch: number) {
    const current = client.getQueryData<AccountMe | null>(meKey);
    return (
      mounted.current &&
      epoch === getPendingCommandEpoch() &&
      current?.role === 'STUDENT' &&
      current.accountId === accountId
    );
  }
  async function startDay(day: number, mode: LearningMode) {
    if (!accountId || checking.current || blocked || view?.activeSession) return;
    const epoch = getPendingCommandEpoch();
    checking.current = true;
    setCheckingOwner(accountId);
    try {
      const fresh = await status.refetch();
      if (!ownsPage(epoch) || fresh.error || !fresh.data) return;
      if (fresh.data.activeSession) {
        navigate(`/student/learning/sessions/${fresh.data.activeSession.sessionId}`);
        return;
      }
      const passed = day <= fresh.data.passedDayCount;
      const available =
        day <= fresh.data.calendarCap && (passed || day === fresh.data.earliestUnpassedDay);
      if (
        !available ||
        (!passed && !['START_FIRST', 'START_REPLAY'].includes(fresh.data.nextAction))
      )
        return;
      const started = await actions.start({
        mode: passed ? 'REPLAY' : fresh.data.nextAction === 'START_REPLAY' ? 'REPLAY' : mode,
        dayNumber: day,
        questionIds: null,
      });
      if (started && ownsPage(epoch)) navigate(`/student/learning/sessions/${started.sessionId}`);
    } finally {
      checking.current = false;
      if (ownsPage(epoch)) setCheckingOwner(undefined);
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
  const error = actions.error ?? (status.error ? errorMessage(status.error) : undefined);
  const day = view?.earliestUnpassedDay;
  const canStart =
    view &&
    !view.activeSession &&
    day !== null &&
    day !== undefined &&
    day >= 1 &&
    day <= 30 &&
    day <= view.calendarCap &&
    ['START_FIRST', 'START_REPLAY'].includes(view.nextAction);
  return (
    <section className="learning-page">
      <div className="learning-card">
        <p className="learning-eyebrow">
          {account?.role === 'STUDENT' ? `${account.nickname}의 배움` : '30회차 배움'}
        </p>
        <h1>나의 학습</h1>
        <p>문장을 읽고 O · 사실, X · 해석을 골라 보세요.</p>
        {status.isPending ? <p role="status">학습을 불러오고 있어요</p> : null}
        {view ? (
          <>
            <dl className="learning-result-stats">
              <div>
                <dt>통과한 회차</dt>
                <dd>{view.passedDayCount} / 30</dd>
              </div>
              <div>
                <dt>누적 경험치</dt>
                <dd>{view.totalXp} XP</dd>
              </div>
              <div>
                <dt>현재 레벨</dt>
                <dd>레벨 {view.level}</dd>
              </div>
            </dl>
            {view.activeSession ? (
              <Link
                className="button"
                to={`/student/learning/sessions/${view.activeSession.sessionId}`}
              >
                이어풀기
              </Link>
            ) : canStart ? (
              <button
                disabled={blocked}
                onClick={() =>
                  void startDay(day!, view.nextAction === 'START_REPLAY' ? 'REPLAY' : 'FIRST')
                }
              >
                {view.nextAction === 'START_REPLAY' ? '다시 도전하기' : '오늘 학습 시작'}
              </button>
            ) : null}
            {!view.activeSession && view.nextAction in messages ? (
              <p>{messages[view.nextAction as keyof typeof messages]}</p>
            ) : null}
            {view.activeSession ? (
              <p>진행 중인 학습을 마친 뒤 다른 회차를 시작할 수 있어요.</p>
            ) : null}
          </>
        ) : null}
        {isChecking || actions.busy ? <p role="status">최신 학습 상태를 확인하고 있어요</p> : null}
      </div>
      {error ? (
        <div className="learning-error">
          <p role="alert">{error}</p>
          <button
            className="secondary"
            disabled={status.isFetching || actions.busy || isChecking}
            onClick={() => void status.refetch()}
          >
            최신 상태 다시 불러오기
          </button>
        </div>
      ) : null}
      {actions.pendingCommand ? (
        <div className="learning-pending">
          <p>이전 요청의 결과가 아직 확인되지 않았어요. 같은 요청으로 다시 확인해 주세요.</p>
          <button
            className="secondary"
            disabled={actions.busy || isChecking}
            onClick={() => void retryPending()}
          >
            같은 요청 다시 확인
          </button>
        </div>
      ) : null}
      {view ? (
        <ol className="learning-day-grid" aria-label="회차별 학습">
          {days.map((number) => {
            const passed = number <= view.passedDayCount;
            const dateLocked = number > view.calendarCap;
            const sequenceLocked = !passed && number !== view.earliestUnpassedDay;
            const actionLocked =
              !passed && !['START_FIRST', 'START_REPLAY'].includes(view.nextAction);
            return (
              <li className="learning-day-card" key={number}>
                <h2>{number}회차</h2>
                <p>
                  {passed
                    ? '통과'
                    : dateLocked
                      ? '학습 날짜를 기다려 주세요'
                      : sequenceLocked
                        ? '이전 회차를 먼저 통과해 주세요'
                        : '도전할 준비가 되었어요'}
                </p>
                <button
                  className="secondary"
                  aria-label={`${number}회차 ${passed ? '다시 풀기' : '시작하기'}`}
                  disabled={
                    blocked || !!view.activeSession || dateLocked || sequenceLocked || actionLocked
                  }
                  onClick={() => void startDay(number, passed ? 'REPLAY' : 'FIRST')}
                >
                  {passed ? '다시 풀기' : '시작하기'}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      <Link
        className="button secondary learning-recovery"
        to="/student/questions?filter=REVIEW_QUEUE"
      >
        나의 문제 보기
      </Link>
    </section>
  );
}
