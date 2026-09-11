import type { GameState, PlayerCount, PlayerState, PrizeCard, PrizeColor, SeatId } from './types';
import { shuffle, startAuction } from './state';

const SEATS_BY_COUNT: Record<PlayerCount, SeatId[]> = {
  2: ['p1', 'p2'],
  3: ['p1', 'p2', 'p3'],
  4: ['p1', 'p2', 'p3', 'p4'],
};

/**
 * Repeatedly attempts a draw until its value doesn't collide with anything
 * in `existing`, undoing (returning to the pool) each rejected attempt's
 * cards before retrying — "repeated prices aren't allowed; if one would
 * happen, put those cards back and redraw." Decoupled from the actual
 * pool/shuffle mechanics so the retry behavior itself can be unit tested
 * with a scripted sequence of attempts, independent of real randomness.
 */
export function drawUntilUnique(
  draw: () => { value: number; cards: number[] },
  undo: (cards: number[]) => void,
  existing: number[],
): { value: number; cards: number[] } {
  while (true) {
    const attempt = draw();
    if (!existing.includes(attempt.value)) return attempt;
    undo(attempt.cards);
  }
}

/**
 * The setup procedure for the six price slots: draw 3 individually (always
 * mutually distinct, since they're drawn without replacement from a set of
 * unique-valued cards), then two 2-card sums, then a 3-card sum topped up
 * with a 4th card only if it isn't yet the highest of the five prices
 * already determined. Any sum step whose result repeats an
 * already-determined price is redrawn as a whole unit — its cards go back
 * into the pool first.
 */
export function computePrices(rng: () => number = Math.random): number[] {
  let pool = Array.from({ length: 13 }, (_, i) => i + 1);
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  function draw(count: number): number[] {
    pool = shuffle(pool, rng);
    const drawn = pool.slice(0, count);
    pool = pool.slice(count);
    return drawn;
  }

  function returnToPool(cards: number[]): void {
    pool = [...pool, ...cards];
  }

  const individually = draw(3);

  const price4Attempt = drawUntilUnique(
    () => {
      const cards = draw(2);
      return { value: sum(cards), cards };
    },
    returnToPool,
    individually,
  );
  const price4 = price4Attempt.value;

  const price5Attempt = drawUntilUnique(
    () => {
      const cards = draw(2);
      return { value: sum(cards), cards };
    },
    returnToPool,
    [...individually, price4],
  );
  const price5 = price5Attempt.value;

  const priceSoFar = [...individually, price4, price5];
  const price6Attempt = drawUntilUnique(
    () => {
      const threeCards = draw(3);
      let cards = threeCards;
      let value = sum(threeCards);
      if (value <= Math.max(...priceSoFar)) {
        const fourth = draw(1);
        cards = [...threeCards, ...fourth];
        value += fourth[0];
      }
      return { value, cards };
    },
    returnToPool,
    priceSoFar,
  );
  const price6 = price6Attempt.value;

  return [...individually, price4, price5, price6];
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
