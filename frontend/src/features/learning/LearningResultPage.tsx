import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, HttpError } from '../../lib/http';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { useLearningSession, useLearningStatus } from './queries';
import { useLearningActions } from './useLearningActions';
import { getPendingCommandEpoch, subscribePendingCommandCleanup } from './pendingCommands';
import type { LearningStatus } from './types';
import { useGame, useJourney } from '../game/queries';
import { useAppearance } from '../game/useAppearance';
import { RewardCard } from '../game/RewardCard';
import { LearningGameScene } from '../game/LearningGameScene';
import { GameAvatar } from '../game/GameAvatar';

function availableDay(status: LearningStatus): number | null {
  const day = status.earliestUnpassedDay;
  return day !== null && Number.isInteger(day) && day >= 1 && day <= 30 && day <= status.calendarCap
    ? day
    : null;
}

const statusMessages = {
  WAIT_FOR_START_DATE: '학습 시작일을 기다리고 있어요.',
  WAIT_FOR_NEXT_DAY: '다음 회차는 다음 학습 날짜에 열려요.',
  COURSE_COMPLETE: '30회차 학습을 모두 마쳤어요.',
};
interface ResultCheck {
  owner: string;
  epoch: number;
}

export function LearningResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const client = useQueryClient();
  const account = useCurrentAccount();
  const session = useLearningSession(sessionId);
  const status = useLearningStatus();
  const actions = useLearningActions(session.data);
  const game = useGame();
  const journey = useJourney();
  const appearance = useAppearance();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const activeCheck = useRef<ResultCheck | null>(null);
  const [checking, setChecking] = useState<ResultCheck | null>(null);
  const accountId = account.data?.role === 'STUDENT' ? account.data.accountId : undefined;
  const view = session.data;
  const result = view?.lastAnswer;
  const gift = result?.rewardGranted;
  const savedAppearance = game.isError ? undefined : game.data;
  const giftItem = gift
    ? savedAppearance?.items.find((item) => item.itemId === gift.itemId)
    : undefined;
  const giftOwned = giftItem
    ? game.data?.inventory.some((item) => item.itemId === giftItem.itemId && item.owned) === true
    : false;
  const isChecking =
    checking !== null &&
    checking.owner === accountId &&
    checking.epoch === getPendingCommandEpoch();

  useEffect(() => {
    heading.current?.focus();
  }, [accountId, view?.sessionId, view?.state, result?.attemptAnswerId]);

  useEffect(() => {
    mounted.current = true;
    const reset = () => {
      activeCheck.current = null;
      setChecking(null);
    };
    reset();
    const unsubscribe = subscribePendingCommandCleanup(reset);
    return () => {
      mounted.current = false;
      activeCheck.current = null;
      unsubscribe();
    };
  }, [accountId]);

  function ownsPage(epoch: number) {
    const current = client.getQueryData<AccountMe | null>(meKey);
    return (
      mounted.current &&
      epoch === getPendingCommandEpoch() &&
      current?.role === 'STUDENT' &&
      current.accountId === accountId
    );
  }
  function ownsCheck(check: ResultCheck) {
    return activeCheck.current === check && check.owner === accountId && ownsPage(check.epoch);
  }

  async function nextLearning() {
    if (!accountId || activeCheck.current || actions.busy || actions.pendingCommand) return;
    const check: ResultCheck = { owner: accountId, epoch: getPendingCommandEpoch() };
    activeCheck.current = check;
    setChecking(check);
    try {
      const fresh = await status.refetch();
      if (!ownsCheck(check) || fresh.error || !fresh.data) return;
      if (fresh.data.activeSession) {
        navigate(`/student/learning/sessions/${fresh.data.activeSession.sessionId}`);
        return;
      }
      const day = availableDay(fresh.data);
      if (!day || !['START_FIRST', 'START_REPLAY'].includes(fresh.data.nextAction)) return;
      const started = await actions.start({
        mode: fresh.data.nextAction === 'START_REPLAY' ? 'REPLAY' : 'FIRST',
        dayNumber: day,
        questionIds: null,
      });
      if (started && ownsCheck(check)) navigate(`/student/learning/sessions/${started.sessionId}`);
    } finally {
      if (activeCheck.current === check) {
        activeCheck.current = null;
        setChecking((current) => (current === check ? null : current));
      }
    }
  }

  async function retryPending() {
    const epoch = getPendingCommandEpoch();
    const response = await actions.retryPending();
    if (!response || !ownsPage(epoch)) return;
    navigate(
      `/student/learning/sessions/${response.kind === 'ANSWER' ? response.sessionId : response.view.sessionId}`,
    );
  }

  if (account.isSuccess && !account.data) return <Navigate replace to="/login" />;
  if (account.data && account.data.role !== 'STUDENT')
    return <Navigate replace to="/staff/classrooms" />;
  const queryError = session.error ?? account.error;
  if (queryError instanceof HttpError && queryError.status === 401)
    return <Navigate replace to="/login" />;
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
  if (view && view.state !== 'COMPLETED')
    return <Navigate replace to={`/student/learning/sessions/${view.sessionId}`} />;
  const error =
    actions.error ??
    (queryError ? errorMessage(queryError) : status.error ? errorMessage(status.error) : undefined);
  if (!view && !error)
    return (
      <p className="learning-page" role="status">
        결과를 불러오고 있어요
      </p>
    );
  const replayKeepsPass =
    view?.mode === 'REPLAY' &&
    result?.dayState === 'PASSED' &&
    result.attemptState === 'RETRY_REQUIRED';
  const title =
    view?.mode === 'REVIEW'
      ? '복습 풀이를 마쳤어요'
      : replayKeepsPass
        ? '재학습 완료'
        : result?.attemptState === 'PASSED'
          ? '회차 통과'
          : '다시 도전해요';
  const next = status.data;
  const canStart =
    next &&
    !next.activeSession &&
    availableDay(next) !== null &&
    ['START_FIRST', 'START_REPLAY'].includes(next.nextAction);
  const canContinue = next?.activeSession != null;
  const pending = actions.pendingCommand;
  const retryLabel =
    pending?.kind === 'ANSWER'
      ? '같은 답변 다시 확인'
      : pending?.kind === 'ADVANCE'
        ? '같은 다음 문제 다시 확인'
        : '같은 학습 시작 다시 확인';

  return (
    <section className="learning-page game-learning-page game-learning-result">
      {error ? (
        <div className="learning-error">
          <p role="alert">{error}</p>
          <button
            className="secondary"
            disabled={session.isFetching || status.isFetching || actions.busy}
            onClick={() => void Promise.all([session.refetch(), status.refetch()])}
          >
            최신 상태 다시 불러오기
          </button>
        </div>
      ) : null}
      {next?.activeSession ? (
        <Link
          className="button secondary learning-recovery"
          to={`/student/learning/sessions/${next.activeSession.sessionId}`}
        >
          진행 중인 학습 이어풀기
        </Link>
      ) : null}
      {view && result ? (
        <div className="learning-card learning-result">
          <p className="learning-eyebrow">
            {view.mode === 'REVIEW' ? '선택 복습 결과' : `${view.dayNumber}회차 결과`}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <LearningGameScene
            key={accountId}
            appearance={savedAppearance}
            journey={journey.isError ? undefined : journey.data}
            outcome={result.outcome}
          />
          {game.isError ? (
            <div className="learning-error">
              <p role="alert">
                여행 친구와 선물 정보를 불러오지 못했어요. {errorMessage(game.error)}
              </p>
              <button disabled={game.isFetching} onClick={() => void game.refetch()}>
                여행 친구 다시 불러오기
              </button>
            </div>
          ) : null}
          {journey.isError ? (
            <div className="learning-error">
              <p role="alert">여정 정보를 불러오지 못했어요. {errorMessage(journey.error)}</p>
              <button disabled={journey.isFetching} onClick={() => void journey.refetch()}>
                지도 다시 불러오기
              </button>
            </div>
          ) : null}
          {view.mode === 'REVIEW' ? (
            <p>문항별 복습 상태는 나의 문제에서 확인해 주세요.</p>
          ) : replayKeepsPass ? (
            <p>이 회차의 통과 상태는 그대로 유지돼요.</p>
          ) : result.attemptState === 'PASSED' ? (
            <p>회차 통과가 저장되었어요.</p>
          ) : (
            <p>다섯 문항을 다시 풀며 3문항 이상 정답에 도전해요.</p>
          )}
          <dl className="learning-result-stats">
            <div>
              <dt>이번 정답 수</dt>
              <dd>
                {result.attemptCorrectCount} / {result.attemptAnsweredCount}
              </dd>
            </div>
            <div>
              <dt>누적 경험치</dt>
              <dd>{result.totalXp} XP</dd>
            </div>
            <div>
              <dt>현재 레벨</dt>
              <dd>레벨 {result.level}</dd>
            </div>
          </dl>
          {gift ? (
            <div className="learning-saved-gift">
              <p className="learning-eyebrow">새 선물</p>
              {giftItem ? (
                <RewardCard
                  owner={accountId}
                  acquisitionId={`${gift.itemId}:${gift.acquiredAt}`}
                  contentVersion={savedAppearance?.contentVersion ?? ''}
                  preview={
                    savedAppearance ? (
                      <section className="learning-gift-preview" aria-label="선물 착용 미리보기">
                        <GameAvatar
                          characterId={savedAppearance.characterId}
                          equippedBySlot={{
                            ...savedAppearance.equippedBySlot,
                            [giftItem.slot]: giftItem.itemId,
                          }}
                        />
                        <div>
                          <h2>선물 착용 미리보기</h2>
                          <p>미리보기예요. 지금 착용하기를 누르면 저장돼요.</p>
                          {savedAppearance.characterId === null ? (
                            <p>캐릭터 미선택 상태의 하루 미리보기예요.</p>
                          ) : null}
                        </div>
                      </section>
                    ) : null
                  }
                  item={giftItem}
                  owned={giftOwned}
                  wearLabel="지금 착용하기"
                  wearDisabled={
                    appearance.busy || actions.busy || !!actions.pendingCommand || game.isError
                  }
                  onWear={
                    giftOwned
                      ? () => {
                          const saved = game.data;
                          if (saved)
                            void appearance.save(saved.characterId, {
                              ...saved.equippedBySlot,
                              [giftItem.slot]: giftItem.itemId,
                            });
                        }
                      : undefined
                  }
                />
              ) : game.isError ? (
                <p>다시 불러오면 저장된 선물을 확인할 수 있어요.</p>
              ) : game.isPending ? (
                <p>저장된 선물 정보를 불러오고 있어요.</p>
              ) : (
                <p>저장된 선물 정보를 확인할 수 없어요. 옷장에서 보유 장비를 확인해 주세요.</p>
              )}
              {appearance.busy ? <p role="status">외형을 저장하고 있어요</p> : null}
              {appearance.error ? <p role="alert">{appearance.error}</p> : null}
            </div>
          ) : null}
          <div className="learning-next">
            {status.isPending ? <p role="status">다음 학습을 확인하고 있어요</p> : null}
            {next && next.nextAction in statusMessages && !canContinue ? (
              <p>{statusMessages[next.nextAction as keyof typeof statusMessages]}</p>
            ) : null}
            {canContinue || canStart ? (
              <button
                disabled={actions.busy || !!pending || isChecking || status.isError}
                onClick={() => void nextLearning()}
              >
                {canContinue
                  ? '이어풀기'
                  : next?.nextAction === 'START_REPLAY'
                    ? '다시 도전하기'
                    : '다음 회차 시작'}
              </button>
            ) : null}
            {next &&
            ['START_FIRST', 'START_REPLAY', 'CONTINUE_SESSION'].includes(next.nextAction) &&
            !canContinue &&
            !canStart ? (
              <p>지금은 이 회차를 시작할 수 없어요. 학습 홈에서 확인해 주세요.</p>
            ) : null}
            {isChecking || actions.busy ? <p role="status">다음 학습을 확인하고 있어요</p> : null}
          </div>
        </div>
      ) : view ? (
        <p role="alert">완료 결과를 확인할 수 없어요. 최신 상태를 다시 불러와 주세요.</p>
      ) : null}
      {!view && actions.busy ? <p role="status">이전 요청을 확인하고 있어요</p> : null}
      {pending ? (
        <div className="learning-pending">
          <p>이전 요청의 결과가 아직 확인되지 않았어요. 같은 요청으로 다시 확인해 주세요.</p>
          <button
            className="secondary"
            disabled={actions.busy || isChecking}
            onClick={() => void retryPending()}
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
      <div className="learning-result-links">
        <Link className="button secondary" to="/student/learning">
          학습 홈으로
        </Link>
        <Link className="button secondary" to="/student/questions?filter=REVIEW_QUEUE">
          나의 문제 보기
        </Link>
      </div>
    </section>
  );
}
