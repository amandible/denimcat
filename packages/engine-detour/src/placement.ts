import { BOARD_CELLS } from './board';
import type { CellId } from './board';

/**
 * Narrower than GameState — satisfied by both the engine's own state and
 * the client-facing DetourStateView, so the client can compute legal
 * placements itself (e.g. for board highlighting) without a full GameState.
 */
export interface PlacementState {
  pawnCell: CellId;
  cells: Record<CellId, { value: number }>;
}

export function hasLegalTarget(state: PlacementState, value: number): boolean {
  return BOARD_CELLS.some((cellId) => cellId !== state.pawnCell && state.cells[cellId].value < value);
}

export function isLegalPlacement(state: PlacementState, value: number, target: CellId): boolean {
  if (target === state.pawnCell) return false;
  const cell = state.cells[target];
  if (!cell) return false; // not a real board cell — defense in depth, callers should never pass one
  if (cell.value < value) return true;
  return !hasLegalTarget(state, value);
}
