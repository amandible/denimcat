import type { GameState, LinkId, NodeId, SeatId } from './types';
import { LINKS } from './maps/map1';

function buildAdjacency(ownedLinks: LinkId[]): Partial<Record<NodeId, NodeId[]>> {
  const adjacency: Partial<Record<NodeId, NodeId[]>> = {};
  const addEdge = (a: NodeId, b: NodeId) => {
    (adjacency[a] ??= []).push(b);
  };
  for (const id of ownedLinks) {
    const link = LINKS[id];
    addEdge(link.a, link.b);
    addEdge(link.b, link.a);
  }
  return adjacency;
}

function findConnectedComponents(adjacency: Partial<Record<NodeId, NodeId[]>>): NodeId[][] {
  const visited = new Set<NodeId>();
  const components: NodeId[][] = [];
  for (const start of Object.keys(adjacency) as NodeId[]) {
    if (visited.has(start)) continue;
    const component: NodeId[] = [];
    const stack: NodeId[] = [start];
    visited.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      component.push(node);
      for (const neighbor of adjacency[node] ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

/** Largest simple cycle (by node count) within one connected component — brute-force DFS, trivial at <=10 nodes. */
function largestCycleSize(component: NodeId[], adjacency: Partial<Record<NodeId, NodeId[]>>): number {
  let best = 0;

  function dfs(start: NodeId, current: NodeId, visited: Set<NodeId>, depth: number): void {
    for (const neighbor of adjacency[current] ?? []) {
      if (neighbor === start) {
        if (depth >= 3) best = Math.max(best, depth);
        continue;
      }
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      dfs(start, neighbor, visited, depth + 1);
      visited.delete(neighbor);
    }
  }

  for (const start of component) {
    dfs(start, start, new Set([start]), 1);
  }
  return best;
}

export interface ScoreBreakdown {
  /** Size of the winning candidate loop (a real cycle, or 1 for the trivial single-node case). */
  loopSize: number;
  /** Other nodes reachable via the player's own edges from that loop — always componentSize - loopSize. */
  reachable: number;
  total: number;
}

/**
 * For each player: the maximum, over every candidate "loop," of
 * `2 x (loop size) + (other nodes reachable via their own edges from that
 * loop)`. A candidate loop is either a genuine simple cycle (>=3 nodes) in
 * one of the player's connected components, or — confirmed with the
 * designer — any single node treated as a trivial "1-node loop," legal
 * even with zero owned edges anywhere.
 *
 * Since reachability from any node in a connected component reaches the
 * whole component, this reduces algebraically to `loopSize + componentSize`
 * for whichever component/loop combination scores highest — no need to
 * separately enumerate reachable sets.
 */
export function scoreBreakdownForPlayer(state: GameState, seat: SeatId): ScoreBreakdown {
  const ownedLinks = state.players[seat].ownedLinks;
  const adjacency = buildAdjacency(ownedLinks);
  const components = findConnectedComponents(adjacency);

  // The trivial 1-node loop is always legal, even with zero owned edges.
  let best: ScoreBreakdown = { loopSize: 1, reachable: 0, total: 2 };
  for (const component of components) {
    const edgeCount = component.reduce((sum, node) => sum + (adjacency[node]?.length ?? 0), 0) / 2;
    const hasCycle = edgeCount >= component.length; // a connected graph is a tree iff edges = nodes - 1
    const loopSize = hasCycle ? largestCycleSize(component, adjacency) : 1;
    const total = loopSize + component.length;
    if (total > best.total) {
      best = { loopSize, reachable: component.length - loopSize, total };
    }
  }
  return best;
}

export function scoreForPlayer(state: GameState, seat: SeatId): number {
  return scoreBreakdownForPlayer(state, seat).total;
}

export function computeFinalScores(state: GameState): Record<SeatId, number> {
  return Object.fromEntries(state.seats.map((seat) => [seat, scoreForPlayer(state, seat)])) as Record<SeatId, number>;
}

export function computeScoreBreakdowns(state: GameState): Record<SeatId, ScoreBreakdown> {
  return Object.fromEntries(state.seats.map((seat) => [seat, scoreBreakdownForPlayer(state, seat)])) as Record<
    SeatId,
    ScoreBreakdown
  >;
}

/** Highest network score wins; ties broken by remaining gems; still tied is a shared victory. */
export function determineWinners(state: GameState): SeatId[] {
  const scores = computeFinalScores(state);
  const maxScore = Math.max(...state.seats.map((seat) => scores[seat]));
  const topScorers = state.seats.filter((seat) => scores[seat] === maxScore);
  if (topScorers.length === 1) return topScorers;

  const maxGems = Math.max(...topScorers.map((seat) => state.players[seat].gems));
  return topScorers.filter((seat) => state.players[seat].gems === maxGems);
}

/** The display (both rows) is completely empty — which can only happen once the deck is also exhausted. */
export function isGameOver(state: GameState): boolean {
  return state.topRow.every((slot) => slot === null) && state.bottomRow.every((slot) => slot === null);
}

export function applyGameEndIfDone(state: GameState): GameState {
  if (!isGameOver(state)) return state;
  return { ...state, phase: 'ended', winner: determineWinners(state) };
}
