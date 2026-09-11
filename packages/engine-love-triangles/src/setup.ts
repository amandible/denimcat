import type { GameState, PlayerCount, PlayerState, SeatId } from './types';
import { LINKS } from './maps/map1';
import { shuffle } from './state';

const SEATS_BY_COUNT: Record<PlayerCount, SeatId[]> = {
  2: ['p1', 'p2'],
  3: ['p1', 'p2', 'p3'],
  4: ['p1', 'p2', 'p3', 'p4'],
};

export function dealGame(playerCount: PlayerCount, rng: () => number = Math.random): GameState {
  const seats = SEATS_BY_COUNT[playerCount];

  const deck = shuffle(Object.keys(LINKS), rng);
  const topRow = deck.splice(0, 3);
  const bottomRow = deck.splice(0, 3);

  const players = {} as GameState['players'];
  seats.forEach((seat, i) => {
    // Later seats start with more gems — a catch-up mechanic for turn-order disadvantage.
    const player: PlayerState = { seat, gems: 9 + i, ownedLinks: [] };
    players[seat] = player;
  });

  return {
    seats,
    players,
    topRow,
    bottomRow,
    deck,
    turnOrder: seats,
    // Player 1 always opens, matching the precedent set in both other denimcat games.
    activeSeat: seats[0],
    phase: 'playing',
    winner: null,
    discardPile: [],
  };
}
