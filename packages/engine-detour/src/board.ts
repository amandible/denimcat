import type { Direction } from './types';

export type CellId = string;

const ROWS = 4;
const COLS = 5;
/** The two corners cut from the otherwise-full 5x4 rectangle — see design/detour/rules.md. */
const MISSING: CellId[] = ['0-4', '3-0'];

function cellId(row: number, col: number): CellId {
  return `${row}-${col}`;
}

function isOnBoard(row: number, col: number): boolean {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  return !MISSING.includes(cellId(row, col));
}

export const BOARD_CELLS: readonly CellId[] = (() => {
  const cells: CellId[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (isOnBoard(row, col)) cells.push(cellId(row, col));
    }
  }
  return cells;
})();

const DELTAS: Record<Direction, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export function cellInDirection(cell: CellId, direction: Direction): CellId | null {
  const [row, col] = cell.split('-').map(Number);
  const [dRow, dCol] = DELTAS[direction];
  const nextRow = row + dRow;
  const nextCol = col + dCol;
  return isOnBoard(nextRow, nextCol) ? cellId(nextRow, nextCol) : null;
}
