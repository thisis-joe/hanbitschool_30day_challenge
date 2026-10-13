import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCurrentAccount } from '../auth/queries';
import { getPendingCommandEpoch } from '../learning/pendingCommands';
import { errorMessage } from '../../lib/http';
import { useRouteHeadingFocus } from '../../lib/useRouteHeadingFocus';
import { GameAvatar } from './GameAvatar';
import { EquipmentIcon } from './EquipmentIcon';
import { useGame } from './queries';
import { useAppearance } from './useAppearance';
import { CHARACTER_NAMES, SLOTS } from './types';

const slotNames = {
  face: '얼굴',
  hat: '모자',
  top: '상의',
  bottom: '하의',
  shoes: '신발',
  hand: '손',
};
interface Preview {
  owner: string;
  epoch: number;
  route: string;
  itemId: string;
}

export function ClosetPage() {
  const game = useGame();
  const appearance = useAppearance();
  const { data: account } = useCurrentAccount();
  const owner = account?.role === 'STUDENT' ? account.accountId : undefined;
  const location = useLocation();
  const [preview, setPreview] = useState<Preview | null>(null);
  const view = game.data;
  const heading = useRouteHeadingFocus(owner, !!view);
  const currentPreview =
    preview &&
    preview.owner === owner &&
    preview.epoch === getPendingCommandEpoch() &&
    preview.route === location.key
      ? preview
      : null;
  const item = currentPreview
    ? view?.items.find(
        (option) => option.itemId === currentPreview.itemId && SLOTS.includes(option.slot),
      )
    : undefined;
  const owned = item
    ? view?.inventory.some((entry) => entry.itemId === item.itemId && entry.owned)
    : false;
  const equipment =
    view && item ? { ...view.equippedBySlot, [item.slot]: item.itemId } : view?.equippedBySlot;
  const gearNames = equipment
    ? SLOTS.map((slot) => view?.items.find((entry) => entry.itemId === equipment[slot])?.name)
        .filter(Boolean)
        .join(', ')
    : '';
  const label = `${view?.characterId ? CHARACTER_NAMES[view.characterId] : '캐릭터 미선택 (하루 미리보기)'} · ${gearNames || '기본 모습'}`;

  return (
    <section className="learning-page game-closet-page">
      <div className="learning-card game-closet-card">
        <h1 ref={heading} tabIndex={-1}>
          나의 옷장
        </h1>
        <p>회차를 처음 통과하면 장비를 모을 수 있어요. 미보유 장비도 미리 볼 수 있어요.</p>
        <nav className="game-page-nav" aria-label="꾸미기 메뉴">
          <Link to="/student/learning">학습 홈</Link> ·{' '}
          <Link to="/student/character">캐릭터 선택</Link>
        </nav>
        {game.isPending ? <p role="status">옷장을 불러오고 있어요.</p> : null}
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
            <section className="game-appearance-preview" aria-label="외형 미리보기">
              <GameAvatar characterId={view.characterId} equippedBySlot={equipment} label={label} />
              {item ? (
                <>
                  <p>
                    {item.name} · {owned ? '보유' : `미보유 · ${item.rewardDay}회차 첫 통과로 획득`}
                  </p>
                  {owned ? (
                    <button
                      style={{ minHeight: 48 }}
                      disabled={appearance.busy}
                      onClick={() => {
                        const intent = currentPreview;
                        void appearance
                          .save(view.characterId, {
                            ...view.equippedBySlot,
                            [item.slot]: item.itemId,
                          })
                          .then((saved) => {
                            if (saved)
                              setPreview((current) => (current === intent ? null : current));
                          });
                      }}
                    >
                      착용하기
                    </button>
                  ) : null}
                  <button style={{ minHeight: 48 }} onClick={() => setPreview(null)}>
                    미리보기 취소
                  </button>
                </>
              ) : (
                <p>저장된 모습이에요.</p>
              )}
            </section>
            {SLOTS.map((slot) => (
              <section key={slot} className="game-closet-slot" aria-label={slotNames[slot]}>
                <h2>{slotNames[slot]}</h2>
                <button
                  className="game-base-option"
                  style={{ minHeight: 48 }}
                  disabled={appearance.busy}
                  onClick={() => {
                    setPreview(null);
                    void appearance.save(view.characterId, {
                      ...view.equippedBySlot,
                      [slot]: null,
                    });
                  }}
                >
                  {slotNames[slot]} 기본 모습
                </button>
                <div
                  className="game-wardrobe-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))',
                    gap: 12,
                  }}
                >
                  {view.items
                    .filter((entry) => entry.slot === slot)
                    .map((entry) => {
                      const hasItem = view.inventory.some(
                        (inventory) => inventory.itemId === entry.itemId && inventory.owned,
                      );
                      return (
                        <button
                          key={entry.itemId}
                          className={`game-item-option${hasItem ? '' : ' game-item-locked'}`}
                          style={{ minHeight: 48, minWidth: 0, overflowWrap: 'anywhere' }}
                          aria-label={`${entry.name} 미리보기`}
                          aria-pressed={item?.itemId === entry.itemId}
                          onClick={() =>
                            owner &&
                            setPreview({
                              owner,
                              epoch: getPendingCommandEpoch(),
                              route: location.key,
                              itemId: entry.itemId,
                            })
                          }
                        >
                          <span
                            className="game-item-art"
                            style={{
                              display: 'block',
                              filter: hasItem ? undefined : 'grayscale(1) blur(1px)',
                            }}
                          >
                            <EquipmentIcon itemId={entry.itemId} slot={slot} />
                          </span>
                          <span style={{ display: 'block' }}>{entry.name}</span>
                          <span style={{ display: 'block' }}>
                            {hasItem
                              ? view.equippedBySlot[slot] === entry.itemId
                                ? '착용 중'
                                : '보유'
                              : `미보유 · ${entry.rewardDay}회차 첫 통과`}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </section>
            ))}
          </>
        ) : null}
        {appearance.busy ? <p role="status">외형을 저장하고 있어요.</p> : null}
        {appearance.error ? <p role="alert">{appearance.error}</p> : null}
      </div>
    </section>
  );
}
