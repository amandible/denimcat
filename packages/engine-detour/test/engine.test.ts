import { describe, expect, it } from 'vitest';
import { playCard } from '../src/engine';
import { makeState } from './helpers';

describe('playCard', () => {
  it('rejects a play from a seat whose turn it is not', () => {
    const state = makeState({ activeSeat: 'p1', players: { p2: { hand: [5] } } });
    const result = playCard(state, 'p2', 5, '0-0');
    expect(result.ok).toBe(false);
  });

  it('rejects a card not in the acting seat\'s hand', () => {
    const state = makeState({ activeSeat: 'p1', players: { p1: { hand: [3] } } });
    const result = playCard(state, 'p1', 9, '0-0');
    expect(result.ok).toBe(false);
  });

  it('a legal play removes the card from hand, covers the target, draws a replacement, and advances the turn', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      pawnCell: '1-0',
      players: { p1: { hand: [7], deck: [12], deckId: 'A' }, p2: { hand: [], deck: [] } },
      cells: { '0-0': { value: 3, owner: 'neutral' } },
    });
    const result = playCard(state, 'p1', 7, '0-0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.hand).toEqual([12]); // drew the replacement
    expect(result.state.cells['0-0']).toMatchObject({ value: 7, owner: 'p1' });
    expect(result.state.activeSeat).toBe('p2');
  });

  it('ends the game and declares a winner once every seat\'s hand and deck are empty', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      pawnCell: '1-0',
      players: {
        p1: { hand: [7], deck: [], score: 0, deckId: 'A' },
        p2: { hand: [], deck: [], score: 0 },
      },
      cells: { '0-0': { value: 3, owner: 'neutral' } },
    });
    const result = playCard(state, 'p1', 7, '0-0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('ended');
    expect(result.state.winner).not.toBeNull();
  });
});
