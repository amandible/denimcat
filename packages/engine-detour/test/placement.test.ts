import { describe, expect, it } from 'vitest';
import { hasLegalTarget, isLegalPlacement } from '../src/placement';
import { makeState } from './helpers';

describe('isLegalPlacement', () => {
  it('allows covering a strictly lower-valued cell', () => {
    const state = makeState({ cells: { '0-0': { value: 5, owner: 'neutral' } }, pawnCell: '1-0' });
    expect(isLegalPlacement(state, 7, '0-0')).toBe(true);
  });
  it('rejects covering an equal or higher-valued cell when a legal target exists elsewhere', () => {
    const state = makeState({
      cells: { '0-0': { value: 5, owner: 'neutral' }, '0-1': { value: 2, owner: 'neutral' } },
      pawnCell: '1-0',
    });
    expect(isLegalPlacement(state, 5, '0-0')).toBe(false);
  });
  it('never allows the pawn\'s own cell as a target, even if its value is lower', () => {
    const state = makeState({ cells: { '0-0': { value: 1, owner: 'neutral' } }, pawnCell: '0-0' });
    expect(isLegalPlacement(state, 9, '0-0')).toBe(false);
  });
  it('a card with no legal (lower) target anywhere becomes wild on any non-pawn cell', () => {
    const state = makeState({
      cells: { '0-0': { value: 5, owner: 'neutral' }, '0-1': { value: 8, owner: 'neutral' } },
      pawnCell: '1-0',
    });
    // every other cell defaults to the 99 sentinel (see test/helpers.ts) - nothing is lower than 3
    expect(hasLegalTarget(state, 3)).toBe(false);
    expect(isLegalPlacement(state, 3, '0-0')).toBe(true); // wild
    expect(isLegalPlacement(state, 3, '0-1')).toBe(true); // wild
  });
  it('the wild fallback still never allows the pawn\'s own cell', () => {
    const state = makeState({ cells: { '0-0': { value: 5, owner: 'neutral' } }, pawnCell: '0-0' });
    expect(hasLegalTarget(state, 1)).toBe(false);
    expect(isLegalPlacement(state, 1, '0-0')).toBe(false);
  });
});
