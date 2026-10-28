import { BOARD_CELLS } from '../src/board';
import type { CellId } from '../src/board';
import type { CellState, GameState, PlayerState, SeatId } from '../src/types';

/**
 * Every cell defaults to a uniform high sentinel (99), not a realistic
 * 1-18 neutral deal — so a test overriding only the one or two cells it
 * cares about can reason exactly about what hasLegalTarget/isLegalPlacement/
 * resolveChain will see, without the other 16-17 cells' values silently
 * affecting the result.
 */
function defaultCells(): Record<CellId, CellState> {
  const cells = {} as Record<CellId, CellState>;
  for (const cellId of BOARD_CELLS) {
    cells[cellId] = { value: 99, owner: 'neutral' };
  }
  return cells;
}

export function makePlayer(seat: SeatId, overrides: Partial<PlayerState> = {}): PlayerState {
  const defaultDeckId = seat === 'p1' ? 'A' : seat === 'p2' ? 'B' : seat === 'p3' ? 'C' : 'D';
  return { seat, deckId: defaultDeckId, hand: [], deck: [], score: 0, ...overrides };
}

export function makeState(
  overrides: {
    seats?: SeatId[];
    players?: Partial<Record<SeatId, Partial<PlayerState>>>;
    cells?: Partial<Record<CellId, CellState>>;
    pawnCell?: CellId;
    activeSeat?: SeatId;
    phase?: GameState['phase'];
    winner?: SeatId[] | null;
    log?: string[];
  } = {},
): GameState {
  const seats = overrides.seats ?? ['p1', 'p2'];
  const players = {} as Record<SeatId, PlayerState>;
  for (const seat of seats) {
    players[seat] = makePlayer(seat, overrides.players?.[seat]);
  }
  return {
    seats,
    players,
    cells: { ...defaultCells(), ...overrides.cells },
    pawnCell: overrides.pawnCell ?? '3-4',
    activeSeat: overrides.activeSeat ?? 'p1',
    phase: overrides.phase ?? 'playing',
    winner: overrides.winner ?? null,
    log: overrides.log ?? [],
  };
}
