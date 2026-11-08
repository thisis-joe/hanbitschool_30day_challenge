import { useCurrentAccount } from '../auth/queries';
import { errorMessage } from '../../lib/http';
import { useRouteHeadingFocus } from '../../lib/useRouteHeadingFocus';
import { useGame, useJourney } from './queries';
import { JourneyMap } from './JourneyMap';

export function JourneyMapPage() {
  const { data: account } = useCurrentAccount();
  const owner = account?.role === 'STUDENT' ? account.accountId : undefined;
  const journey = useJourney();
  const game = useGame();
  const heading = useRouteHeadingFocus(owner, !!journey.data);
  return (
    <section className="learning-page game-journey-page game-exploration-page">
      <div className="game-home-intro">
        <p className="learning-eyebrow">
          {account?.role === 'STUDENT' ? `${account.nickname}의 여행` : '30회차 여행'}
        </p>
        <h1 ref={heading} tabIndex={-1}>
          탐험 지도
        </h1>
        <p>숲에서 등대까지, 지금까지 걸어온 길을 둘러보세요.</p>
      </div>
      {journey.isPending ? <p role="status">탐험 지도를 불러오고 있어요.</p> : null}
      {journey.isError ? (
        <div className="learning-error">
          <p role="alert">{errorMessage(journey.error)}</p>
          <button onClick={() => void journey.refetch()}>지도 다시 불러오기</button>
        </div>
      ) : null}
      {journey.data ? (
        <JourneyMap
          owner={owner}
          journey={journey.data}
          appearance={game.isError ? undefined : game.data}
        />
      ) : null}
    </section>
  );
}
