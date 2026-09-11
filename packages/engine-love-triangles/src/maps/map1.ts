import type { LinkId, NodeId } from '../types';

/** Canonical link id: endpoints alphabetically ordered, so each pair has exactly one id. */
export function linkId(a: NodeId, b: NodeId): LinkId {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export interface LinkDef {
  a: NodeId;
  b: NodeId;
  baseCost: number;
}

/** Transcribed from design/love-triangles/lt-coords.txt. */
export const NODES: Record<NodeId, { x: number; y: number }> = {
  A: { x: -1.8954, y: 3.8172 },
  B: { x: 1.9975, y: 2.4848 },
  C: { x: -3.6623, y: 0.9138 },
  D: { x: 0.2344, y: 0.874 },
  E: { x: 2.349, y: 0.4342 },
  F: { x: -1.0654, y: -0.6805 },
  G: { x: 3.0203, y: -1.244 },
  H: { x: 0.2411, y: -2.6989 },
  I: { x: -1.318, y: -3.1639 },
  J: { x: 2.5366, y: -3.9882 },
};

/** Transcribed from design/love-triangles/lt-cards.pdf — all 45 pairs (a complete graph on 10 nodes). */
const RAW_LINKS: [NodeId, NodeId, number][] = [
  ['A', 'B', 4],
  ['A', 'C', 3],
  ['A', 'D', 3],
  ['A', 'E', 5],
  ['A', 'F', 4],
  ['A', 'G', 7],
  ['A', 'H', 6],
  ['A', 'I', 7],
  ['A', 'J', 8],
  ['B', 'C', 5],
  ['B', 'D', 2],
  ['B', 'E', 2],
  ['B', 'F', 4],
  ['B', 'G', 3],
  ['B', 'H', 5],
  ['B', 'I', 6],
  ['B', 'J', 6],
  ['C', 'D', 3],
  ['C', 'E', 6],
  ['C', 'F', 3],
  ['C', 'G', 7],
  ['C', 'H', 5],
  ['C', 'I', 4],
  ['C', 'J', 7],
  ['D', 'E', 2],
  ['D', 'F', 2],
  ['D', 'G', 3],
  ['D', 'H', 3],
  ['D', 'I', 4],
  ['D', 'J', 5],
  ['E', 'F', 3],
  ['E', 'G', 1],
  ['E', 'H', 3],
  ['E', 'I', 5],
  ['E', 'J', 4],
  ['F', 'G', 4],
  ['F', 'H', 2],
  ['F', 'I', 2],
  ['F', 'J', 4],
  ['G', 'H', 3],
  ['G', 'I', 4],
  ['G', 'J', 2],
  ['H', 'I', 1],
  ['H', 'J', 2],
  ['I', 'J', 3],
];

export const LINKS: Record<LinkId, LinkDef> = Object.fromEntries(
  RAW_LINKS.map(([a, b, baseCost]) => [linkId(a, b), { a, b, baseCost }]),
);
