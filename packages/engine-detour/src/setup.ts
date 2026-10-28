import { BOARD_CELLS } from './board';
import { shuffle } from './state';
import type { CellState, DeckId, GameState, PlayerCount, PlayerState, SeatId } from './types';
import type { CellId } from './board';

const ALL_SEATS: SeatId[] = ['p1', 'p2', 'p3', 'p4'];
const ALL_DECKS: DeckId[] = ['A', 'B', 'C', 'D'];

export function dealGame(playerCount: PlayerCount, rng: () => number = Math.random): GameState {
  const seats = ALL_SEATS.slice(0, playerCount);

  const shuffledValues = shuffle(
    Array.from({ length: 18 }, (_, i) => i + 1),
    rng,
  );
  const cells = {} as Record<CellId, CellState>;
  BOARD_CELLS.forEach((cellId, i) => {
    cells[cellId] = { value: shuffledValues[i], owner: 'neutral' };
  });
  const pawnCell = BOARD_CELLS.find((cellId) => cells[cellId].value === 18)!;

  const deckIds = shuffle(ALL_DECKS, rng).slice(0, playerCount);
  const players = {} as Record<SeatId, PlayerState>;
  seats.forEach((seat, i) => {
    const deckValues = shuffle(
      Array.from({ length: 20 }, (_, v) => v + 1),
      rng,
    );
    players[seat] = {
      seat,
      deckId: deckIds[i],
      hand: deckValues.slice(0, 3),
      deck: deckValues.slice(3),
      score: 0,
    };
  });

  return {
    seats,
    players,
    cells,
    pawnCell,
    activeSeat: 'p1',
    phase: 'playing',
    winner: null,
    log: [],
  };
}
