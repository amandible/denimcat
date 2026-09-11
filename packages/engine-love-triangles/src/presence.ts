import type { GameState, LinkId, NodeId, SeatId } from './types';
import { LINKS } from './maps/map1';

/** A seat is "present" at a node if they own any link incident to it. */
export function isPresent(state: GameState, seat: SeatId, node: NodeId): boolean {
  return state.players[seat].ownedLinks.some((id) => {
    const link = LINKS[id];
    return link.a === node || link.b === node;
  });
}

export interface CostBreakdown {
  total: number;
  paidToBank: number;
  paidToOpponents: Partial<Record<SeatId, number>>;
}

/**
 * Base cost plus one gem per (player, endpoint-node) pair where that player
 * is already present at that node — paid to the bank when it's the buyer's
 * own presence, or to that specific opponent otherwise. Not deduped per
 * player: an opponent present at both endpoints is paid twice, once per
 * node (unlike the crossing-compensation rule, which is deduped).
 *
 * Confirmed against the designer's own worked example: connecting B-C
 * (base 4) when the buyer is present at both B and C, and Green is present
 * at C, costs 7 total — 6 to the bank (4 base + 2 for the buyer's own
 * presence at B and C), 1 to Green.
 */
export function effectiveCost(state: GameState, id: LinkId, buyer: SeatId): CostBreakdown {
  const link = LINKS[id];
  let paidToBank = link.baseCost;
  const paidToOpponents: Partial<Record<SeatId, number>> = {};

  for (const node of [link.a, link.b]) {
    for (const seat of state.seats) {
      if (!isPresent(state, seat, node)) continue;
      if (seat === buyer) {
        paidToBank += 1;
      } else {
        paidToOpponents[seat] = (paidToOpponents[seat] ?? 0) + 1;
      }
    }
  }

  const total = paidToBank + Object.values(paidToOpponents).reduce((sum, n) => sum + (n ?? 0), 0);
  return { total, paidToBank, paidToOpponents };
}
