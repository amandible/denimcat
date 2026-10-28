import { describe, expect, it } from 'vitest';
import { toView } from '../src/contract';
import { makeState } from './helpers';

describe('toView', () => {
  it('reveals the viewing seat\'s own hand', () => {
    const state = makeState({ players: { p1: { hand: [3, 7, 12] } } });
    const view = toView(state, 'p1');
    expect(view.players.p1.hand).toEqual([3, 7, 12]);
    expect(view.players.p1.handSize).toBe(3);
  });

  it('hides another seat\'s hand contents but shows its size, deckId, and score', () => {
    const state = makeState({ players: { p2: { hand: [1, 2], deckId: 'C', score: 4 } } });
    const view = toView(state, 'p1');
    expect(view.players.p2.hand).toBeUndefined();
    expect(view.players.p2.handSize).toBe(2);
    expect(view.players.p2.deckId).toBe('C');
    expect(view.players.p2.score).toBe(4);
  });

  it('hides every hand from a spectator', () => {
    const state = makeState({ seats: ['p1', 'p2'], players: { p1: { hand: [1] }, p2: { hand: [2] } } });
    const view = toView(state, 'spectator');
    expect(view.players.p1.hand).toBeUndefined();
    expect(view.players.p2.hand).toBeUndefined();
  });

  it('the board, pawn position, and log are fully public', () => {
    const state = makeState({ cells: { '0-0': { value: 9, owner: 'p1' } }, pawnCell: '0-0', log: ['x'] });
    const view = toView(state, 'spectator');
    expect(view.cells['0-0']).toEqual({ value: 9, owner: 'p1' });
    expect(view.pawnCell).toBe('0-0');
    expect(view.log).toEqual(['x']);
  });
});
