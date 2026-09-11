import type { EngineResult as SharedEngineResult } from '@denimcat/shared';

export type SeatId = 'p1' | 'p2' | 'p3' | 'p4';
export type PlayerCount = 2 | 3 | 4;
export type PrizeColor = 'yellow' | 'blue' | 'red' | 'green' | 'purple' | 'orange';

export interface PrizeCard {
  id: string;
  color: PrizeColor;
  points: number;
}

export interface PriceSlot {
  price: number;
  prizes: PrizeCard[];
}

export interface PlayerState {
  seat: SeatId;
  /** Shuffled personal draw pile; hidden from everyone but the owner. Drawn from the end (the "top"). */
  deck: number[];
  /** Currently playable card values (unique, 1-13); hidden from everyone but the owner. */
  hand: number[];
  wonPrizes: PrizeCard[];
}

export interface AuctionBid {
  seat: SeatId;
  cardValues: number[];
  amount: number;
}

export interface AuctionState {
  openerSeat: SeatId;
  /** Seating order starting at openerSeat, wraps around. */
  turnOrder: SeatId[];
  activeSeat: SeatId;
  highestBid: AuctionBid | null;
  /** In the order they passed; index 0 is "the first passer." */
  passedSeats: SeatId[];
  winnerSeat: SeatId | null;
}

export type Phase = 'auction-active' | 'awaiting-prize-choice' | 'awaiting-new-prize-placement' | 'ended';

export interface GameState {
  /** Fixed for the room's lifetime, sized by player count. */
  seats: SeatId[];
  players: Record<SeatId, PlayerState>;
  /** Always exactly 6 slots, ascending by price: index 0 cheapest .. index 5 priciest. */
  priceSlots: PriceSlot[];
  /** Remaining unrevealed prizes; order is a shuffled stack, drawn from the end. */
  prizeDeck: PrizeCard[];
  /**
   * Set the moment a prize is revealed (i.e. as soon as phase becomes
   * 'awaiting-new-prize-placement'), before a slot is chosen for it — the
   * rules say the winner "gets to see the next prize and decide which
   * empty slot to place it in," so it must be visible before that choice,
   * not popped-and-placed as one atomic step. Public once revealed.
   */
  revealedPrize: PrizeCard | null;
  phase: Phase;
  auction: AuctionState;
  /** Multiple seats on a tie. */
  winner: SeatId[] | null;
  /**
   * Indices of the top two price slots that have become legal targets for
   * manual placement (via placeNewPrize) because a prize has naturally
   * drifted into them at least once via shiftDisplay — confirmed with the
   * designer as a permanent unlock, not re-locked when the slot empties out
   * again. Prevents an early auction winner from throwing a prize into a
   * slot nobody can afford yet.
   */
  unlockedUpperSlots: number[];
}

export type { EngineError } from '@denimcat/shared';

/** Bound to this engine's own GameState so every existing call site (just `EngineResult<T>`) is unaffected. */
export type EngineResult<T = undefined> = SharedEngineResult<GameState, T>;
