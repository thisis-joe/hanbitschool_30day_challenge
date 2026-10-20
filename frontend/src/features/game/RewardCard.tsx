import { useRef } from 'react';
import { AcquisitionCinematic } from './AcquisitionCinematic';
import {
  acquisitionDuration,
  inlineAcquisitionDuration,
  useAcquisitionSequence,
} from './useAcquisitionSequence';
import { EquipmentIcon } from './EquipmentIcon';
import { GameAvatar } from './GameAvatar';
import { useSeenTransition } from './useSeenTransition';
import type { GameItem, GameView } from './types';
import type { ReactNode } from 'react';
import { CelebrationBurst } from './CelebrationBurst';
import './celebrations.css';

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
  acquisitionId,
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
  /** A server-confirmed grant, including its acquisition time; never inferred from ownership. */
  acquisitionId?: string;
}) {
  const card = useRef<HTMLElement>(null);
  const transitioned = useSeenTransition(
    owner,
    contentVersion,
    'rewards',
    {
      [item.itemId]: owned,
    },
    { durationMs: acquisitionDuration.item + inlineAcquisitionDuration.item },
  ).includes(item.itemId);
  const acquired = useSeenTransition(
    owner,
    contentVersion,
    'item-awards',
    acquisitionId && owned ? { [acquisitionId]: true } : {},
    { celebrateInitial: true, durationMs: acquisitionDuration.item + inlineAcquisitionDuration.item },
  ).includes(acquisitionId ?? '');
  const identity = JSON.stringify([owner, contentVersion, acquisitionId ?? item.itemId]);
  const sequence = useAcquisitionSequence(transitioned || acquired, identity);
  const revealing = sequence.inline;
  return (
    <section
      ref={card}
      tabIndex={-1}
      className={`game-reward-card${owned ? '' : ' game-reward-locked'}`}
      aria-label="여행 선물"
      data-revealing={revealing || undefined}
    >
      {sequence.cinematic ? (
        <AcquisitionCinematic
          key={identity}
          prize={{ kind: 'item', item }}
          onComplete={sequence.complete}
          returnFocus={card}
        />
      ) : null}
      <div className="game-treasure-stage" role="img" aria-label={item.name}>
        {revealing ? <CelebrationBurst key={acquisitionId ?? item.itemId} /> : null}
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
        {owned ? (
          <p className="game-item-acquired" role={revealing ? 'status' : undefined}>
            {revealing ? '아이템 획득!' : '획득 완료'}
          </p>
        ) : null}
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
