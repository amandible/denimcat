import type { GameState, NodeId, SeatId } from '@denimcat/engine-love-triangles';
import { NODES, LINKS } from '@denimcat/engine-love-triangles';

const SEAT_COLOR_VAR: Record<SeatId, string> = {
  p1: 'var(--seat-1)',
  p2: 'var(--seat-2)',
  p3: 'var(--seat-3)',
  p4: 'var(--seat-4)',
};

const VIEWBOX = 400;
const PADDING = 40;

type Point = { x: number; y: number };

function buildTransform(nodes: Record<NodeId, Point>): (p: Point) => Point {
  const coords = Object.values(nodes);
  const xs = coords.map((p) => p.x);
  const ys = coords.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  const scale = (VIEWBOX - PADDING * 2) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // SVG's y-axis grows downward; the map's data has y growing upward, so flip it.
  return (p) => ({ x: VIEWBOX / 2 + (p.x - cx) * scale, y: VIEWBOX / 2 - (p.y - cy) * scale });
}

const toSvg = buildTransform(NODES);

export function MapBoard({
  state,
  crossingLinkIds = [],
}: {
  state: GameState;
  /** Owned lines currently called out as "the reason" a display card is about to be removed — see useLoveTrianglesActions's pendingRemoval. */
  crossingLinkIds?: string[];
}) {
  const ownerByLink = new Map<string, SeatId>();
  for (const seat of state.seats) {
    for (const linkId of state.players[seat].ownedLinks) {
      ownerByLink.set(linkId, seat);
    }
  }
  const crossingSet = new Set(crossingLinkIds);

  return (
    <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} style={{ width: '100%', maxWidth: 420, aspectRatio: '1 / 1' }}>
      {[...ownerByLink.entries()].map(([linkId, seat]) => {
        const link = LINKS[linkId];
        const a = toSvg(NODES[link.a]);
        const b = toSvg(NODES[link.b]);
        const isCrossing = crossingSet.has(linkId);
        return (
          <line
            key={linkId}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={isCrossing ? 'orange' : SEAT_COLOR_VAR[seat]}
            strokeWidth={isCrossing ? 5 : 3}
            strokeLinecap="round"
          />
        );
      })}
      {(Object.entries(NODES) as [NodeId, Point][]).map(([id, coord]) => {
        const p = toSvg(coord);
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={7} fill="var(--panel-bg)" stroke="var(--border)" strokeWidth={2} />
            <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize={12} fill="var(--muted)">
              {id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
