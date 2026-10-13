import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/http';
import { GameAvatar } from './GameAvatar';
import { useGame } from './queries';
import { useAppearance } from './useAppearance';
import { CHARACTER_IDS, CHARACTER_NAMES } from './types';

export function CharacterSelectionPage() {
  const game = useGame();
  const appearance = useAppearance();
  const view = game.data;
  return (
    <section className="learning-page game-character-page">
      <div className="learning-card game-character-card">
        <h1>캐릭터 선택</h1>
        <p>함께 배울 친구를 골라 주세요. 모은 장비는 그대로 입고 있어요.</p>
        <nav className="game-page-nav" aria-label="꾸미기 메뉴">
          <Link to="/student/learning">학습 홈</Link> · <Link to="/student/closet">옷장</Link>
        </nav>
        {game.isPending ? <p role="status">캐릭터를 불러오고 있어요.</p> : null}
        {game.error ? (
          <>
            <p role="alert">{errorMessage(game.error)}</p>
            <button onClick={() => void game.refetch()} style={{ minHeight: 48 }}>
              다시 시도
            </button>
          </>
        ) : null}
        {view ? (
          <>
            <p role="status">
              {view.characterId
                ? `지금 함께하는 친구: ${CHARACTER_NAMES[view.characterId]}`
                : '아직 친구를 선택하지 않았어요.'}
            </p>
            <div
              className="game-character-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))',
                gap: 16,
              }}
            >
              {CHARACTER_IDS.filter((id) => view.characters.some((option) => option.id === id)).map(
                (id) => (
                  <button
                    key={id}
                    className="game-character-option"
                    aria-label={`${CHARACTER_NAMES[id]} 선택`}
                    aria-pressed={view.characterId === id}
                    disabled={appearance.busy}
                    style={{ minHeight: 48, minWidth: 0 }}
                    onClick={() => void appearance.save(id, view.equippedBySlot)}
                  >
                    <GameAvatar characterId={id} equippedBySlot={view.equippedBySlot} />
                    <span style={{ display: 'block' }}>{CHARACTER_NAMES[id]}</span>
                  </button>
                ),
              )}
            </div>
          </>
        ) : null}
        {appearance.busy ? <p role="status">친구를 저장하고 있어요.</p> : null}
        {appearance.error ? <p role="alert">{appearance.error}</p> : null}
      </div>
    </section>
  );
}
