import { EquipmentIcon } from './EquipmentIcon';
import { GameAvatar } from './GameAvatar';
import { useSeenTransition } from './useSeenTransition';
import type { GameItem, GameView } from './types';
import type { ReactNode } from 'react';

export function RewardCard({
  item,
  owned,
  onWear,
  wearLabel = '착용하기',
  wearDisabled = false,
  owner,
  contentVersion,
  appearance,
  preview,
}: {
  item: GameItem;
  owned: boolean;
  onWear?: () => void;
  wearLabel?: string;
  wearDisabled?: boolean;
  owner: string | undefined;
  contentVersion: string;
  appearance?: GameView;
  preview?: ReactNode;
}) {
  const revealing = useSeenTransition(owner, contentVersion, 'rewards', {
    [item.itemId]: owned,
  }).includes(item.itemId);
  return (
    <section
      className={`game-reward-card${owned ? '' : ' game-reward-locked'}`}
      aria-label="여행 선물"
      data-revealing={revealing || undefined}
    >
      <div className="game-treasure-stage" role="img" aria-label={item.name}>
        <div className="game-reward-art" aria-hidden="true">
          <EquipmentIcon itemId={item.itemId} slot={item.slot} />
          <img className="game-treasure-chest" src="/game/reward-chest.svg" alt="" />
        </div>
        <span className="game-mystery-cloud game-cloud-left" aria-hidden="true" />
        <span className="game-mystery-cloud game-cloud-right" aria-hidden="true" />
        <span className="game-treasure-spark" aria-hidden="true">
          ✦
        </span>
      </div>
      <div className="game-reward-copy">
        <p className="learning-eyebrow">{owned ? '모은 여행 선물' : '다음 여행 선물'}</p>
        <h2>{item.name}</h2>
        <p>{owned ? '보유한 장비예요.' : `${item.rewardDay}회차 첫 통과로 받아요.`}</p>
        {!owned ? (
          <p className="game-reward-condition">5문항 중 3문항 이상 정답에 도전해요.</p>
        ) : null}
        {owned && onWear ? (
          <button disabled={wearDisabled} onClick={onWear}>
            {wearLabel}
          </button>
        ) : null}
      </div>
      {preview ? (
        <div className="game-reward-character game-reward-preview">{preview}</div>
      ) : appearance ? (
        <div className="game-reward-character">
          <GameAvatar
            characterId={appearance.characterId}
            equippedBySlot={
              owned
                ? { ...appearance.equippedBySlot, [item.slot]: item.itemId }
                : appearance.equippedBySlot
            }
          />
          <p>{owned ? '선물을 입은 모습' : '나의 여행 친구'}</p>
        </div>
      ) : null}
    </section>
  );
}
