import type { LinkId, NodeId } from './types';
import { LINKS, NODES } from './maps/map1';

interface Point {
  x: number;
  y: number;
}

function orientation(p: Point, q: Point, r: Point): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

/**
 * True if segment p1-p2 properly crosses segment p3-p4 (strict interior
 * intersection). The map's own guarantee — no three points colinear or
 * nearly colinear — means we never need to handle touching/overlapping
 * edge cases here.
 */
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function sharesEndpoint(a: NodeId, b: NodeId, c: NodeId, d: NodeId): boolean {
  return a === c || a === d || b === c || b === d;
}

function computeCrosses(): Record<LinkId, LinkId[]> {
  const ids = Object.keys(LINKS);
  const crosses: Record<LinkId, LinkId[]> = {};
  for (const id of ids) crosses[id] = [];

  for (let i = 0; i < ids.length; i++) {
    const linkA = LINKS[ids[i]];
    for (let j = i + 1; j < ids.length; j++) {
      const linkB = LINKS[ids[j]];
      if (sharesEndpoint(linkA.a, linkA.b, linkB.a, linkB.b)) continue; // fanning out from a shared node is normal
      if (segmentsCross(NODES[linkA.a], NODES[linkA.b], NODES[linkB.a], NODES[linkB.b])) {
        crosses[ids[i]].push(ids[j]);
        crosses[ids[j]].push(ids[i]);
      }
    }
  }
  return crosses;
}

/** Which links geometrically cross which other links, on the fixed map — computed once at module load. */
export const CROSSES: Record<LinkId, LinkId[]> = computeCrosses();
