import type { GameState, PlayerCount, PlayerState, PrizeCard, PrizeColor, SeatId } from './types';
import { shuffle, startAuction } from './state';

const SEATS_BY_COUNT: Record<PlayerCount, SeatId[]> = {
  2: ['p1', 'p2'],
  3: ['p1', 'p2', 'p3'],
  4: ['p1', 'p2', 'p3', 'p4'],
};

/**
 * The setup procedure for the six price slots, given an already-ordered
 * deck to draw from sequentially: 3 individually, then 2+2 summed pairs,
 * then a 3-card sum topped up with a 4th card only if it isn't yet the
 * highest of the five prices already determined. Pulled out as a pure
 * function of a fixed draw order (rather than folded into `computePrices`)
 * so both branches can be tested directly with a hand-picked order, without
 * needing to reverse-engineer what a given `rng` shuffles the deck into.
 */
export function pricesFromDrawOrder(order: number[]): number[] {
  let cursor = 0;
  const draw = (count: number): number[] => {
    const cards = order.slice(cursor, cursor + count);
    cursor += count;
    return cards;
  };
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  const individually = draw(3);
  const price4 = sum(draw(2));
  const price5 = sum(draw(2));
  let price6 = sum(draw(3));

  const highestSoFar = Math.max(...individually, price4, price5);
  if (price6 <= highestSoFar) {
    price6 += draw(1)[0];
  }

  return [...individually, price4, price5, price6];
}

export function computePrices(rng: () => number = Math.random): number[] {
  const deck = shuffle(
    Array.from({ length: 13 }, (_, i) => i + 1),
    rng,
  );
  return pricesFromDrawOrder(deck);
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

  const openerSeat = seats[Math.floor(rng() * seats.length)];

  return {
    seats,
    players,
    priceSlots,
    prizeDeck,
    revealedPrize: null,
    phase: 'auction-active',
    auction: startAuction(seats, openerSeat),
    winner: null,
  };
}
