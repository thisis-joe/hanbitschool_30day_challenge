import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCurrentAccount } from '../auth/queries';
import { getPendingCommandEpoch } from '../learning/pendingCommands';
import { errorMessage } from '../../lib/http';
import { useRouteHeadingFocus } from '../../lib/useRouteHeadingFocus';
import { GameAvatar } from './GameAvatar';
import { EquipmentCategoryIcon, EquipmentIcon } from './EquipmentIcon';
import { useGame } from './queries';
import { useAppearance } from './useAppearance';
import { CHARACTER_NAMES, SLOTS } from './types';
import type { Slot } from './types';

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
  const [selectedSlot, setSelectedSlot] = useState<Slot>('face');
  const previewPanel = useRef<HTMLElement>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const restorePreviewFocus = useRef(false);
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
  useEffect(() => {
    if (!item) {
      if (restorePreviewFocus.current) {
        restorePreviewFocus.current = false;
        previewTrigger.current?.focus();
      }
      return;
    }
    if (!window.matchMedia?.('(max-width: 720px)').matches) return;
    previewPanel.current?.scrollIntoView({ block: 'start' });
    previewPanel.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [item]);

  function closePreview() {
    restorePreviewFocus.current = true;
    setPreview(null);
  }

  return (
    <section className="learning-page game-closet-page">
      <div className="learning-card game-closet-card">
        <h1 ref={heading} tabIndex={-1}>
          나의 옷장
        </h1>
        <p>회차를 처음 통과하면 장비를 모을 수 있어요. 미보유 장비도 미리 볼 수 있어요.</p>
        <nav className="game-page-nav" aria-label="꾸미기 메뉴">
          <Link to="/student/learning">학습 홈</Link>
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
          <div className="game-wardrobe-studio">
            <div className="game-wardrobe-left">
              <section
                ref={previewPanel}
                className="game-appearance-preview"
                aria-label="외형 미리보기"
              >
                <div className="game-wardrobe-room">
                  <span className="game-tag">{item ? '미리 입어보는 중' : '나의 여행 친구'}</span>
                  <GameAvatar
                    characterId={view.characterId}
                    equippedBySlot={equipment}
                    label={label}
                  />
                </div>
                <div className="game-preview-controls">
                  {item ? (
                    <>
                      <p>
                        {item.name} ·{' '}
                        {owned ? '보유' : `미보유 · ${item.rewardDay}회차 첫 통과로 획득`}
                      </p>
                      {owned ? (
                        <button
                          disabled={appearance.busy}
                          onClick={() => {
                            const intent = currentPreview;
                            void appearance
                              .save(view.characterId, {
                                ...view.equippedBySlot,
                                [item.slot]: item.itemId,
                              })
                              .then((saved) => {
                                if (saved) {
                                  restorePreviewFocus.current = true;
                                  setPreview((current) => (current === intent ? null : current));
                                }
                              });
                          }}
                        >
                          {appearance.busy ? '저장 중…' : '착용하기'}
                        </button>
                      ) : null}
                      <button
                        className="secondary"
                        disabled={appearance.busy}
                        onClick={closePreview}
                      >
                        미리보기 취소
                      </button>
                    </>
                  ) : (
                    <p>저장된 모습이에요.</p>
                  )}
                  {appearance.error ? <p role="alert">{appearance.error}</p> : null}
                </div>
              </section>
              <p className="game-wardrobe-note">캐릭터를 바꿔도 모은 장비는 그대로예요.</p>
            </div>
            <div className="game-wardrobe-inventory">
              <div className="game-wardrobe-categories" role="group" aria-label="장비 종류">
                {SLOTS.map((slot) => (
                  <button
                    key={slot}
                    aria-label={`${slotNames[slot]} 장비 보기`}
                    aria-pressed={selectedSlot === slot}
                    aria-controls="wardrobe-inventory"
                    disabled={appearance.busy}
                    onClick={() => {
                      setSelectedSlot(slot);
                      setPreview(null);
                    }}
                  >
                    <EquipmentCategoryIcon slot={slot} />
                    <span>{slotNames[slot]}</span>
                  </button>
                ))}
              </div>
              <section
                id="wardrobe-inventory"
                className="game-closet-slot"
                aria-label={slotNames[selectedSlot]}
              >
                <div className="game-inventory-heading">
                  <p className="learning-eyebrow">나의 장비 상자</p>
                  <h2>{slotNames[selectedSlot]}</h2>
                  <p>잠긴 장비도 눌러서 미리 입어볼 수 있어요.</p>
                </div>
                <div className="game-wardrobe-grid">
                  <button
                    className="game-item-option game-base-option"
                    aria-label={`${slotNames[selectedSlot]} 기본 모습`}
                    data-equipped={!view.equippedBySlot[selectedSlot] || undefined}
                    disabled={appearance.busy}
                    onClick={() => {
                      setPreview(null);
                      void appearance.save(view.characterId, {
                        ...view.equippedBySlot,
                        [selectedSlot]: null,
                      });
                    }}
                  >
                    <span className="game-item-art">
                      <EquipmentIcon itemId={null} />
                    </span>
                    <strong>{slotNames[selectedSlot]} 기본 모습</strong>
                    <span className="game-item-state">
                      {!view.equippedBySlot[selectedSlot] ? '착용 중' : '기본으로 돌아가기'}
                    </span>
                  </button>
                  {view.items
                    .filter((entry) => entry.slot === selectedSlot)
                    .map((entry) => {
                      const hasItem = view.inventory.some(
                        (inventory) => inventory.itemId === entry.itemId && inventory.owned,
                      );
                      return (
                        <button
                          key={entry.itemId}
                          className={`game-item-option${hasItem ? '' : ' game-item-locked'}`}
                          data-equipped={
                            view.equippedBySlot[selectedSlot] === entry.itemId || undefined
                          }
                          aria-label={`${entry.name} 미리보기`}
                          aria-pressed={item?.itemId === entry.itemId}
                          disabled={appearance.busy}
                          onClick={(event) => {
                            previewTrigger.current = event.currentTarget;
                            if (owner)
                              setPreview({
                                owner,
                                epoch: getPendingCommandEpoch(),
                                route: location.key,
                                itemId: entry.itemId,
                              });
                          }}
                        >
                          {!hasItem ? (
                            <span className="game-lock-badge" aria-hidden="true">
                              <svg viewBox="0 0 16 18">
                                <path d="M4 7V5a4 4 0 0 1 8 0v2M2 7h12v9H2zM8 10v3" />
                              </svg>
                            </span>
                          ) : null}
                          <span className="game-item-art" aria-hidden="true">
                            <EquipmentIcon itemId={entry.itemId} slot={selectedSlot} />
                            {!hasItem ? (
                              <>
                                <span className="game-mystery-cloud game-cloud-left" />
                                <span className="game-mystery-cloud game-cloud-right" />
                              </>
                            ) : null}
                          </span>
                          <strong>{entry.name}</strong>
                          <span className="game-item-state">
                            {hasItem
                              ? view.equippedBySlot[selectedSlot] === entry.itemId
                                ? '착용 중'
                                : '보유'
                              : `미보유 · ${entry.rewardDay}회차 첫 통과`}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </section>
            </div>
          </div>
        ) : null}
        {appearance.busy ? <p role="status">외형을 저장하고 있어요.</p> : null}
      </div>
    </section>
  );
}
