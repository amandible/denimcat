import type { Direction } from './types';

export type CellId = string;

const ROWS = 4;
const COLS = 4;

function cellId(row: number, col: number): CellId {
  return `${row}-${col}`;
}

export const BOARD_CELLS: readonly CellId[] = (() => {
  const cells: CellId[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      cells.push(cellId(row, col));
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

/** The board is a torus: moving off one edge wraps to the opposite edge of the same row/column, so every move lands on a real cell. */
export function cellInDirection(cell: CellId, direction: Direction): CellId {
  const [row, col] = cell.split('-').map(Number);
  const [dRow, dCol] = DELTAS[direction];
  const nextRow = (((row + dRow) % ROWS) + ROWS) % ROWS;
  const nextCol = (((col + dCol) % COLS) + COLS) % COLS;
  return cellId(nextRow, nextCol);
}
