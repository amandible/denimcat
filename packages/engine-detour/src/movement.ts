import { cellInDirection } from './board';
import type { CellId } from './board';
import { directionFor } from './decks';
import type { Direction, GameState, SeatId } from './types';

export function resolveChain(
  state: GameState,
  seat: SeatId,
  firstDirection: Direction,
): { pawnCell: CellId; pointsScored: number } {
  let current = state.pawnCell;
  const visited = new Set<CellId>();
  let direction = firstDirection;
  let pointsScored = 0;

  while (true) {
    const next = cellInDirection(current, direction);
    if (visited.has(next)) break;
    current = next;
    visited.add(current);
    const cell = state.cells[current];
    if (cell.owner !== seat) break;
    pointsScored += 1;
    direction = directionFor(state.players[seat].deckId, cell.value);
  }

  return { pawnCell: current, pointsScored };
}
