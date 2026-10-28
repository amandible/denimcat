import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, cellInDirection } from '../src/board';

describe('cellInDirection', () => {
  it('has exactly 16 cells, a full 4x4 grid', () => {
    expect(BOARD_CELLS).toHaveLength(16);
  });

  it('moves up/down/left/right within the interior', () => {
    expect(cellInDirection('1-1', 'up')).toBe('0-1');
    expect(cellInDirection('1-1', 'down')).toBe('2-1');
    expect(cellInDirection('1-1', 'left')).toBe('1-0');
    expect(cellInDirection('1-1', 'right')).toBe('1-2');
  });

  it('wraps to the opposite row when moving up from row 0 or down from row 3', () => {
    expect(cellInDirection('0-2', 'up')).toBe('3-2');
    expect(cellInDirection('3-2', 'down')).toBe('0-2');
  });

  it('wraps to the opposite column when moving left from column 0 or right from column 3', () => {
    expect(cellInDirection('1-0', 'left')).toBe('1-3');
    expect(cellInDirection('1-3', 'right')).toBe('1-0');
  });

  it('wraps independently on rows and columns from every corner', () => {
    expect(cellInDirection('0-0', 'up')).toBe('3-0');
    expect(cellInDirection('0-0', 'left')).toBe('0-3');
    expect(cellInDirection('3-3', 'down')).toBe('0-3');
    expect(cellInDirection('3-3', 'right')).toBe('3-0');
  });
});
