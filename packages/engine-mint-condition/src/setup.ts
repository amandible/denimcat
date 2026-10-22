import type { GameState, PlayerCount, PlayerState, PrizeCard, PrizeColor, SeatId } from './types';
import { pushLog, shuffle, startAuction } from './state';

const SEATS_BY_COUNT: Record<PlayerCount, SeatId[]> = {
  2: ['p1', 'p2'],
  3: ['p1', 'p2', 'p3'],
  4: ['p1', 'p2', 'p3', 'p4'],
};

/**
 * Six fixed double-sided physical tiles, each printed with two possible
 * prices — replaces the earlier card-draw-and-sum method, which the
 * designer found produced too wide a spread of possible price sets for a
 * reliably balanced game. Every face value across all twelve is already
 * distinct, so (unlike the old method) there's no possibility of a
 * repeated price to guard against.
 */
const PRICE_TILE_FACES: ReadonlyArray<readonly [number, number]> = [
  [2, 4],
  [5, 9],
  [7, 11],
  [13, 15],
  [16, 20],
  [22, 24],
];

/** The setup procedure for the six price slots: flip each of the six tiles above to a random one of its two faces. */
export function computePrices(rng: () => number = Math.random): number[] {
  return PRICE_TILE_FACES.map(([low, high]) => (rng() < 0.5 ? low : high));
}

const BASE_PRIZES: Array<[PrizeColor, number]> = [
  ['yellow', 5],
  ['blue', 4],
  ['red', 3],
  ['red', 3],
  ['blue', 2],
  ['red', 2],
  ['blue', 2],
  ['yellow', 1],
  ['yellow', 1],
  ['yellow', 1],
  ['red', 1],
  ['blue', 1],
];

const THREE_PLAYER_ADDON: Array<[PrizeColor, number]> = [
  ['green', 4],
  ['green', 3],
  ['green', 2],
  ['green', 0],
  ['purple', 5],
  ['purple', 4],
];

const FOUR_PLAYER_ADDON: Array<[PrizeColor, number]> = [
  ['purple', 0],
  ['purple', 0],
  ['orange', 2],
  ['orange', 2],
  ['orange', 2],
  ['orange', 2],
];

export function buildPrizePool(playerCount: PlayerCount): PrizeCard[] {
  const list = [...BASE_PRIZES];
  if (playerCount >= 3) list.push(...THREE_PLAYER_ADDON);
  if (playerCount >= 4) list.push(...FOUR_PLAYER_ADDON);
  return list.map(([color, points], i) => ({ id: `prize-${i + 1}`, color, points }));
}

export function dealGame(playerCount: PlayerCount, rng: () => number = Math.random): GameState {
  const seats = SEATS_BY_COUNT[playerCount];

  const prices = computePrices(rng).slice().sort((a, b) => a - b);
  const priceSlots = prices.map((price) => ({ price, prizes: [] as PrizeCard[] }));

  const shuffledPrizes = shuffle(buildPrizePool(playerCount), rng);
  // The first three shuffled prizes go into the 2nd/3rd/4th slots (index 1/2/3).
  priceSlots[1].prizes = [shuffledPrizes[0]];
  priceSlots[2].prizes = [shuffledPrizes[1]];
  priceSlots[3].prizes = [shuffledPrizes[2]];
  const prizeDeck = shuffledPrizes.slice(3);

  const players = {} as GameState['players'];
  for (const seat of seats) {
    const deck = shuffle(
      Array.from({ length: 13 }, (_, i) => i + 1),
      rng,
    );
    const hand = [deck.pop() as number, deck.pop() as number];
    const player: PlayerState = { seat, deck, hand, wonPrizes: [] };
    players[seat] = player;
  }

  // Player 1 always opens the first auction (matches Hyper Bloom's
  // "Red always goes first" precedent) rather than a random seat — more
  // intuitive than a coin flip nobody can see the result of ahead of time.
  const openerSeat = seats[0];

  const state: GameState = {
    seats,
    players,
    priceSlots,
    prizeDeck,
    revealedPrize: null,
    phase: 'auction-active',
    auction: startAuction(seats, openerSeat),
    winner: null,
    unlockedUpperSlots: [],
    discardPile: [],
    log: [],
  };
  pushLog(state, `Game started with ${seats.length} players: ${seats.join(', ')}.`);
  return state;
}
