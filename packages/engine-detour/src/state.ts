import type { CellState, GameState, PlayerState, SeatId } from './types';
import type { CellId } from './board';

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clonePlayer(p: PlayerState): PlayerState {
  return { seat: p.seat, deckId: p.deckId, hand: [...p.hand], deck: [...p.deck], score: p.score };
}

function cloneCell(c: CellState): CellState {
  return { value: c.value, owner: c.owner };
}

export function cloneState(state: GameState): GameState {
  const players = {} as Record<SeatId, PlayerState>;
  for (const seat of state.seats) {
    players[seat] = clonePlayer(state.players[seat]);
  }
  const cells = {} as Record<CellId, CellState>;
  for (const [cellId, cell] of Object.entries(state.cells)) {
    cells[cellId] = cloneCell(cell);
  }
  return {
    seats: [...state.seats],
    players,
    cells,
    pawnCell: state.pawnCell,
    activeSeat: state.activeSeat,
    phase: state.phase,
    winner: state.winner ? [...state.winner] : null,
    log: [...state.log],
  };
}

export const MAX_LOG_ENTRIES = 300;

/** Appends one human-readable play-by-play line — see GameState.log's doc comment. Mutates in place; caller is expected to already be working on a clone (or brand-new state). */
export function pushLog(state: GameState, message: string): void {
  state.log.push(message);
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }
}
