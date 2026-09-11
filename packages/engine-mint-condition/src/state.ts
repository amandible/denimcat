import type { AuctionState, GameState, PlayerState, PriceSlot, SeatId } from './types';

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Reorders `seats` to start at `opener` and wrap around in the same relative order. */
export function rotateFrom(seats: SeatId[], opener: SeatId): SeatId[] {
  const idx = seats.indexOf(opener);
  return [...seats.slice(idx), ...seats.slice(0, idx)];
}

/** Builds a fresh auction with `opener` acting first and nothing yet bid or passed. */
export function startAuction(seats: SeatId[], opener: SeatId): AuctionState {
  return {
    openerSeat: opener,
    turnOrder: rotateFrom(seats, opener),
    activeSeat: opener,
    highestBid: null,
    passedSeats: [],
    winnerSeat: null,
  };
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    seat: p.seat,
    deck: [...p.deck],
    hand: [...p.hand],
    wonPrizes: p.wonPrizes.map((prize) => ({ ...prize })),
  };
}

function cloneSlot(slot: PriceSlot): PriceSlot {
  return { price: slot.price, prizes: slot.prizes.map((prize) => ({ ...prize })) };
}

function cloneAuction(a: AuctionState): AuctionState {
  return {
    openerSeat: a.openerSeat,
    turnOrder: [...a.turnOrder],
    activeSeat: a.activeSeat,
    highestBid: a.highestBid ? { seat: a.highestBid.seat, cardValues: [...a.highestBid.cardValues], amount: a.highestBid.amount } : null,
    passedSeats: [...a.passedSeats],
    winnerSeat: a.winnerSeat,
  };
}

export function cloneState(state: GameState): GameState {
  const players = {} as GameState['players'];
  for (const seat of state.seats) {
    players[seat] = clonePlayer(state.players[seat]);
  }
  return {
    seats: [...state.seats],
    players,
    priceSlots: state.priceSlots.map(cloneSlot),
    prizeDeck: state.prizeDeck.map((p) => ({ ...p })),
    revealedPrize: state.revealedPrize ? { ...state.revealedPrize } : null,
    phase: state.phase,
    auction: cloneAuction(state.auction),
    winner: state.winner ? [...state.winner] : null,
    unlockedUpperSlots: [...state.unlockedUpperSlots],
    discardPile: state.discardPile.map((p) => ({ ...p })),
  };
}
