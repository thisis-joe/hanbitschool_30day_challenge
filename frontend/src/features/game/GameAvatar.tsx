import { useEffect, useRef } from 'react';
import { renderAvatar } from './avatarRenderer';
import { CHARACTER_NAMES, emptyEquipment } from './types';
import type { CharacterId, Equipment } from './types';
import './game.css';

const unequipped = emptyEquipment();
export function GameAvatar({
  characterId,
  equippedBySlot = unequipped,
  className = '',
  label,
}: {
  characterId: CharacterId | null;
  equippedBySlot?: Equipment;
  className?: string;
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { face, hat, top, bottom, shoes, hand } = equippedBySlot;
  useEffect(() => {
    const controller = new AbortController();
    if (canvas.current) {
      void renderAvatar(
        canvas.current,
        characterId ?? 'haru',
        { face, hat, top, bottom, shoes, hand },
        controller.signal,
      ).catch(() => {
        // Keep the last completed picture; no late React state update is needed.
      });
    }
    return () => controller.abort();
  }, [characterId, face, hat, top, bottom, shoes, hand]);
  const name =
    label ?? (characterId ? CHARACTER_NAMES[characterId] : '캐릭터 미선택 (하루 미리보기)');
  return (
    <canvas
      ref={canvas}
      className={`game-avatar ${className}`}
      width={128}
      height={176}
      role="img"
      aria-label={name}
    />
  );
}
