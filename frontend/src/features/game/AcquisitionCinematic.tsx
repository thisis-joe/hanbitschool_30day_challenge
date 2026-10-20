import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { EquipmentIcon } from './EquipmentIcon';
import type { GameItem } from './types';
import { acquisitionDuration } from './useAcquisitionSequence';
import './acquisition-cinematic.css';

const sparks = Array.from({ length: 64 }, (_, i) => {
  const angle = (i / 64) * Math.PI * 2;
  const radius = 32 + ((i * 17) % 34);
  return {
    '--flight-x': `${Math.cos(angle) * radius}vmin`,
    '--flight-y': `${Math.sin(angle) * radius}vmin`,
    '--flight-delay': `${(i % 8) * 42}ms`,
    '--flight-delay-xp': `${(i % 8) * 21}ms`,
    '--flight-turn': `${(i % 2 ? 1 : -1) * (90 + i * 11)}deg`,
    '--spark-size': `${4 + (i % 4) * 3}px`,
  } as CSSProperties;
});

function OpeningChest() {
  return (
    <div className="acquisition-chest" aria-hidden="true">
      <div className="acquisition-chest-light" />
      <svg className="acquisition-chest-base" viewBox="0 0 240 160">
        <ellipse cx="120" cy="146" rx="105" ry="10" fill="#030e22" opacity=".7" />
        <path
          d="m22 78 21-15h154l21 15-10 65H32Z"
          fill="#683a29"
          stroke="#291f26"
          strokeWidth="5"
        />
        <path d="M34 85h172l-8 48H42Z" fill="#b56b38" />
        <path d="M44 96h151v7H44Zm0 24h149v5H44Z" fill="#75412d" />
        <path
          d="m25 79 20-12h150l20 12-13 14H37Z"
          fill="#fff2ba"
          stroke="#edb952"
          strokeWidth="6"
        />
        <path
          d="M48 91h19v48H48Zm125 0h19v48h-19Z"
          fill="#ffd46a"
          stroke="#9f692c"
          strokeWidth="3"
        />
        <path d="M36 134h167v9H36Z" fill="#edb952" />
        <path d="M105 88h30v33l-15 10-15-10Z" fill="#ffe595" stroke="#9b672c" strokeWidth="3" />
        <path d="m120 96 8 11-8 13-8-13Z" fill="#62dfc0" stroke="#276f6f" strokeWidth="2" />
        <path d="M52 98h5v5h-5Zm125 0h5v5h-5ZM52 125h5v5h-5Zm125 0h5v5h-5Z" fill="#fff4ba" />
      </svg>
      <div className="acquisition-chest-lid">
        <svg viewBox="0 0 240 160">
          <path
            d="M23 83V58q0-35 34-35h126q34 0 34 35v25Z"
            fill="#b5793c"
            stroke="#36282a"
            strokeWidth="5"
          />
          <path d="M29 72V58q0-29 29-29h124q29 0 29 29v14Z" fill="#d59a49" />
          <path
            d="M49 26h18v54H49Zm124 0h18v54h-18Z"
            fill="#ffe393"
            stroke="#a76e2b"
            strokeWidth="3"
          />
          <path d="M25 74h190v11H25Z" fill="#ffdb7a" stroke="#a76e2b" strokeWidth="3" />
          <path d="M76 35h88v4H76Z" fill="#ffe5a0" opacity=".7" />
          <path d="m120 37 15 17-15 17-15-17Z" fill="#ffdf7f" stroke="#9b672c" strokeWidth="3" />
          <path d="m120 44 8 10-8 10-8-10Z" fill="#c4fff0" />
        </svg>
      </div>
    </div>
  );
}

type Prize = { kind: 'xp'; amount: number; level: number } | { kind: 'item'; item: GameItem };

export function AcquisitionCinematic({
  prize,
  onComplete,
  returnFocus,
}: {
  prize: Prize;
  onComplete: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const duration = acquisitionDuration[prize.kind];

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const destination = returnFocus.current;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    // Older browsers can still present the finite overlay without the dialog API.
    if (node.showModal) node.showModal();
    else node.setAttribute('open', '');
    if (prize.kind === 'xp') node.focus();
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const preferenceChanged = () => {
      if (motion?.matches) onComplete();
    };
    motion?.addEventListener?.('change', preferenceChanged);
    const timeout = window.setTimeout(onComplete, duration);
    return () => {
      window.clearTimeout(timeout);
      motion?.removeEventListener?.('change', preferenceChanged);
      node.close?.();
      document.documentElement.style.overflow = previousOverflow;
      if (destination?.isConnected) destination.focus();
    };
  }, [duration, onComplete, prize.kind, returnFocus]);

  return createPortal(
    <dialog
      ref={dialog}
      tabIndex={-1}
      className={`acquisition-cinematic acquisition-${prize.kind}`}
      aria-label={prize.kind === 'item' ? '아이템 획득 연출' : '경험치 획득 연출'}
      style={{ '--cinema-duration': `${duration}ms` } as CSSProperties}
      onCancel={(event) => {
        event.preventDefault();
        if (prize.kind === 'item') onComplete();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          if (prize.kind === 'item') event.currentTarget.querySelector('button')?.focus();
          else event.currentTarget.focus();
        }
      }}
    >
      <div className="acquisition-atmosphere" aria-hidden="true" />
      <div className="acquisition-stage" aria-hidden="true">
        <div className="acquisition-aura" />
        <div className="acquisition-rays" />
        <div className="acquisition-orbit acquisition-orbit-outer" />
        <div className="acquisition-orbit acquisition-orbit-inner" />
        <div className="acquisition-flash" />
        <div className="acquisition-shockwave" />
        <div className="acquisition-shockwave acquisition-shockwave-late" />
        <div className="acquisition-sparks">
          {sparks.map((style, i) => (
            <span className="acquisition-spark" key={i} style={style} />
          ))}
        </div>
        {prize.kind === 'item' ? (
          <>
            <OpeningChest />
            <div className="acquisition-prize">
              <div className="acquisition-prize-float">
                <EquipmentIcon itemId={prize.item.itemId} slot={prize.item.slot} />
                <span className="acquisition-prize-glint">✦</span>
                <span className="acquisition-prize-glint acquisition-prize-glint-small">✦</span>
              </div>
            </div>
          </>
        ) : (
          <div className="acquisition-xp-medal">
            <span>✦</span>
          </div>
        )}
      </div>
      <div className="acquisition-caption">
        <p className="acquisition-eyebrow">
          {prize.kind === 'item' ? '새로운 여행 선물' : '정답의 빛이 모였어요'}
        </p>
        <h2>{prize.kind === 'item' ? '아이템 획득!' : '경험치 획득!'}</h2>
        <p className="acquisition-name">
          {prize.kind === 'item' ? (
            prize.item.name
          ) : (
            <>
              +{prize.amount}
              <span> XP</span>
            </>
          )}
        </p>
        <p className="acquisition-detail">
          {prize.kind === 'item'
            ? '새로운 장비로 모험을 이어가요'
            : `LEVEL ${prize.level} · 한 걸음 더 성장했어요`}
        </p>
      </div>
      {prize.kind === 'item' ? (
        <button className="acquisition-skip" onClick={onComplete} autoFocus>
          연출 건너뛰기 <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </dialog>,
    document.body,
  );
}
