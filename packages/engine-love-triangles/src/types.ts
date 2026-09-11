import type { EngineResult as SharedEngineResult } from '@denimcat/shared';

export type SeatId = 'p1' | 'p2' | 'p3' | 'p4';
export type PlayerCount = 2 | 3 | 4;

export type NodeId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

/** Canonical form `${a}-${b}` with endpoints alphabetically ordered — see maps/map1.ts's `linkId`. */
export type LinkId = string;

export interface PlayerState {
  seat: SeatId;
  gems: number;
  /** Links this seat owns, drawn in their own color. */
  ownedLinks: LinkId[];
}

export type Phase = 'playing' | 'ended';

export interface GameState {
  /** Fixed for the room's lifetime, sized by player count. */
  seats: SeatId[];
  players: Record<SeatId, PlayerState>;
  /** Only the top row is buyable; the bottom row previews what's coming. Either row's slot is `null` once the deck can no longer refill it. */
  topRow: (LinkId | null)[];
  bottomRow: (LinkId | null)[];
  /** Remaining unrevealed link cards; order is a shuffled stack, drawn from the end. */
  deck: LinkId[];
  turnOrder: SeatId[];
  activeSeat: SeatId;
  phase: Phase;
  /** Multiple seats on a tie. */
  winner: SeatId[] | null;
  /** Links removed from the game after becoming unplayable (crossed an already-drawn line) — public, so players can see what's gone. */
  discardPile: LinkId[];
}

export type { EngineError } from '@denimcat/shared';

/** Bound to this engine's own GameState so every call site (just `EngineResult<T>`) is unaffected. */
export type EngineResult<T = undefined> = SharedEngineResult<GameState, T>;
