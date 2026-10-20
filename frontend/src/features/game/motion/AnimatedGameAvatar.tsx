import { useEffect, useRef, useState } from 'react';
import { CHARACTER_NAMES, emptyEquipment } from '../types';
import type { CharacterId, Equipment } from '../types';
import { buildAvatarRig, paintAvatarPose } from './rig';
import type { AvatarRig } from './rig';
import { samplePose, MOTION_MS } from './poses';
import type { AvatarMotion } from './poses';
import { GameAvatar } from '../GameAvatar';
import '../game.css';

const bare = emptyEquipment();
export function AnimatedGameAvatar({
  characterId,
  equippedBySlot = bare,
  motion,
  animate = true,
}: {
  characterId: CharacterId | null;
  equippedBySlot?: Equipment;
  motion: AvatarMotion;
  animate?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rig, setRig] = useState<AvatarRig | null>(null);
  const [failed, setFailed] = useState(false);
  const { face, hat, top, bottom, shoes, hand } = equippedBySlot;
  useEffect(() => {
    const controller = new AbortController();
    void buildAvatarRig(
      characterId ?? 'haru',
      { face, hat, top, bottom, shoes, hand },
      controller.signal,
    )
      .then((next) => {
        if (!controller.signal.aborted) {
          setRig(next);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [characterId, face, hat, top, bottom, shoes, hand]);
  useEffect(() => {
    if (!rig || failed) return;
    let frame = 0;
    const since = performance.now();
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const paint = (now: number) => {
      if (!canvas.current) return;
      const elapsed = now - since,
        reduced = media?.matches || !animate;
      paintAvatarPose(canvas.current, rig, samplePose(motion, elapsed, reduced));
      canvas.current.dataset.ready = 'true';
      const running =
        motion === 'walk' ||
        (motion === 'happy' && elapsed < MOTION_MS.happy) ||
        (motion === 'sad' && elapsed < MOTION_MS.sad);
      if (!reduced && running) frame = requestAnimationFrame(paint);
    };
    const refresh = () => {
      cancelAnimationFrame(frame);
      paint(performance.now());
    };
    refresh();
    media?.addEventListener('change', refresh);
    return () => {
      cancelAnimationFrame(frame);
      media?.removeEventListener('change', refresh);
    };
  }, [rig, failed, motion, animate]);
  if (failed)
    return (
      <GameAvatar
        characterId={characterId}
        equippedBySlot={equippedBySlot}
        className="game-avatar-motion-fallback"
      />
    );
  return (
    <canvas
      ref={canvas}
      className="game-avatar game-avatar-articulated"
      width={176}
      height={216}
      data-motion={motion}
      role="img"
      aria-label={characterId ? CHARACTER_NAMES[characterId] : '캐릭터 미선택 (하루 미리보기)'}
    />
  );
}
