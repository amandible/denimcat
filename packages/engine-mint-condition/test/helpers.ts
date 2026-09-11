import type { AuctionState, GameState, PlayerState, PriceSlot, PrizeCard, SeatId } from '../src/types';

export function prize(id: string, color: PrizeCard['color'], points: number): PrizeCard {
  return { id, color, points };
}

export function makePlayer(seat: SeatId, overrides: Partial<PlayerState> = {}): PlayerState {
  return { seat, deck: [], hand: [], wonPrizes: [], ...overrides };
}

export function makeAuction(overrides: Partial<AuctionState> = {}): AuctionState {
  return {
    openerSeat: 'p1',
    turnOrder: ['p1', 'p2'],
    activeSeat: 'p1',
    highestBid: null,
    passedSeats: [],
    winnerSeat: null,
    ...overrides,
  };
}

function defaultSlots(): PriceSlot[] {
  return [1, 2, 3, 4, 5, 6].map((price) => ({ price, prizes: [] }));
}

export function makeState(
  overrides: {
    seats?: SeatId[];
    players?: Partial<Record<SeatId, Partial<PlayerState>>>;
    priceSlots?: PriceSlot[];
    prizeDeck?: PrizeCard[];
    revealedPrize?: PrizeCard | null;
    phase?: GameState['phase'];
    auction?: Partial<AuctionState>;
    winner?: SeatId[] | null;
    unlockedUpperSlots?: number[];
  } = {},
): GameState {
  const seats = overrides.seats ?? ['p1', 'p2'];
  const players = {} as GameState['players'];
  for (const seat of seats) {
    players[seat] = makePlayer(seat, overrides.players?.[seat]);
  }
  return {
    seats,
    players,
    priceSlots: overrides.priceSlots ?? defaultSlots(),
    prizeDeck: overrides.prizeDeck ?? [],
    revealedPrize: overrides.revealedPrize ?? null,
    phase: overrides.phase ?? 'auction-active',
    auction: makeAuction({ turnOrder: seats, activeSeat: seats[0], openerSeat: seats[0], ...overrides.auction }),
    winner: overrides.winner ?? null,
    unlockedUpperSlots: overrides.unlockedUpperSlots ?? [4, 5],
  };
}
