import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { meKey, useCurrentAccount } from '../auth/queries';
import type { AccountMe } from '../auth/types';
import { errorMessage } from '../../lib/http';
import { useRouteHeadingFocus } from '../../lib/useRouteHeadingFocus';
import { getPendingCommandEpoch, subscribePendingCommandCleanup } from './pendingCommands';
import { useLearningStatus } from './queries';
import { useLearningActions } from './useLearningActions';
import type { LearningMode } from './types';
import { useGame, useJourney } from '../game/queries';
import { GameAvatar } from '../game/GameAvatar';
import { useSceneGround } from '../game/useSceneGround';
import { RewardCard } from '../game/RewardCard';
import { REGIONS } from '../game/journeyGeometry';

const messages = {
  WAIT_FOR_START_DATE: '학습 시작일을 기다리고 있어요.',
  WAIT_FOR_NEXT_DAY: '다음 회차는 다음 학습 날짜에 열려요.',
  COURSE_COMPLETE: '30회차 학습을 모두 마쳤어요.',
};
interface HomeCheck {
  owner: string;
  epoch: number;
}

export function LearningDashboardPage() {
  const { data: account } = useCurrentAccount();
  const accountId = account?.role === 'STUDENT' ? account.accountId : undefined;
  const status = useLearningStatus();
  const actions = useLearningActions();
  const game = useGame();
  const journey = useJourney();
  const client = useQueryClient();
  const navigate = useNavigate();
  const mounted = useRef(false);
  const activeCheck = useRef<HomeCheck | null>(null);
  const [checking, setChecking] = useState<HomeCheck | null>(null);
  const [replayDay, setReplayDay] = useState(1);
  useEffect(() => {
    mounted.current = true;
    const reset = () => {
      activeCheck.current = null;
      setChecking(null);
      setReplayDay(1);
    };
    reset();
    const unsubscribe = subscribePendingCommandCleanup(reset);
    return () => {
      mounted.current = false;
      activeCheck.current = null;
      unsubscribe();
    };
  }, [accountId]);
  const view = status.data;
  const isChecking =
    checking !== null &&
    checking.owner === accountId &&
    checking.epoch === getPendingCommandEpoch();
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
  function ownsCheck(check: HomeCheck) {
    return activeCheck.current === check && check.owner === accountId && ownsPage(check.epoch);
  }
  async function startDay(day: number, mode: LearningMode) {
    if (!accountId || activeCheck.current || blocked || view?.activeSession) return;
    const check: HomeCheck = { owner: accountId, epoch: getPendingCommandEpoch() };
    activeCheck.current = check;
    setChecking(check);
    try {
      const fresh = await status.refetch();
      if (!ownsCheck(check) || fresh.error || !fresh.data) return;
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
  const map = journey.isError ? undefined : journey.data;
  const appearance = game.isError ? undefined : game.data;
  const heading = useRouteHeadingFocus(accountId, !!view);
  const regionIndex = map ? Math.min(5, Math.floor(map.journeyPosition / 25)) : null;
  const reward = appearance?.items.find((item) => item.rewardDay === day);
  const primary = view?.activeSession ? (
    <Link className="button" to={`/student/learning/sessions/${view.activeSession.sessionId}`}>
      이어풀기
    </Link>
  ) : canStart ? (
    <button
      disabled={blocked}
      onClick={() => void startDay(day!, view!.nextAction === 'START_REPLAY' ? 'REPLAY' : 'FIRST')}
    >
      {view!.nextAction === 'START_REPLAY' ? '다시 도전하기' : '오늘 학습 시작'}
    </button>
  ) : null;
  const sceneRegion =
    regionIndex !== null && regionIndex >= 4
      ? 'beach'
      : regionIndex !== null && regionIndex >= 2
        ? 'village'
        : 'forest';
  const camp = useSceneGround<HTMLDivElement>(sceneRegion);
  return (
    <section className="learning-page game-journey-page game-home-page">
      <div className="game-home-intro">
        <p className="learning-eyebrow">
          {account?.role === 'STUDENT' ? `${account.nickname}의 배움` : '30회차 배움'}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          나의 학습
        </h1>
        <p>하루 5문항, 숲에서 등대까지 이어지는 30회차 여행</p>
      </div>
      <section className="learning-card game-camp" aria-label="오늘의 탐험">
        <div className="game-camp-copy">
          <p className="game-tag">
            {regionIndex === null ? '여행 준비' : REGIONS[regionIndex]}
            {day ? ` · ${day}회차` : ''}
          </p>
          <h2>오늘의 탐험</h2>
          {status.isPending ? <p role="status">학습을 불러오고 있어요</p> : null}
          {view ? (
            <>
              {primary}
              {!view.activeSession && view.nextAction in messages ? (
                <p>{messages[view.nextAction as keyof typeof messages]}</p>
              ) : null}
              {view.activeSession ? (
                <p>진행 중인 학습을 마친 뒤 다른 회차를 시작할 수 있어요.</p>
              ) : null}
            </>
          ) : null}
          <p>문장을 읽고 O · 사실, X · 해석을 골라 보세요.</p>
          {isChecking || actions.busy ? (
            <p role="status">최신 학습 상태를 확인하고 있어요</p>
          ) : null}
          {appearance?.characterId === null ? (
            <div className="game-character-guide">
              <p>아직 여행 친구를 선택하지 않았어요.</p>
              <Link className="button secondary" to="/student/character">
                캐릭터 선택하기
              </Link>
            </div>
          ) : null}
        </div>
        <div ref={camp} className={`game-camp-scene game-scene-${sceneRegion}`}>
          {appearance ? (
            <GameAvatar
              characterId={appearance.characterId}
              equippedBySlot={appearance.equippedBySlot}
              className="game-avatar-idle"
            />
          ) : game.isError ? (
            <div className="game-scene-fallback">
              <p role="alert">여행 친구를 불러오지 못했어요. {errorMessage(game.error)}</p>
              <button disabled={game.isFetching} onClick={() => void game.refetch()}>
                여행 친구 다시 불러오기
              </button>
            </div>
          ) : (
            <p>여행 친구를 불러오고 있어요.</p>
          )}
          <Link className="button game-signpost" to="/student/map">
            탐험 지도
          </Link>
        </div>
      </section>
      {journey.isError ? (
        <div className="learning-error">
          <p role="alert">여정 정보를 불러오지 못했어요. {errorMessage(journey.error)}</p>
          <button disabled={journey.isFetching} onClick={() => void journey.refetch()}>
            지도 다시 불러오기
          </button>
        </div>
      ) : null}
      {view ? (
        <dl className="learning-result-stats learning-home-stats game-home-stats">
          <div>
            <dt>통과한 회차</dt>
            <dd>{view.passedDayCount} / 30</dd>
          </div>
          <div>
            <dt>첫 답변한 문항</dt>
            <dd>{view.firstAnswerCount} / 150</dd>
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
      ) : null}
      <div className="game-home-under">
        {reward ? (
          <RewardCard
            owner={accountId}
            contentVersion={appearance!.contentVersion}
            appearance={appearance}
            item={reward}
            owned={appearance!.inventory.some(
              (item) => item.itemId === reward.itemId && item.owned,
            )}
          />
        ) : (
          <section className="game-reward-card">
            <p>회차를 처음 통과하면 여행 선물을 받아요.</p>
            <Link className="game-reward-fallback-link" to="/student/closet">
              옷장 둘러보기
            </Link>
          </section>
        )}
        <nav className="game-regions" aria-label="여행 지역">
          {REGIONS.map((name, index) => (
            <Link
              key={name}
              className={regionIndex !== null && index <= regionIndex ? 'game-region-reached' : ''}
              to="/student/map"
            >
              <span>{index + 1}</span>
              {name}
            </Link>
          ))}
        </nav>
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
      <Link
        className="button secondary learning-recovery"
        to="/student/questions?filter=REVIEW_QUEUE"
      >
        나의 문제 보기
      </Link>
      {view && view.passedDayCount > 0 ? (
        <details className="learning-replay-picker">
          <summary>지나온 배움 다시 풀기</summary>
          <div>
            <label htmlFor="replay-day">다시 풀 회차</label>
            <select
              id="replay-day"
              value={replayDay}
              disabled={blocked || !!view.activeSession}
              onChange={(event) => setReplayDay(Number(event.target.value))}
            >
              {Array.from({ length: Math.min(30, view.passedDayCount) }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}회차
                </option>
              ))}
            </select>
            <button
              className="secondary"
              disabled={blocked || !!view.activeSession || replayDay > view.passedDayCount}
              onClick={() => void startDay(replayDay, 'REPLAY')}
            >
              선택 회차 다시 풀기
            </button>
          </div>
        </details>
      ) : null}
    </section>
  );
}
