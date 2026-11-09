import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatedGameAvatar } from './motion/AnimatedGameAvatar';
import type { CharacterId, Equipment } from './types';

const arrows = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
export function WardrobePlayground({
  characterId,
  equipment,
  label,
  preview,
}: {
  characterId: CharacterId | null;
  equipment: Equipment | undefined;
  label: string;
  preview: boolean;
}) {
  const room = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const point = useRef({ x: 0.5, y: 0.84 });
  const target = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);
  const last = useRef(0);
  const [position, setPosition] = useState(point.current);
  const [moving, setMoving] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const hint = useId();
  function stop() {
    keys.current.clear();
    target.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setMoving(false);
  }
  useEffect(() => {
    const blur = () => stop();
    window.addEventListener('blur', blur);
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  function step(now: number) {
    const el = room.current;
    if (!el) return;
    const dt = Math.min(0.04, (now - last.current) / 1000);
    last.current = now;
    let dx = Number(keys.current.has('ArrowRight')) - Number(keys.current.has('ArrowLeft'));
    let dy = Number(keys.current.has('ArrowDown')) - Number(keys.current.has('ArrowUp'));
    const destination = target.current;
    if (!keys.current.size && destination) {
      dx = (destination.x - point.current.x) * el.clientWidth;
      dy = (destination.y - point.current.y) * el.clientHeight;
      if (Math.hypot(dx, dy) < 5) {
        stop();
        return;
      }
    }
    const length = Math.hypot(dx, dy);
    if (!length) {
      stop();
      return;
    }
    const speed = Math.min(160 * dt, destination && !keys.current.size ? length : Infinity);
    const avatar = el.querySelector('canvas');
    const margin = Math.min(0.45, ((avatar?.clientWidth ?? 100) / 2 + 6) / el.clientWidth);
    point.current = {
      x: Math.max(
        margin,
        Math.min(1 - margin, point.current.x + ((dx / length) * speed) / el.clientWidth),
      ),
      y: Math.max(
        0.69,
        Math.min(0.93, point.current.y + ((dy / length) * speed) / el.clientHeight),
      ),
    };
    if (dx) setFacingLeft(dx < 0);
    setPosition(point.current);
    setMoving(true);
    if (
      destination &&
      !keys.current.size &&
      (point.current.x === margin ||
        point.current.x === 1 - margin ||
        point.current.y === 0.69 ||
        point.current.y === 0.93)
    ) {
      target.current = null;
    }
    frame.current = requestAnimationFrame(step);
  }
  function start() {
    if (frame.current) return;
    last.current = performance.now();
    frame.current = requestAnimationFrame(step);
  }
  function touchDestination(clientX: number, clientY: number) {
    const box = room.current?.getBoundingClientRect();
    if (!box) return;
    target.current = {
      x: Math.max(0, Math.min(1, (clientX - box.left) / box.width)),
      y: Math.max(0.69, Math.min(0.93, (clientY - box.top) / box.height)),
    };
    start();
  }
  return (
    <>
      <div
        ref={room}
        className="game-wardrobe-room game-wardrobe-playground"
        role="group"
        aria-label="캐릭터 움직이기"
        aria-describedby={hint}
        tabIndex={0}
        onBlur={stop}
        onKeyDown={(event) => {
          if (!arrows.has(event.key)) return;
          event.preventDefault();
          target.current = null;
          keys.current.add(event.key);
          start();
        }}
        onKeyUp={(event) => {
          if (!arrows.has(event.key)) return;
          event.preventDefault();
          keys.current.delete(event.key);
          if (!keys.current.size) stop();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          touchDestination(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            touchDestination(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={stop}
      >
        {preview ? <span className="game-tag">미리 입어보는 중</span> : null}
        <div
          className="game-wardrobe-walker"
          data-moving={moving}
          style={
            {
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
              '--walker-facing': facingLeft ? -1 : 1,
            } as CSSProperties
          }
        >
          <AnimatedGameAvatar
            characterId={characterId}
            equippedBySlot={equipment}
            motion={moving ? 'walk' : 'idle'}
            loopWalk
            label={label}
          />
        </div>
      </div>
      <p className="game-walk-hint" id={hint}>
        방을 누른 뒤 방향키 ↑ ↓ ← → 또는 바닥을 터치해서 움직여 보세요.
      </p>
    </>
  );
}
