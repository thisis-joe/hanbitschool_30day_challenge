import { EquipmentIcon } from './EquipmentIcon';
import type { GameItem } from './types';

export function RewardCard({
  item,
  owned,
  onWear,
}: {
  item: GameItem;
  owned: boolean;
  onWear?: () => void;
}) {
  return (
    <section
      className={`game-reward-card${owned ? '' : ' game-reward-locked'}`}
      aria-label="여행 선물"
    >
      <div className="game-reward-art">
        <EquipmentIcon itemId={item.itemId} slot={item.slot} />
      </div>
      <div>
        <p className="learning-eyebrow">{owned ? '모은 여행 선물' : '다음 여행 선물'}</p>
        <h2>{item.name}</h2>
        <p>{owned ? '보유한 장비예요.' : `${item.rewardDay}회차 첫 통과로 받아요.`}</p>
        {owned && onWear ? <button onClick={onWear}>착용하기</button> : null}
      </div>
    </section>
  );
}
