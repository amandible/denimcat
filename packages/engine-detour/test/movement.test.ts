import { describe, expect, it } from 'vitest';
import { resolveChain } from '../src/movement';
import { makeState } from './helpers';

describe('resolveChain', () => {
  it('moves one cell with no chain when the landing cell is not the active player\'s', () => {
    const state = makeState({
      pawnCell: '1-1',
      cells: { '0-1': { value: 3, owner: 'neutral' } },
    });
    const result = resolveChain(state, 'p1', 'up');
    expect(result).toEqual({ pawnCell: '0-1', pointsScored: 0 });
  });

  it('scores a point and keeps chaining across the active player\'s own cards', () => {
    const state = makeState({
      pawnCell: '2-1',
      players: { p1: { deckId: 'A' } }, // card value 1 -> up (deck A)
      cells: {
        '1-1': { value: 1, owner: 'p1' }, // first landing: p1's own, arrow up (card 1)
        '0-1': { value: 5, owner: 'neutral' }, // chain lands here next, stops (not p1's)
      },
    });
    const result = resolveChain(state, 'p1', 'up');
    expect(result).toEqual({ pawnCell: '0-1', pointsScored: 1 });
  });

  it('wraps around the board edge instead of stopping there, scoring if the wrapped-to cell is the active player\'s own', () => {
    const state = makeState({
      pawnCell: '0-0',
      players: { p1: { deckId: 'A' } },
      cells: { '3-0': { value: 2, owner: 'p1' } }, // directly "above" 0-0 via wraparound
    });
    const result = resolveChain(state, 'p1', 'up');
    // 0-0 -> up wraps to 3-0 (p1's own, +1 point) -> direction becomes
    // directionFor('A', 2) = 'left' -> wraps from 3-0 to 3-3, the
    // 99-sentinel neutral default -> chain stops there.
    expect(result).toEqual({ pawnCell: '3-3', pointsScored: 1 });
  });

  it('a chain may legally return to the pawn\'s OWN starting cell (not "visited" until actually moved onto this turn), scoring once and then stopping there since that cell is neutral by default', () => {
    // p1 owns '1-1' only; its deck-A value-4 direction is 'down', pointing
    // straight back at the pawn's own starting cell '2-1'. The starting
    // cell was never "moved onto this turn" (the pawn was already sitting
    // there before the turn began), so returning to it is NOT blocked by
    // the repeat-visit rule — it's a fresh landing. '2-1' itself is left at
    // its default-helper neutral value (never overridden to 'p1' here), so
    // the chain stops there without a second point.
    const state = makeState({
      pawnCell: '2-1',
      players: { p1: { deckId: 'A' } },
      cells: {
        '1-1': { value: 4, owner: 'p1' }, // deck A, value 4 -> down
      },
    });
    const result = resolveChain(state, 'p1', 'up');
    // 2-1 -> 1-1 (owned by p1, +1 point; visited={'1-1'}) -> direction
    // becomes down (card value 4) -> 1-1 -> 2-1: '2-1' is NOT in visited
    // (only '1-1' is), so this is allowed; '2-1' is neutral (never
    // overridden), so the chain stops there with no second point.
    expect(result).toEqual({ pawnCell: '2-1', pointsScored: 1 });
  });

  it('stops a true mid-chain loop (A -> B -> A) without re-scoring A, keeping the first point', () => {
    const state = makeState({
      pawnCell: '2-1',
      players: { p1: { deckId: 'A' } },
      cells: {
        '1-1': { value: 1, owner: 'p1' }, // deck A, value 1 -> up (toward '0-1')
        '0-1': { value: 4, owner: 'p1' }, // deck A, value 4 -> down (back toward '1-1')
      },
    });
    const result = resolveChain(state, 'p1', 'up');
    // 2-1 -> 1-1 (+1, visited {1-1}) -> 0-1 (+1, visited {1-1,0-1}) -> would
    // re-enter 1-1 (already visited this chain) -> stop at 0-1.
    expect(result).toEqual({ pawnCell: '0-1', pointsScored: 2 });
  });
});
