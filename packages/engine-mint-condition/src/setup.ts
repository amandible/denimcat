import type { GameState, PlayerCount, PlayerState, PrizeCard, PrizeColor, SeatId } from './types';
import { pushLog, shuffle, startAuction } from './state';

const SEATS_BY_COUNT: Record<PlayerCount, SeatId[]> = {
  2: ['p1', 'p2'],
  3: ['p1', 'p2', 'p3'],
  4: ['p1', 'p2', 'p3', 'p4'],
};

/**
 * v3: the six price slots are fixed values set purely by player count — no
 * randomness at all, replacing the earlier random double-sided-tile method.
 */
const PRICE_SLOTS_BY_COUNT: Record<PlayerCount, readonly number[]> = {
  2: [0, 5, 10, 15, 20, 25],
  3: [5, 10, 15, 20, 25, 30],
  4: [10, 15, 20, 25, 30, 35],
};

export function priceSlotValues(playerCount: PlayerCount): number[] {
  return [...PRICE_SLOTS_BY_COUNT[playerCount]];
}

const BASE_PRIZES: Array<[PrizeColor, number, string]> = [
  ['yellow', 5, 'missing Watergate tapes'],
  ['blue', 4, 'handwritten "I Have A Dream" draft'],
  ['red', 3, 'Vimose Hnefatafl set'],
  ['red', 3, 'Lewis chessman'],
  ['blue', 2, '"The Vengeance of Nitocris" manuscript'],
  ['red', 2, 'Vettweiss-Froitzheim dice tower'],
  ['blue', 2, 'The Mystery of Edwin Drood ending (hoax)'],
  ['yellow', 1, 'Casey Kasem swearing at his staff'],
  ['yellow', 1, 'The "Butcher Cover" LP'],
  ['yellow', 1, 'Once Upon A Time In Shaolin'],
  ['red', 1, 'Visconti-Sforza tarot deck'],
  ['blue', 1, 'A Humument 1st edition'],
];

const THREE_PLAYER_ADDON: Array<[PrizeColor, number, string]> = [
  ['green', 4, 'Inland Steel Barbie'],
  ['green', 3, 'Lego Sears Tower'],
  ['green', 2, 'Green Unicron Optimus Prime'],
  ['green', 0, 'Number 1 Bear'],
  ['purple', 5, "criticism of Ea-Nasir's copper"],
  ['purple', 4, 'letter from Iddin-Sin to Vinu demanding nicer clothes'],
];

const FOUR_PLAYER_ADDON: Array<[PrizeColor, number, string]> = [
  ['purple', 0, 'sock requisition from Vindolanda'],
  ['purple', 0, 'Scots-Roman curse roll'],
  ['orange', 2, 'insect pigment'],
  ['orange', 2, 'laughing automaton'],
  ['orange', 2, 'clown egg'],
  ['orange', 2, 'glass flower'],
];

export function buildPrizePool(playerCount: PlayerCount): PrizeCard[] {
  const list = [...BASE_PRIZES];
  if (playerCount >= 3) list.push(...THREE_PLAYER_ADDON);
  if (playerCount >= 4) list.push(...FOUR_PLAYER_ADDON);
  return list.map(([color, points, name], i) => ({ id: `prize-${i + 1}`, color, points, name }));
}

/** v3: each player's money deck is four 10s, four 5s and four 1s (12 cards, not unique). */
const MONEY_DECK: readonly number[] = [10, 10, 10, 10, 5, 5, 5, 5, 1, 1, 1, 1];

export function dealGame(playerCount: PlayerCount, rng: () => number = Math.random): GameState {
  const seats = SEATS_BY_COUNT[playerCount];

  const prices = priceSlotValues(playerCount);
  const priceSlots = prices.map((price) => ({ price, prizes: [] as PrizeCard[] }));

  const shuffledPrizes = shuffle(buildPrizePool(playerCount), rng);
  // The first three shuffled prizes go into the 2nd/3rd/4th slots (index 1/2/3).
  priceSlots[1].prizes = [shuffledPrizes[0]];
  priceSlots[2].prizes = [shuffledPrizes[1]];
  priceSlots[3].prizes = [shuffledPrizes[2]];
  const prizeDeck = shuffledPrizes.slice(3);

  const players = {} as GameState['players'];
  for (const seat of seats) {
    const deck = shuffle([...MONEY_DECK], rng);
    const hand = [deck.pop() as number, deck.pop() as number];
    const player: PlayerState = { seat, deck, hand, discard: [], wonPrizes: [] };
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
    endgameChoice: null,
    log: [],
  };
  pushLog(state, `Game started with ${seats.length} players: ${seats.join(', ')}.`);
  return state;
}
