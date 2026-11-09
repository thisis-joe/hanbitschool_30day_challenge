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
      <h1 className="game-route-title" ref={heading} tabIndex={-1}>
        탐험 지도
      </h1>
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
