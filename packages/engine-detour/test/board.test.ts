import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, cellInDirection } from '../src/board';

describe('cellInDirection', () => {
  it('has exactly 18 cells', () => {
    expect(BOARD_CELLS).toHaveLength(18);
  });
  it('moves up/down/left/right within the interior', () => {
    expect(cellInDirection('1-1', 'up')).toBe('0-1');
    expect(cellInDirection('1-1', 'down')).toBe('2-1');
    expect(cellInDirection('1-1', 'left')).toBe('1-0');
    expect(cellInDirection('1-1', 'right')).toBe('1-2');
  });
  it('returns null moving up from row 0', () => {
    expect(cellInDirection('0-0', 'up')).toBeNull();
  });
  it('returns null moving onto the missing top-right cell (row 0, col 4)', () => {
    expect(cellInDirection('0-3', 'right')).toBeNull();
  });
  it('returns null moving onto the missing bottom-left cell (row 3, col 0)', () => {
    expect(cellInDirection('3-1', 'left')).toBeNull();
  });
  it('returns null moving left from the row-0 left edge and right from the row-3 right edge', () => {
    expect(cellInDirection('0-0', 'left')).toBeNull();
    expect(cellInDirection('3-4', 'right')).toBeNull();
  });
  it('returns null moving down from row 3 and up from row 0 at every column that exists in both', () => {
    for (const col of [1, 2, 3]) {
      expect(cellInDirection(`3-${col}`, 'down')).toBeNull();
      expect(cellInDirection(`0-${col}`, 'up')).toBeNull();
    }
  });
  it('returns null stepping onto a missing corner from the adjacent interior cell, not just from the opposite edge — the asymmetric case the two cut corners create', () => {
    // '2-0' is a normal interior-column cell (row 2 has all 5 columns) one
    // row above the missing bottom-left corner - this is NOT the same case
    // as the row-3-to-row-4 off-board test above.
    expect(cellInDirection('2-0', 'down')).toBeNull();
    // '1-4' is a normal interior-column cell one row below the missing
    // top-right corner.
    expect(cellInDirection('1-4', 'up')).toBeNull();
  });
  it('returns null moving left from column 0 and right from column 4 at the interior rows (not just the already-tested row 0/row 3 edges)', () => {
    expect(cellInDirection('1-0', 'left')).toBeNull();
    expect(cellInDirection('2-0', 'left')).toBeNull();
    expect(cellInDirection('1-4', 'right')).toBeNull();
    expect(cellInDirection('2-4', 'right')).toBeNull();
  });
});
