import { equipmentArt, parseItemId } from './artwork';
import type { Slot } from './types';
import './game.css';

const slotPaths: Record<Slot, string> = {
  face: 'M1 5h5v1h4V5h5v6h-5V8H6v3H1Zm1 2v3h3V7Zm9 0v3h3V7Z',
  hat: 'M5 2h6v1h1v6h3v4H1V9h3V3h1Zm1 2v3h4V4Zm0 4v1h4V8ZM3 11v1h10v-1Z',
  top: 'M5 2h2v2h2V2h2v1h2v2h2v4h-2V8h-1v6H4V8H3v1H1V5h2V3h2Zm1 4v6h4V6H9v1H7V6Z',
  bottom: 'M3 2h10v3h1v9H9v-4H7v4H2V5h1Zm2 2v1h6V4ZM4 7v5h1V9h2V7Zm5 0v2h2v3h1V7Z',
  shoes: 'M2 3h6v5h3v1h2v1h1v1h1v3H2Zm2 2v6h9v-1h-3V9H6V5Zm0 7v1h9v-1Z',
  hand: 'M6 2h4v1h1v3h3v7h-1v1H3v-1H2V6h3V3h1Zm1 2v2h2V4ZM4 8v4h8V8Z',
};

export function EquipmentCategoryIcon({ slot }: { slot: Slot }) {
  return (
    <svg
      className="game-equipment-category-icon"
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d={slotPaths[slot]} fillRule="evenodd" />
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
