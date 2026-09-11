import type { GameState, LinkId, SeatId } from './types';
import type { CostBreakdown } from './presence';

/**
 * An ordered log of what happened during `buyLink`, meant for the client
 * to animate through rather than snap straight to the final state — the
 * whole point being (per the designer) that an automatic card removal is
 * a small event worth seeing happen, not an invisible/instant transition.
 * Each event carries the full GameState snapshot at that moment, so a
 * client can render any step directly without duplicating engine logic.
 */
export interface PurchasedEvent {
  kind: 'purchased';
  seat: SeatId;
  linkId: LinkId;
  cost: CostBreakdown;
  state: GameState;
}

export interface RefilledEvent {
  kind: 'refilled';
  state: GameState;
}

export interface RemovedUnplayableEvent {
  kind: 'removed_unplayable';
  linkId: LinkId;
  crossedLinks: LinkId[];
  paidTo: Partial<Record<SeatId, number>>;
  state: GameState;
}

export type LoveTrianglesEvent = PurchasedEvent | RefilledEvent | RemovedUnplayableEvent;
