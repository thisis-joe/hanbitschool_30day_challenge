import { equipmentArt, parseItemId } from './artwork';
import type { Slot } from './types';
import './game.css';

const slotPaths: Record<Slot, string> = {
  face: 'M2 8h7v7H2Zm13 0h7v7h-7ZM9 10h6M2 8 1 5m21 3 1-3',
  hat: 'M5 16V8a7 7 0 0 1 14 0v8M2 16h20v4H2ZM5 12h14',
  top: 'm8 3-6 4 3 6 3-2v10h8V11l3 2 3-6-6-4a4 4 0 0 1-8 0Z',
  bottom: 'M5 3h14l2 18h-7l-2-11-2 11H3ZM5 7h14',
  shoes: 'M3 6h7v6l10 3 1 5H3ZM3 16h17M10 12l-2 3',
  hand: 'M4 9h16l1 12H3ZM8 9V6a4 4 0 0 1 8 0v3',
};

export function EquipmentCategoryIcon({ slot }: { slot: Slot }) {
  return (
    <svg
      className="game-equipment-category-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={slotPaths[slot]} />
    </svg>
  );
}

export function EquipmentIcon({ itemId, slot }: { itemId: string | null; slot?: Slot }) {
  const item = itemId ? parseItemId(itemId) : null;
  const art = item && (!slot || slot === item.slot) ? equipmentArt(itemId!) : null;
  if (!item || !art)
    return (
      <svg
        className="game-equipment-icon"
        viewBox="0 0 96 96"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <path d="M22 21h53v54H22Z" fill="none" stroke="#c5c8ae" strokeWidth="3" />
        <path d="m28 68 39-39" stroke="#c5c8ae" strokeWidth="3" />
      </svg>
    );
  const bounds =
    item.slot === 'hand' && item.value < 4
      ? [
          [4, 22, 25, 32],
          [2, 21, 28, 34],
          [0, 23, 32, 28],
        ][item.value - 1]
      : item.slot === 'face'
        ? [4, 6, 80, 23]
        : [0, 0, art.width, art.height];
  const [bx, by, bw, bh] = bounds,
    scale = Math.min(84 / bw, 82 / bh);
  const x = (96 - bw * scale) / 2 - bx * scale,
    y = (96 - bh * scale) / 2 - by * scale;
  // Only fixed local whitelist artwork reaches this SVG sink. User/server text
  // is never used as markup, an SVG attribute, or an HTML fragment.
  return (
    <svg
      className="game-equipment-icon"
      viewBox="0 0 96 96"
      aria-hidden="true"
      shapeRendering={art.rendering ?? 'crispEdges'}
    >
      <g
        transform={`translate(${x} ${y}) scale(${scale})`}
        dangerouslySetInnerHTML={{ __html: art.markup }}
      />
    </svg>
  );
}
