import { BOARD_CELLS } from './board';
import type { CellId } from './board';
import type { GameState } from './types';

export function hasLegalTarget(state: GameState, value: number): boolean {
  return BOARD_CELLS.some((cellId) => cellId !== state.pawnCell && state.cells[cellId].value < value);
}

export function isLegalPlacement(state: GameState, value: number, target: CellId): boolean {
  if (target === state.pawnCell) return false;
  const cell = state.cells[target];
  if (!cell) return false; // not a real board cell — defense in depth, callers should never pass one
  if (cell.value < value) return true;
  return !hasLegalTarget(state, value);
}
