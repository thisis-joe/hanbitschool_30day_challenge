import { equipmentArt, parseItemId } from './artwork';
import type { Slot } from './types';
import './game.css';

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
      shapeRendering="crispEdges"
    >
      <g
        transform={`translate(${x} ${y}) scale(${scale})`}
        dangerouslySetInnerHTML={{ __html: art.markup }}
      />
    </svg>
  );
}
